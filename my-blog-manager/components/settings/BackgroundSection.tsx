"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Crop, ImagePlus, Link2, MonitorUp, X } from 'lucide-react';
import {
  removeBackgroundSelection,
  upsertBackgroundSelection,
  type BackgroundCrop,
  type BackgroundCropMap,
} from '../../lib/backgroundCrop';
import PhotoWallPicker from '../PhotoWallPicker';
import CroppedBackgroundImage from '../CroppedBackgroundImage';
import CoverCropper from '../editor/CoverCropper';
import { useToast } from '../ToastProvider';

type BackgroundSource = 'url' | 'upload' | 'photowall';
type PicBedProvider = 'dusays' | 'cloudflare-imgbed';
type WindowSize = { width: number; height: number };

interface PicBedProfile {
  name?: string;
  url?: string;
  token?: string;
}

interface BackgroundFormData {
  bgImages?: string[];
  bgImageCrops?: BackgroundCropMap;
  newBgUrl?: string;
  picBedProvider?: string;
  picBedName?: string;
  picBedUrl?: string;
  picBedToken?: string;
  picBedProfiles?: Partial<Record<PicBedProvider, PicBedProfile>>;
}

interface BackgroundSectionProps {
  formData: BackgroundFormData;
  handleUpdate: (field: string, value: unknown) => void;
  pushToQueue: (label: string, key: string, value: unknown) => void;
}

const DEFAULT_WINDOW_SIZE: WindowSize = { width: 1440, height: 900 };
const MAX_CROP_EDGE = 3840;

