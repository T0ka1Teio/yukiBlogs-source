"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { ChevronDown, CloudUpload, FolderOpen, Loader2, Trash2 } from 'lucide-react';
import { useToast } from '../ToastProvider';
import PhotoWallPicker from '../PhotoWallPicker';

interface FloatingImageToolProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (url: string) => void;
  onInsertMany?: (urls: string[]) => void;
  multiple?: boolean;
  sourceMode?: 'upload' | 'photowall';
}

type UploadStatus = 'pending' | 'uploading' | 'success' | 'error';
type ImageSourceTab = 'upload' | 'url' | 'photowall';

interface UploadQueueItem {
  id: string;
  file: File;
  status: UploadStatus;
  url?: string;
  error?: string;
}

function normalizeCloudPath(value: string) {
  const normalized = value.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (!normalized || normalized === '/') return '/';
  const segments = normalized.split('/').filter(Boolean);
  if (segments.some(segment => segment === '.' || segment.includes('..'))) {
    throw new Error('上传路径不能包含 . 或 ..');
  }
  return `/${segments.join('/')}`;
}

async function getBackendBase() {
  const response = await fetch(`/backend_config.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('无法读取本地后端配置');
  const config = await response.json() as { api_port?: number };
  if (!Number.isInteger(config.api_port)) throw new Error('本地后端端口无效');
  return `http://127.0.0.1:${config.api_port}`;
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function FloatingImageTool({
  isOpen,
  onClose,
  onInsert,
  onInsertMany,
  multiple = false,
  sourceMode = 'upload',
}: FloatingImageToolProps) {
  const { showToast } = useToast();
  const dragControls = useDragControls();
  const primaryTab: ImageSourceTab = 'upload';
  const workspaceTabs: Array<{ id: ImageSourceTab; label: string }> = [
    { id: 'upload', label: '上传云端' },
    { id: 'url', label: '外链插入' },
    ...(sourceMode === 'photowall' ? [{ id: 'photowall' as const, label: '照片墙' }] : []),
  ];
  const [activeTab, setActiveTab] = useState<ImageSourceTab>(primaryTab);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [cloudPath, setCloudPath] = useState('/');
  const [availablePaths, setAvailablePaths] = useState<string[]>(['/']);
  const [isPathOpen, setIsPathOpen] = useState(false);
  const [isLoadingPaths, setIsLoadingPaths] = useState(false);
  const [pathLoadError, setPathLoadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pathBoxRef = useRef<HTMLDivElement>(null);

  const actionableItems = useMemo(
    () => uploadQueue.filter(item => item.status === 'pending' || item.status === 'error'),
    [uploadQueue],
  );
  const filteredPaths = useMemo(() => {
    const keyword = cloudPath.trim().toLocaleLowerCase();
    if (!keyword || keyword === '/') return availablePaths;
    const matches = availablePaths.filter(path => path.toLocaleLowerCase().includes(keyword));
    return matches.length > 0 ? matches : availablePaths;
  }, [availablePaths, cloudPath]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(primaryTab);
    if (primaryTab !== 'upload') return;

    const controller = new AbortController();
    const loadPaths = async () => {
      setIsLoadingPaths(true);
      setPathLoadError('');
      try {
        const response = await fetch(`${await getBackendBase()}/api/picbed/directories`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json() as { success?: boolean; paths?: unknown; message?: string; detail?: string };
        if (!response.ok || !data.success) throw new Error(data.detail || data.message || '读取云端路径失败');
        const paths = Array.isArray(data.paths)
          ? data.paths.filter((path): path is string => typeof path === 'string')
          : [];
        setAvailablePaths(Array.from(new Set(['/', ...paths])));
      } catch (error) {
        if (controller.signal.aborted) return;
        setPathLoadError(error instanceof Error ? error.message : '读取云端路径失败');
        setAvailablePaths(['/']);
      } finally {
        if (!controller.signal.aborted) setIsLoadingPaths(false);
      }
    };

    void loadPaths();
    return () => controller.abort();
  }, [isOpen, primaryTab]);

  useEffect(() => {
    if (!isPathOpen) return;
    const closePathList = (event: PointerEvent) => {
      if (!pathBoxRef.current?.contains(event.target as Node)) setIsPathOpen(false);
    };
    document.addEventListener('pointerdown', closePathList);
    return () => document.removeEventListener('pointerdown', closePathList);
  }, [isPathOpen]);

  const resetTool = () => {
    setUploadedUrl('');
    setExternalUrl('');
    setIsDragging(false);
    setUploadQueue([]);
    setCloudPath('/');
    setIsPathOpen(false);
  };

  const closeTool = () => {
    resetTool();
    onClose();
  };

  const addFiles = (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      showToast('请选择图片文件', 'warning');
      return;
    }
    if (imageFiles.length !== files.length) showToast('已忽略非图片文件', 'warning');

    const selected = multiple ? imageFiles : imageFiles.slice(0, 1);
    const nextItems = selected.map((file, index): UploadQueueItem => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${index}`,
      file,
      status: 'pending',
    }));
    setUploadQueue(current => {
      if (!multiple) return nextItems;
      const knownFiles = new Set(current.map(item => `${item.file.name}-${item.file.size}-${item.file.lastModified}`));
      const additions = nextItems.filter(item => !knownFiles.has(`${item.file.name}-${item.file.size}-${item.file.lastModified}`));
      return [...current, ...additions];
    });
    setUploadedUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateQueueItem = (id: string, update: Partial<UploadQueueItem>) => {
    setUploadQueue(current => current.map(item => item.id === id ? { ...item, ...update } : item));
  };

  const uploadSelectedFiles = async () => {
    if (actionableItems.length === 0 || isUploading) return;

    let normalizedPath: string;
    try {
      normalizedPath = normalizeCloudPath(cloudPath);
      setCloudPath(normalizedPath);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '上传路径无效', 'warning');
      return;
    }

    setIsUploading(true);
    const successfulUrls: string[] = [];
    let failedCount = 0;

    try {
      const backendBase = await getBackendBase();
      for (const item of actionableItems) {
        updateQueueItem(item.id, { status: 'uploading', error: undefined });
        try {
          const uploadData = new FormData();
          uploadData.append('file', item.file);
          uploadData.append('path', normalizedPath);
          const response = await fetch(`${backendBase}/api/picbed/upload`, {
            method: 'POST',
            body: uploadData,
          });
          const data = await response.json() as { success?: boolean; url?: string; path?: string; message?: string };
          if (!response.ok || !data.success || !data.url) {
            throw new Error(data.message || `上传失败（HTTP ${response.status}）`);
          }
          successfulUrls.push(data.url);
          updateQueueItem(item.id, { status: 'success', url: data.url });
          if (data.path) setCloudPath(data.path);
        } catch (error) {
          failedCount += 1;
          updateQueueItem(item.id, {
            status: 'error',
            error: error instanceof Error ? error.message : '上传失败',
          });
        }
      }

      if (successfulUrls.length > 0 && multiple && onInsertMany) {
        onInsertMany(successfulUrls);
      } else if (successfulUrls.length > 0) {
        setUploadedUrl(successfulUrls.at(-1) || '');
      }

      if (successfulUrls.length > 0 && failedCount === 0) {
        showToast(multiple ? `已上传并加入 ${successfulUrls.length} 张照片` : '上传成功', 'success');
        if (multiple && onInsertMany) closeTool();
      } else if (successfulUrls.length > 0) {
        showToast(`已完成 ${successfulUrls.length} 张，${failedCount} 张失败，可直接重试`, 'warning');
      } else {
        showToast('图片上传失败，请查看队列中的错误信息', 'error');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '无法连接上传服务', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
  };

  const handleConfirmExternalUrl = () => {
    if (!externalUrl.trim()) {
      showToast('请输入有效的图片 URL', 'warning');
      return;
    }
    if (!externalUrl.match(/\.(jpeg|jpg|gif|png|webp|svg|avif)(\?.*)?$|^data:image/i)) {
      showToast('链接没有常见图片后缀，将继续尝试预览', 'warning');
    }
    setUploadedUrl(externalUrl.trim());
  };

  const copyUrlToClipboard = () => {
    if (!uploadedUrl) return;
    void navigator.clipboard.writeText(uploadedUrl);
    showToast('链接已复制到剪贴板', 'success');
  };

  const insertSelectedImage = () => {
    if (!uploadedUrl) return;
    onInsert(uploadedUrl);
    closeTool();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          drag
          dragControls={dragControls}
          dragListener={false}
          dragMomentum={false}
          dragElastic={0}
          initial={{ opacity: 0, scale: 0.94, y: -16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          style={{ position: 'fixed', top: '10vh', right: '4vw', zIndex: 99999 }}
          className={`${sourceMode === 'photowall' || multiple ? 'w-[520px] max-w-[94vw]' : 'w-80'} max-h-[82vh] overflow-hidden rounded-[32px] border border-white/50 bg-white/55 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/55 flex flex-col`}
        >
          <div
            onPointerDown={event => dragControls.start(event)}
            className="flex cursor-move items-center justify-between border-b border-white/30 bg-white/50 p-5 dark:border-slate-700/50 dark:bg-slate-800/50"
          >
            <h3 className="flex items-center gap-2 text-sm font-black text-slate-800 dark:text-slate-100">
              <span className="text-lg text-emerald-500">{sourceMode === 'photowall' ? '🖼️' : '☁️'}</span>
              {sourceMode === 'photowall' ? '图片工作台' : '图床工作台'}
            </h3>
            <button type="button" onPointerDown={event => event.stopPropagation()} onClick={closeTool} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/50 text-slate-500 shadow-sm transition-all hover:bg-red-500 hover:text-white dark:bg-slate-700/50">✕</button>
          </div>

          <div className="overflow-y-auto bg-white/20 p-6 dark:bg-slate-900/20">
            {!uploadedUrl && (
              <div role="tablist" aria-label="图片来源" className="mb-5 flex rounded-2xl bg-slate-200/50 p-1 dark:bg-slate-800/50">
                {workspaceTabs.map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 rounded-xl px-2 py-2 text-xs font-bold transition-all duration-200 ${activeTab === tab.id ? 'bg-white text-emerald-500 shadow-sm dark:bg-slate-700' : 'text-slate-500 hover:bg-white/35 hover:text-slate-700 dark:hover:bg-slate-700/40 dark:hover:text-slate-300'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {!uploadedUrl ? (
              activeTab === 'url' ? (
                <div className="w-full space-y-4">
                  <textarea
                    value={externalUrl}
                    onChange={event => setExternalUrl(event.target.value)}
                    placeholder="粘贴图片链接 (https://...)"
                    className="h-24 w-full resize-none rounded-2xl border border-slate-200 bg-white/50 p-4 text-xs font-medium text-slate-700 outline-none transition-all focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200"
                  />
                  <button type="button" onClick={handleConfirmExternalUrl} className="w-full rounded-xl bg-slate-800 py-3 text-xs font-black text-white shadow-lg transition-all hover:opacity-90 active:scale-95 dark:bg-white dark:text-slate-900">
                    确认图片链接
                  </button>
                </div>
              ) : activeTab === 'photowall' ? (
                <PhotoWallPicker
                  selectedUrls={uploadedUrl ? [uploadedUrl] : []}
                  onToggle={url => {
                    setUploadedUrl(url);
                    showToast('已从照片墙选择图片', 'success');
                  }}
                  compact
                />
              ) : (
                <div className="space-y-4">
                  <div ref={pathBoxRef} className="relative">
                    <label className="mb-2 flex items-center justify-between px-1 text-[11px] font-black tracking-wide text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1.5"><FolderOpen size={13} /> 云端存放路径</span>
                      <span className="font-medium text-slate-400">默认 /</span>
                    </label>
                    <div className={`flex items-center rounded-2xl border bg-white/65 shadow-sm transition-all dark:bg-slate-800/65 ${isPathOpen ? 'border-emerald-500 ring-2 ring-emerald-500/15' : 'border-white/70 dark:border-slate-700'}`}>
                      <input
                        value={cloudPath}
                        onFocus={() => setIsPathOpen(true)}
                        onChange={event => { setCloudPath(event.target.value); setIsPathOpen(true); }}
                        onBlur={() => {
                          try { setCloudPath(normalizeCloudPath(cloudPath)); } catch { /* validation is shown on upload */ }
                        }}
                        onKeyDown={event => {
                          if (event.key === 'Escape') setIsPathOpen(false);
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            setIsPathOpen(false);
                          }
                        }}
                        aria-label="云端存放路径"
                        role="combobox"
                        aria-autocomplete="list"
                        aria-controls="cloud-upload-path-options"
                        aria-expanded={isPathOpen}
                        className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm font-bold text-slate-700 outline-none dark:text-slate-100"
                        placeholder="/"
                      />
                      <button type="button" onClick={() => setIsPathOpen(open => !open)} className="mr-2 flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-emerald-500 dark:hover:bg-slate-700" aria-label="展开云端路径">
                        {isLoadingPaths ? <Loader2 size={16} className="animate-spin" /> : <ChevronDown size={16} className={`transition-transform ${isPathOpen ? 'rotate-180' : ''}`} />}
                      </button>
                    </div>
                    <AnimatePresence>
                      {isPathOpen && (
                        <motion.div id="cloud-upload-path-options" role="listbox" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="absolute left-0 right-0 top-[68px] z-30 max-h-48 overflow-y-auto rounded-2xl border border-white/70 bg-white/95 p-1.5 shadow-2xl backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95">
                          {filteredPaths.map(path => (
                            <button key={path} type="button" onPointerDown={event => event.preventDefault()} onClick={() => { setCloudPath(path); setIsPathOpen(false); }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors ${cloudPath === path ? 'bg-emerald-500 text-white' : 'text-slate-600 hover:bg-emerald-500/10 hover:text-emerald-600 dark:text-slate-300'}`}>
                              <FolderOpen size={13} />
                              <span className="truncate">{path}</span>
                            </button>
                          ))}
                          {!isLoadingPaths && cloudPath && !availablePaths.includes(cloudPath) && (
                            <div className="border-t border-slate-200 px-3 py-2.5 text-[11px] font-medium text-slate-400 dark:border-slate-700">
                              上传后将自动创建当前自定义路径
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {pathLoadError && <p className="mt-1.5 px-1 text-[10px] font-medium text-amber-500">已有路径暂时无法读取，仍可输入自定义路径</p>}
                  </div>

                  <div
                    onDragOver={event => { event.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed shadow-inner transition-all ${isDragging ? 'scale-[1.01] border-emerald-500 bg-emerald-50/80 dark:bg-emerald-900/40' : 'border-slate-300/80 hover:bg-white/60 dark:border-slate-600/80 dark:hover:bg-slate-800/60'}`}
                  >
                    <input type="file" ref={fileInputRef} onChange={event => event.target.files && addFiles(event.target.files)} accept="image/*" multiple={multiple} className="hidden" />
                    <CloudUpload size={30} className={isDragging ? 'text-emerald-500' : 'text-slate-400'} />
                    <div className="text-center">
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">点击选择或拖入本地图片</p>
                      <p className="mt-1 text-[10px] font-medium text-slate-400">{multiple ? '支持批量选择，文件会依次上传' : '选择一张图片上传'}</p>
                    </div>
                  </div>

                  {uploadQueue.length > 0 && (
                    <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/45 dark:border-slate-700 dark:bg-slate-800/40">
                      <div className="flex items-center justify-between border-b border-slate-200/70 px-3 py-2 dark:border-slate-700">
                        <span className="text-[11px] font-black text-slate-500">待上传 {uploadQueue.length} 张</span>
                        <button type="button" disabled={isUploading} onClick={() => setUploadQueue([])} className="text-[10px] font-bold text-slate-400 transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40">清空</button>
                      </div>
                      <div className="max-h-40 space-y-1 overflow-y-auto p-2">
                        {uploadQueue.map(item => (
                          <div key={item.id} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/55 dark:hover:bg-slate-700/45">
                            <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.status === 'success' ? 'bg-emerald-500' : item.status === 'error' ? 'bg-red-500' : item.status === 'uploading' ? 'animate-pulse bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">{item.file.name}</p>
                              <p className={`truncate text-[10px] ${item.error ? 'text-red-500' : 'text-slate-400'}`}>{item.error || formatFileSize(item.file.size)}</p>
                            </div>
                            <span className="text-[10px] font-bold text-slate-400">
                              {item.status === 'uploading' ? '上传中' : item.status === 'success' ? '完成' : item.status === 'error' ? '重试' : '等待'}
                            </span>
                            <button type="button" disabled={isUploading} onClick={() => setUploadQueue(current => current.filter(queueItem => queueItem.id !== item.id))} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30" aria-label={`移除 ${item.file.name}`}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={actionableItems.length === 0 || isUploading}
                    onClick={uploadSelectedFiles}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-xs font-black text-white shadow-lg shadow-emerald-500/25 transition-all hover:from-emerald-600 hover:to-teal-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
                  >
                    {isUploading ? <Loader2 size={15} className="animate-spin" /> : <CloudUpload size={15} />}
                    {isUploading
                      ? '正在上传到云端...'
                      : multiple && onInsertMany
                        ? `上传 ${actionableItems.length || ''} 张并加入照片墙`
                        : `上传${actionableItems.length > 0 ? ` ${actionableItems.length} 张` : ''}`}
                  </button>
                </div>
              )
            ) : (
              <div className="flex flex-col gap-4">
                <div className="group relative flex h-36 w-full items-center justify-center overflow-hidden rounded-2xl border border-white/40 bg-white/50 p-2 shadow-inner dark:border-slate-700/50 dark:bg-slate-950/50">
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL and data-URL previews are intentionally unoptimized. */}
                  <img src={uploadedUrl} alt="preview" className="max-h-full max-w-full rounded-xl object-contain drop-shadow-md" />
                  <button type="button" onClick={() => { setUploadedUrl(''); setExternalUrl(''); }} className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                    重新选择
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={copyUrlToClipboard} className="rounded-xl bg-white/60 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-white dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700">🔗 复制链接</button>
                  <button type="button" onClick={insertSelectedImage} className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-500/30 transition-all hover:from-emerald-600 hover:to-teal-600 active:scale-95">✨ {sourceMode === 'photowall' ? '使用图片' : '嵌入图片'}</button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
