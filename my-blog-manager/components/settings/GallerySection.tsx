import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../ToastProvider';

type PicBedProvider = 'dusays' | 'cloudflare-imgbed';

type PicBedProfile = {
  name: string;
  url: string;
  token: string;
};

type GallerySectionProps = {
  formData: {
    picBedProvider?: string;
    picBedName?: string;
    picBedUrl?: string;
    picBedToken?: string;
    picBedProfiles?: Partial<Record<PicBedProvider, Partial<PicBedProfile>>>;
  };
  handleUpdate: (field: string, value: unknown) => void;
  pushToQueue: (label: string, key?: string, value?: unknown) => void;
};

const PROVIDERS: Array<{
  id: PicBedProvider;
  name: string;
  badge: string;
  description: string;
  urlPlaceholder: string;
}> = [
  {
    id: 'dusays',
    name: 'Dusays 图床',
    badge: '兰空兼容',
    description: '保留原有 /api/v1/profile 与 /api/v1/upload 接口。',
    urlPlaceholder: 'https://pic.dusays.com',
  },
  {
    id: 'cloudflare-imgbed',
    name: 'CloudFlare-ImgBed',
    badge: 'Cloudflare R2',
    description: '通过 CloudFlare-ImgBed 的上传接口写入 R2，并返回自定义图床域名。',
    urlPlaceholder: 'https://imgbed.helloyuki.cn',
  },
];

const DEFAULT_PROFILES: Record<PicBedProvider, PicBedProfile> = {
  dusays: {
    name: 'Dusays 图床',
    url: '',
    token: '',
  },
  'cloudflare-imgbed': {
    name: 'CloudFlare-ImgBed',
    url: 'https://imgbed.helloyuki.cn',
    token: '',
  },
};