function greatestCommonDivisor(first: number, second: number): number {
  let a = Math.abs(Math.round(first));
  let b = Math.abs(Math.round(second));
  while (b > 0) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

function getCropOutputSize(windowSize: WindowSize): WindowSize {
  const longestEdge = Math.max(windowSize.width, windowSize.height);
  if (longestEdge <= MAX_CROP_EDGE) return windowSize;
  const scale = MAX_CROP_EDGE / longestEdge;
  return {
    width: Math.max(1, Math.round(windowSize.width * scale)),
    height: Math.max(1, Math.round(windowSize.height * scale)),
  };
}

function isSupportedImageUrl(value: string) {
  if (value.startsWith('/')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function BackgroundSection({ formData, handleUpdate, pushToQueue }: BackgroundSectionProps) {
  const { showToast } = useToast();
  const shouldReduceMotion = useReducedMotion();
  const [activeSource, setActiveSource] = useState<BackgroundSource>('url');
  const [cropImageUrl, setCropImageUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [windowSize, setWindowSize] = useState<WindowSize>(DEFAULT_WINDOW_SIZE);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const backgrounds = Array.isArray(formData.bgImages) ? formData.bgImages : [];
  const backgroundCrops = formData.bgImageCrops && typeof formData.bgImageCrops === 'object'
    ? formData.bgImageCrops
    : {};
  const picBedProvider: PicBedProvider = formData.picBedProvider === 'cloudflare-imgbed'
    ? 'cloudflare-imgbed'
    : 'dusays';
  const configuredProfile = formData.picBedProfiles?.[picBedProvider];
  const picBedUrl = String(
    configuredProfile?.url || (picBedProvider === 'dusays' ? formData.picBedUrl : '') || '',
  ).trim();
  const picBedToken = String(
    configuredProfile?.token || (picBedProvider === 'dusays' ? formData.picBedToken : '') || '',
  ).trim();

  useEffect(() => {
    let cancelled = false;

    const readWindowSize = async () => {
      const api = (window as Window & {
        pywebview?: {
          api?: {
            get_window_state?: () => Promise<{ width?: number; height?: number }>;
          };
        };
      }).pywebview?.api;
      if (!api?.get_window_state) return;

      try {
        const state = await api.get_window_state();
        const width = Number(state.width);
        const height = Number(state.height);
        if (!cancelled && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
          setWindowSize({ width: Math.round(width), height: Math.round(height) });
        }
      } catch {
        // 浏览器预览模式使用默认视窗比例。
      }
    };

    void readWindowSize();
    window.addEventListener('pywebviewready', readWindowSize);
    return () => {
      cancelled = true;
      window.removeEventListener('pywebviewready', readWindowSize);
    };
  }, []);

  const cropOutputSize = useMemo(() => getCropOutputSize(windowSize), [windowSize]);
  const ratioLabel = useMemo(() => {
    const divisor = greatestCommonDivisor(windowSize.width, windowSize.height);
    return `${windowSize.width} × ${windowSize.height} · ${windowSize.width / divisor}:${windowSize.height / divisor}`;
  }, [windowSize]);

  const uploadImage = async (file: File) => {
    if (isUploading) return;
    if (!file.type.startsWith('image/')) {
      showToast('只能上传图片文件', 'warning');
      return;
    }
    if (!picBedUrl || !picBedToken) {
      showToast('请先在图库配置管理中填写当前图床的 API 地址与 Token', 'error');
      return;
    }

    setIsUploading(true);
    showToast('正在将图片传送至图床引擎...', 'info');

    try {
      const configResponse = await fetch(`/backend_config.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!configResponse.ok) throw new Error('无法读取本地后端配置');
      const config = await configResponse.json() as { api_port?: number };
      if (!Number.isInteger(config.api_port)) throw new Error('本地后端端口无效');

      const uploadData = new FormData();
      uploadData.append('file', file);
      uploadData.append('provider', picBedProvider);
      uploadData.append('url', picBedUrl);
      uploadData.append('token', picBedToken);

      const response = await fetch(`http://127.0.0.1:${config.api_port}/api/picbed/upload`, {
        method: 'POST',
        body: uploadData,
      });
      const result = await response.json() as { success?: boolean; url?: string; message?: string };
      if (!response.ok || !result.success || !result.url) {
        throw new Error(result.message || `上传失败（HTTP ${response.status}）`);
      }

      showToast('✅ 图片上传成功，请选择显示区域', 'success');
      setCropImageUrl(result.url);
    } catch (error) {
      showToast(`上传失败：${error instanceof Error ? error.message : '无法连接到图床引擎'}`, 'error');
    } finally {
      setIsUploading(false);
      setIsDragging(false);
      dragDepthRef.current = 0;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void uploadImage(file);
  };

  const openFilePickerFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!isUploading) fileInputRef.current?.click();
  };

  const removeBackground = (index: number) => {
    const next = removeBackgroundSelection(backgrounds, backgroundCrops, index);
    handleUpdate('bgImages', next.images);
    handleUpdate('bgImageCrops', next.crops);
    showToast('已移除一张背景图', 'success');
  };

  const openCropper = (rawUrl: string) => {
    const url = rawUrl.trim();
    if (!url) {
      showToast('请先填写图片 URL', 'warning');
      return;
    }
    if (!isSupportedImageUrl(url)) {
      showToast('请输入有效的 HTTP 或 HTTPS 图片 URL', 'warning');
      return;
    }
    setCropImageUrl(url);
  };

  const completeCrop = (url: string, crop?: BackgroundCrop) => {
    if (!crop) return;
    const next = upsertBackgroundSelection(backgrounds, backgroundCrops, url, crop);
    handleUpdate('bgImages', next.images);
    handleUpdate('bgImageCrops', next.crops);
    handleUpdate('newBgUrl', '');
    setCropImageUrl('');
  };

  return (
    <motion.section
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="relative flex flex-col gap-8 rounded-[40px] border border-white/50 bg-white/40 p-8 shadow-2xl backdrop-blur-2xl dark:border-slate-800/50 dark:bg-slate-900/40"
    >
      <header className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-800 dark:text-white">🌌 视觉背景配置</h2>
          <p className="mt-2 text-[10px] font-bold uppercase text-slate-400">管理网站的全局轮播背景图（{backgrounds.length} 张）</p>
        </div>
        <button
          type="button"
          onClick={() => pushToQueue('视觉背景图', 'bgImages', backgrounds)}
          className="rounded-xl bg-indigo-500 px-6 py-2 text-xs font-black text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-600 active:scale-95"
        >
          暂存背景修改
        </button>
      </header>

      <div className="relative z-10 grid grid-cols-1 gap-8 xl:grid-cols-2">
        <div className="custom-scrollbar max-h-[520px] overflow-y-auto rounded-3xl bg-slate-100/50 p-6 dark:bg-slate-800/50">
          <div className="grid grid-cols-2 gap-4">
            <AnimatePresence initial={false}>
              {backgrounds.map((url, index) => (
                  <motion.div
                    layout
                    initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
                    transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30 }}
                    key={`${url}-${index}`}
                    className="group relative overflow-hidden rounded-2xl border border-white/20 shadow-md"
                    style={{ aspectRatio: `${windowSize.width} / ${windowSize.height}` }}
                  >
                    <CroppedBackgroundImage
                      src={url}
                      crop={backgroundCrops[url]}
                      alt={`背景图 ${index + 1}`}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <button
                        type="button"
                        aria-label={`移除第 ${index + 1} 张背景图`}
                        onClick={() => removeBackground(index)}
                        className="flex h-10 w-10 scale-90 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow-xl transition duration-200 hover:bg-red-600 group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100"
                      >
                        <X size={17} strokeWidth={3} />
                      </button>
                    </div>
                  </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {backgrounds.length === 0 && (
            <div className="flex h-36 w-full items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 px-6 text-center text-xs font-bold text-slate-400 dark:border-slate-600">
              还没有背景图，请从 URL 或照片墙选择
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-indigo-200/70 bg-indigo-500/8 px-4 py-3 dark:border-indigo-500/20 dark:bg-indigo-500/10">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-md shadow-indigo-500/20">
                <MonitorUp size={17} />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-black uppercase tracking-wider text-indigo-500">当前裁剪比例跟随视窗设置</span>
                <span className="mt-0.5 block text-xs font-black text-slate-700 dark:text-slate-200">{ratioLabel}</span>
              </span>
            </span>
            <Crop size={18} className="shrink-0 text-indigo-400" />
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100/80 p-1.5 dark:bg-slate-800/70">
            <button
              type="button"
              onClick={() => setActiveSource('url')}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition-all ${
                activeSource === 'url'
                  ? 'bg-white text-emerald-600 shadow-md dark:bg-slate-700 dark:text-emerald-400'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
              }`}
            >
              <Link2 size={15} /> 网络 URL
            </button>
            <button
              type="button"
              onClick={() => setActiveSource('upload')}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition-all ${
                activeSource === 'upload'
                  ? 'bg-white text-sky-600 shadow-md dark:bg-slate-700 dark:text-sky-400'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
              }`}
            >
              ☁️ 本地上传
            </button>
            <button
              type="button"
              onClick={() => setActiveSource('photowall')}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition-all ${
                activeSource === 'photowall'
                  ? 'bg-white text-indigo-600 shadow-md dark:bg-slate-700 dark:text-indigo-400'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
              }`}
            >
              <ImagePlus size={15} /> 从照片墙选择
            </button>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {activeSource === 'url' ? (
              <motion.div
                key="url-source"
                initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2 }}
                className="rounded-3xl border border-white/50 bg-white/55 p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/50"
              >
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
                    <Link2 size={18} />
                  </span>
                  <div>
                    <p className="text-sm font-black text-slate-700 dark:text-slate-100">通过图片 URL 添加</p>
                    <p className="mt-0.5 text-[10px] font-bold text-slate-400">粘贴图片地址，下一步可调整裁剪区域</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="url"
                    placeholder="https://example.com/background.jpg"
                    value={formData.newBgUrl || ''}
                    onChange={(event) => handleUpdate('newBgUrl', event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') openCropper(formData.newBgUrl || '');
                    }}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-xs text-slate-700 shadow-inner outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => openCropper(formData.newBgUrl || '')}
                    className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-xs font-black text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-600 active:scale-95"
                  >
                    <Crop size={14} /> 裁剪并添加
                  </button>
                </div>
              </motion.div>
            ) : activeSource === 'upload' ? (
              <motion.div
                key="upload-source"
                role="button"
                tabIndex={isUploading ? -1 : 0}
                aria-label={isUploading ? '正在上传图片' : '点击或拖拽图片上传'}
                aria-disabled={isUploading}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2 }}
                onDragEnter={handleDragEnter}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'copy';
                }}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isUploading && fileInputRef.current?.click()}
                onKeyDown={openFilePickerFromKeyboard}
                className={`relative flex min-h-[240px] cursor-pointer flex-col items-center justify-center gap-4 overflow-hidden rounded-3xl border-2 border-dashed outline-none transition-all duration-300 focus:ring-2 focus:ring-indigo-500/40 ${
                  isDragging
                    ? 'scale-[1.02] border-indigo-500 bg-indigo-500/10'
                    : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-100/50 dark:border-slate-600 dark:hover:bg-slate-800/50'
                } ${isUploading ? 'cursor-wait' : ''}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadImage(file);
                  }}
                />

                <div className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl shadow-xl transition-all duration-300 ${
                  isDragging
                    ? 'rotate-12 bg-indigo-500 text-white'
                    : 'bg-white text-slate-500 dark:bg-slate-800'
                }`}>
                  {isUploading ? '⏳' : '☁️'}
                </div>

                <p className="z-10 text-sm font-bold text-slate-700 dark:text-slate-200">
                  {isUploading ? '正在上传至图床...' : '点击或将图片拖拽至此'}
                </p>

                {isUploading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 backdrop-blur-sm dark:bg-slate-900/50">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="photowall-source"
                initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2 }}
              >
                <PhotoWallPicker
                  selectedUrls={backgrounds}
                  onToggle={openCropper}
                  compact
                  selectedItemAction="edit"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <CoverCropper
        isOpen={Boolean(cropImageUrl)}
        imageUrl={cropImageUrl}
        outputWidth={cropOutputSize.width}
        outputHeight={cropOutputSize.height}
        title="裁剪视觉背景"
        description="拖动图片选择显示区域"
        ratioLabel={ratioLabel}
        successMessage="✅ 显示区域已保存，背景继续使用原始 URL"
        reuseSourceUrl
        initialCrop={backgroundCrops[cropImageUrl]}
        onClose={() => setCropImageUrl('')}
        onComplete={completeCrop}
      />
    </motion.section>
  );
}
