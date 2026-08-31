"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOperations } from '../../context/OperationContext';
import { siteConfig } from '../../siteConfig';
import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import { ToastProvider, useToast } from '../../components/ToastProvider';

import ProfileSection from '../../components/settings/ProfileSection';
import BackgroundSection from '../../components/settings/BackgroundSection';
import MusicSection from '../../components/settings/MusicSection';
import GallerySection from '../../components/settings/GallerySection';
import RepoSection from '../../components/settings/RepoSection';
import DisplaySection from '../../components/settings/DisplaySection';
import CommentSection from '../../components/settings/CommentSection';
import DanmakuSection from '../../components/settings/DanmakuSection';
import FooterSection from '../../components/settings/FooterSection';
// 👇 🌟 引入刚写的 AI 配置组件
import AICatSection from '../../components/settings/AICatSection';
import type { MusicSourceConfig, MusicTrack } from '../../lib/music/types';
import { RUNTIME_SITE_CONFIG_UPDATED_EVENT } from '../../components/RuntimeSiteConfigProvider';

async function getBackendBase() {
  const response = await fetch(`/backend_config.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('无法读取本地后端配置');
  const config = await response.json() as { api_port?: number };
  if (!Number.isInteger(config.api_port)) throw new Error('本地后端端口无效');
  return `http://127.0.0.1:${config.api_port}`;
}

async function fetchMusicDetail(id: string) {
  try {
    const response = await fetch(`${await getBackendBase()}/api/music/query/${id}`, { cache: 'no-store' });
    const data = await response.json();
    return data.success ? data.data : { error: true, id, name: '查询失败或无版权' };
  } catch {
    return { error: true, id, name: '后端通信通道断开' };
  }
}

function SettingsContent() {
  const { operations, addOperation } = useOperations();
  const [activeTab, setActiveTab] = useState('profile');
  const { showToast } = useToast();

  const [formData, setFormData] = useState<any>({
    authorName: siteConfig.authorName || "",
    bio: siteConfig.bio || "",
    avatarUrl: siteConfig.avatarUrl || "",
    social: siteConfig.social || {},
    cloudMusicIds: [...(siteConfig.cloudMusicIds || [])],
    musicTracks: [...((siteConfig.musicTracks || []) as MusicTrack[])],
    musicSources: [...((siteConfig.musicSources || []) as MusicSourceConfig[])],
    bgImages: [...(siteConfig.bgImages || [])],
    bgImageCrops: { ...(siteConfig.bgImageCrops || {}) },
    picBedProvider: siteConfig.picBedProvider || 'dusays',
    picBedProfiles: siteConfig.picBedProfiles || {
      dusays: {
        name: siteConfig.picBedName || 'Dusays 图床',
        url: siteConfig.picBedUrl || '',
        token: siteConfig.picBedToken || '',
      },
      'cloudflare-imgbed': {
        name: 'CloudFlare-ImgBed',
        url: 'https://imgbed.helloyuki.cn',
        token: '',
      },
    },
    gitalkConfig: siteConfig.gitalkConfig || {
      clientID: '',
      clientSecret: '',
      repo: '',
      owner: '',
      admin: []
    },
    danmakuList: [...(siteConfig.danmakuList || [])],
    buildDate: siteConfig.buildDate || "2026-03-23T00:00:00",
    icpConfig: siteConfig.icpConfig || { name: "", link: "" },
    footerBadges: [...(siteConfig.footerBadges || [])],
    // 👇 🌟 初始化小猫 AI 配置数据
    geminiConfig: siteConfig.geminiConfig || {
      modelId: 'gemini-2.5-flash-lite',
      systemPrompt: '',
      maxOutputTokens: 150,
      temperature: 0.85
    }
  });

  const [queryLoading, setQueryLoading] = useState(false);
  const [queryStage, setQueryStage] = useState<'searching' | 'verifying' | null>(null);
  const [querySummary, setQuerySummary] = useState('');
  const [queryResults, setQueryResults] = useState<any[]>([]);
  const [musicDetails, setMusicDetails] = useState<Record<string, any>>({});
  const neteaseTrackKey: string = (formData.musicTracks || [])
    .filter((track: MusicTrack) => track.platform === 'wy')
    .map((track: MusicTrack) => track.id)
    .join(',');

  useEffect(() => {
    const fetchRealConfig = async () => {
      try {
        const res = await fetch(`${await getBackendBase()}/api/config/get`, { cache: 'no-store' });
        const data = await res.json();

        if (data.success && data.data) {
          console.log("✅ 成功从后端拉取到真实配置:", data.data);
          setFormData((prev: any) => ({
            ...prev,
            ...data.data,
            social: { ...(prev.social || {}), ...(data.data.social || {}) },
            picBedProfiles: {
              ...(prev.picBedProfiles || {}),
              ...(data.data.picBedProfiles || {}),
              dusays: {
                ...(prev.picBedProfiles?.dusays || {}),
                ...(data.data.picBedProfiles?.dusays || {}),
              },
              'cloudflare-imgbed': {
                ...(prev.picBedProfiles?.['cloudflare-imgbed'] || {}),
                ...(data.data.picBedProfiles?.['cloudflare-imgbed'] || {}),
              },
            },
            gitalkConfig: { ...(prev.gitalkConfig || {}), ...(data.data.gitalkConfig || {}) },
            danmakuList: data.data.danmakuList ? [...data.data.danmakuList] : prev.danmakuList,
            buildDate: data.data.buildDate || prev.buildDate,
            icpConfig: data.data.icpConfig || prev.icpConfig,
            footerBadges: data.data.footerBadges ? [...data.data.footerBadges] : prev.footerBadges,
            musicTracks: data.data.musicTracks?.length
              ? [...data.data.musicTracks]
              : (data.data.cloudMusicIds || prev.cloudMusicIds || []).map((id: string | number) => ({ key: `wy:${id}`, platform: 'wy', id: String(id) })),
            musicSources: data.data.musicSources ? [...data.data.musicSources] : prev.musicSources,
            // 👇 🌟 合并后端发来的小猫配置
            geminiConfig: { ...(prev.geminiConfig || {}), ...(data.data.geminiConfig || {}) }
          }));
        } else {
          console.error("❌ 后端返回失败:", data.message);
          showToast("读取后端配置失败，当前显示为本地静态数据", "warning");
        }
      } catch (error) {
        console.error("❌ 请求后端配置通道断开:", error);
        showToast("无法连接到 Python 后端服务", "error");
      }
    };

    fetchRealConfig();
  }, []);

  const handleUpdate = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    let cancelled = false;
    const loadInitialMusicDetails = async () => {
      const ids = neteaseTrackKey.split(',').filter(Boolean);
      const entries = await Promise.all(ids.map(async (id) => [id, await fetchMusicDetail(id)] as const));
      if (!cancelled) setMusicDetails((current) => ({ ...current, ...Object.fromEntries(entries) }));
    };
    if (neteaseTrackKey) void loadInitialMusicDetails();
    return () => { cancelled = true; };
  }, [neteaseTrackKey]);

  const queryMusic = async (query: string) => {
    const keyword = query.trim();
    if (!keyword) {
      showToast("请输入歌曲名", "warning");
      return;
    }
    setQueryLoading(true);
    setQueryStage('searching');
    setQuerySummary('');
    setQueryResults([]);
    try {
      const response = await fetch(`${await getBackendBase()}/api/music/search?query=${encodeURIComponent(keyword)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || '搜索失败');
      const allCandidates = (result.data || []) as MusicTrack[];
      if (allCandidates.length === 0) {
        setQuerySummary('没有找到匹配歌曲');
        showToast("没有找到匹配歌曲", "warning");
        return;
      }

      const platformCounts = new Map<string, number>();
      const candidates = allCandidates.filter((track) => {
        const count = platformCounts.get(track.platform) || 0;
        if (count >= 5) return false;
        platformCounts.set(track.platform, count + 1);
        return true;
      });

      setQueryStage('verifying');
      const availabilityResponse = await fetch('/api/music/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: candidates, sources: formData.musicSources || [] }),
        cache: 'no-store',
      });
      const availabilityResult = await availabilityResponse.json();
      if (!availabilityResponse.ok || !availabilityResult.success) {
        throw new Error(availabilityResult.message || '歌曲可播放性验证失败');
      }
      const playableByKey = new Map<string, Record<string, unknown>>(
        (availabilityResult.data || []).map((item: Record<string, unknown>) => [String(item.key), item]),
      );
      const playableResults = candidates.flatMap((track) => {
        const availability = playableByKey.get(track.key);
        return availability ? [{ ...track, ...availability, playable: true }] : [];
      });
      setQueryResults(playableResults);
      setQuerySummary(`已验证 ${availabilityResult.checked || candidates.length} 首，过滤 ${availabilityResult.filtered || 0} 首不可播放歌曲`);
      if (playableResults.length === 0) showToast("没有找到当前音源可播放的歌曲", "warning");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "搜索失败", "error");
      setQuerySummary('搜索或可播放性验证失败，请稍后重试');
    } finally {
      setQueryLoading(false);
      setQueryStage(null);
    }
  };

  const removeSong = (index: number) => {
    const tracks = [...(formData.musicTracks || [])] as MusicTrack[];
    const [removed] = tracks.splice(index, 1);
    handleUpdate('musicTracks', tracks);
    if (removed?.platform === 'wy') {
      handleUpdate('cloudMusicIds', (formData.cloudMusicIds || []).filter((id: string | number) => String(id) !== removed.id));
    }
    showToast("已移除一首歌曲", "success");
  };

  const addMusicTrack = (track: MusicTrack) => {
    if ((formData.musicTracks || []).some((item: MusicTrack) => item.key === track.key)) {
      showToast(`《${track.name || '这首歌'}》已经在歌单中`, "warning");
      return false;
    }
    handleUpdate('musicTracks', [...(formData.musicTracks || []), track]);
    if (track.platform === 'wy' && !(formData.cloudMusicIds || []).some((id: string | number) => String(id) === track.id)) {
      handleUpdate('cloudMusicIds', [...(formData.cloudMusicIds || []), track.id]);
      setMusicDetails(prev => ({ ...prev, [track.id]: track }));
    }
    showToast("已加入播放列表", "success");
    return true;
  };

  const saveMusicSettings = async (tracks: MusicTrack[], sources: MusicSourceConfig[]) => {
    if (!sources.some((source) => source.enabled)) {
      showToast('至少启用一个音源后才能保存', 'warning');
      return false;
    }
    try {
      const response = await fetch(`${await getBackendBase()}/api/config/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: { musicTracks: tracks, musicSources: sources, cloudMusicIds: formData.cloudMusicIds } }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || '保存失败');
      window.dispatchEvent(new Event(RUNTIME_SITE_CONFIG_UPDATED_EVENT));
      showToast('音乐与音源配置已保存，Manager 播放器已刷新；同步部署后对线上博客生效', 'success');
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存失败', 'error');
      return false;
    }
  };

  const pushToQueue = (label: string, key?: string, value?: any) => {
    addOperation({
      id: Date.now().toString(),
      type: 'CONFIG',
      label: `配置暂存：${label}`,
      description: `修改了系统的 ${label}，等待同步至 myBlogs`,
      timestamp: new Date().toLocaleTimeString().slice(0, 5),
      payload: formData,
      key: key,
      value: value
    });
    showToast(`🎉 【${label}】已加入右上角操作队列！`, "success");
  };

  // 👇 🌟 在菜单里增加 AI 猫咪入口
  const menuItems = [
    { id: 'profile', name: '个人名片设置', icon: '👤' },
    { id: 'display', name: '视窗画面设置', icon: '🪟' },
    { id: 'background', name: '视觉背景配置', icon: '🌌' },
    { id: 'music', name: '音乐播放设置', icon: '🎵' },
    { id: 'gallery', name: '图库配置管理', icon: '🖼️' },
    { id: 'footer', name: '首页底部设置', icon: '🧩' },
    { id: 'danmaku', name: '全站弹幕设置', icon: '⚡' },
    { id: 'comment', name: '评论系统配置', icon: '💬' },
    { id: 'aicat', name: 'AI 煤球配置', icon: '🐾' }, // 👈 新增的小猫设置
    { id: 'repo', name: '项目仓库设置', icon: '🚀' },
  ];

  return (
    <div className="min-h-screen relative pb-10">
      <Navbar />

      <PageTransition>
        <main className="w-[95%] max-w-7xl mx-auto mt-24 flex flex-col md:flex-row gap-8 items-start relative z-10">

          <div className="w-full md:w-72 shrink-0 flex flex-col gap-4">
            <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/50 dark:border-slate-800/50 rounded-3xl p-4 shadow-xl">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-4 ml-2 tracking-widest">系统管理维度</p>
              <nav className="flex flex-col gap-2">
                {menuItems.map((item) => (
                  <button key={item.id} onClick={() => setActiveTab(item.id)} className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 font-bold text-sm ${activeTab === item.id ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 translate-x-1' : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'}`}>
                    <span>{item.icon}</span>{item.name}
                  </button>
                ))}
              </nav>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-3xl p-4 mt-4">
              <p className="text-xs font-black text-amber-600 dark:text-amber-400 mb-2">🔄 数据中枢操作</p>
              <div className="w-full py-2 bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-bold px-4 flex justify-between">
                <span>进入本页时自动读取实时配置</span><span>✅</span>
              </div>
            </div>
          </div>

          <div className="flex-1 w-full">
            <AnimatePresence mode="wait">
              {activeTab === 'profile' && <ProfileSection key="profile" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'display' && <DisplaySection key="display" />}
              {activeTab === 'background' && <BackgroundSection key="background" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'music' && <MusicSection key="music" formData={formData} handleUpdate={handleUpdate} musicDetails={musicDetails} queryMusic={queryMusic} queryLoading={queryLoading} queryStage={queryStage} querySummary={querySummary} queryResults={queryResults} addMusicTrack={addMusicTrack} removeSong={removeSong} saveMusicSettings={saveMusicSettings} />}
              {activeTab === 'gallery' && <GallerySection key="gallery" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'footer' && <FooterSection key="footer" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'danmaku' && <DanmakuSection key="danmaku" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'comment' && <CommentSection key="comment" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {/* 👇 🌟 挂载 AI 猫咪面板 */}
              {activeTab === 'aicat' && <AICatSection key="aicat" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}

              {activeTab === 'repo' && <RepoSection key="repo" />}
            </AnimatePresence>
          </div>

        </main>
      </PageTransition>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ToastProvider>
      <SettingsContent />
    </ToastProvider>
  );
}