export default function GallerySection({ formData, handleUpdate, pushToQueue }: GallerySectionProps) {
  const { showToast } = useToast();
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean, msg: string } | null>(null);

  const provider: PicBedProvider = formData.picBedProvider === 'cloudflare-imgbed'
    ? 'cloudflare-imgbed'
    : 'dusays';
  const profiles: Record<PicBedProvider, PicBedProfile> = {
    dusays: {
      ...DEFAULT_PROFILES.dusays,
      name: formData.picBedName || DEFAULT_PROFILES.dusays.name,
      url: formData.picBedUrl || '',
      token: formData.picBedToken || '',
      ...(formData.picBedProfiles?.dusays || {}),
    },
    'cloudflare-imgbed': {
      ...DEFAULT_PROFILES['cloudflare-imgbed'],
      ...(formData.picBedProfiles?.['cloudflare-imgbed'] || {}),
    },
  };
  const currentProfile = profiles[provider];
  const currentProvider = PROVIDERS.find(item => item.id === provider) || PROVIDERS[0];

  const updateProfile = (field: keyof PicBedProfile, value: string) => {
    handleUpdate('picBedProfiles', {
      ...profiles,
      [provider]: {
        ...currentProfile,
        [field]: value,
      },
    });
  };

  const selectProvider = (nextProvider: PicBedProvider) => {
    handleUpdate('picBedProfiles', profiles);
    handleUpdate('picBedProvider', nextProvider);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    const url = currentProfile.url.trim();
    const token = currentProfile.token.trim();

    if (!url || !token) {
      showToast('请完整填写当前图床的 API 地址和 Token！', 'warning');
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    showToast(`正在测试 ${currentProvider.name}...`, 'info');

    try {
      const configRes = await fetch(`/backend_config.json?t=${Date.now()}`);
      const configData = await configRes.json();

      const res = await fetch(`http://127.0.0.1:${configData.api_port}/api/picbed/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, url, token }),
      });

      const data = await res.json();
      setTestResult({ success: data.success, msg: data.message });

      if (data.success) {
        showToast(`✅ ${currentProvider.name} 测试通过`, 'success');
      } else {
        showToast(`❌ ${data.message || 'Token 无效或服务异常'}`, 'error');
      }
    } catch {
      showToast('无法连接到本地 Python 引擎', 'error');
      setTestResult({ success: false, msg: '桌面引擎连接失败，请检查终端日志' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    if (!currentProfile.url.trim() || !currentProfile.token.trim()) {
      showToast('当前图床的 API 地址和 Token 不能为空！', 'error');
      return;
    }
    pushToQueue(`更新图床配置（${currentProvider.name}）`);
  };

  const endpointPreview = provider === 'cloudflare-imgbed'
    ? `${currentProfile.url.replace(/\/+$/, '') || currentProvider.urlPlaceholder}/upload?uploadChannel=cfr2`
    : `${currentProfile.url.replace(/\/+$/, '') || currentProvider.urlPlaceholder}/api/v1/upload`;

  return (
    <motion.section
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl border border-white/50 dark:border-slate-800/50 rounded-[40px] p-8 shadow-2xl"
    >
      <div className="mb-8">
        <h2 className="text-xl font-black text-slate-800 dark:text-white">🖼️ 图床引擎设置</h2>
        <p className="mt-2 text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">
          两套图床配置会分别保存，切换当前图床不会覆盖另一套地址和 Token。
        </p>
      </div>

      <div className="mb-8 grid gap-3 md:grid-cols-2">
        {PROVIDERS.map(item => {
          const active = item.id === provider;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => selectProvider(item.id)}
              className={`rounded-3xl border p-5 text-left transition-all ${
                active
                  ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                  : 'border-slate-200/80 bg-white/35 hover:border-indigo-300 hover:bg-white/60 dark:border-slate-700 dark:bg-slate-800/30 dark:hover:border-indigo-500/60'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className={`text-sm font-black ${active ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-100'}`}>
                  {item.name}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${active ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300'}`}>
                  {active ? '当前使用' : item.badge}
                </span>
              </div>
              <p className="mt-3 text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">
                {item.description}
              </p>
            </button>
          );
        })}
      </div>

      <div className="max-w-2xl space-y-6">
        <div>
          <label className="ml-1 text-[10px] font-black uppercase text-slate-400">图床名称标识</label>
          <input
            type="text"
            value={currentProfile.name}
            onChange={event => updateProfile('name', event.target.value)}
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white/50 px-4 py-3 text-sm font-bold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200"
          />
        </div>

        <div>
          <label className="ml-1 text-[10px] font-black uppercase text-slate-400">API 接口地址（URL）</label>
          <input
            type="url"
            placeholder={currentProvider.urlPlaceholder}
            value={currentProfile.url}
            onChange={event => updateProfile('url', event.target.value)}
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white/50 px-4 py-3 text-sm text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200"
          />
          <p className="ml-1 mt-2 break-all text-[11px] font-medium text-slate-400">
            上传端点：{endpointPreview}
          </p>
        </div>

        <div>
          <label className="ml-1 text-[10px] font-black uppercase text-slate-400">API Token（鉴权密钥）</label>
          <input
            type="password"
            placeholder="输入 Bearer Token 或纯 Token"
            value={currentProfile.token}
            onChange={event => updateProfile('token', event.target.value)}
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white/50 px-4 py-3 text-sm text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200"
          />
        </div>

        {provider === 'cloudflare-imgbed' && (
          <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 p-4 text-xs font-medium leading-6 text-sky-700 dark:text-sky-300">
            <p className="font-black">CloudFlare-ImgBed 配置提示</p>
            <p>API 地址填写图床管理站地址，例如 Pages 域名；不要填写只读的 img.helloyuki.cn。</p>
            <p>Token 请在 CloudFlare-ImgBed 的“安全设置 → API Token”中创建，并授予 upload 与 list 权限。</p>
          </div>
        )}

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black shadow-lg transition-all active:scale-95 ${
              isTesting
                ? 'cursor-not-allowed bg-slate-300 text-slate-500'
                : 'bg-pink-500 text-white shadow-pink-500/30 hover:bg-pink-600'
            }`}
          >
            {isTesting ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : '📡 测试当前图床'}
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-2xl bg-indigo-500 py-3 text-sm font-black text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-600 active:scale-95"
          >
            暂存当前图床配置
          </button>
        </div>

        <AnimatePresence>
          {testResult && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className={`flex items-center gap-3 rounded-2xl border p-4 ${
                testResult.success
                  ? 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
              }`}>
                <span className="text-xl">{testResult.success ? '✅' : '❌'}</span>
                <span className="text-sm font-bold leading-relaxed">{testResult.msg}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
