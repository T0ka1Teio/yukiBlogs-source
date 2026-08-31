"use client";

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  CheckCircle2,
  CirclePower,
  GripVertical,
  LoaderCircle,
  Music2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Square,
  Trash2,
  XCircle,
} from 'lucide-react';

import type { MusicSourceConfig, MusicTrack } from '../../lib/music/types';
import { useToast } from '../ToastProvider';

type SearchResult = MusicTrack & {
  playable?: boolean;
  resolverSourceName?: string;
  sourcePriority?: number;
};

type Props = {
  formData: {
    cloudMusicIds: string[];
    musicTracks: MusicTrack[];
    musicSources: MusicSourceConfig[];
  };
  handleUpdate: (field: string, value: unknown) => void;
  musicDetails: Record<string, { name?: string; artist?: string; cover?: string; error?: boolean }>;
  queryMusic: (query: string) => Promise<void>;
  queryLoading: boolean;
  queryStage: 'searching' | 'verifying' | null;
  querySummary: string;
  queryResults: SearchResult[];
  addMusicTrack: (track: MusicTrack) => boolean;
  removeSong: (index: number) => void;
  saveMusicSettings: (tracks: MusicTrack[], sources: MusicSourceConfig[]) => Promise<boolean>;
};

type SourceStatus = { state: 'testing' | 'ok' | 'error'; message: string };

const PLATFORM_NAMES: Record<string, string> = {
  wy: '网易云',
  tx: 'QQ 音乐',
  kg: '酷狗',
  kw: '酷我',
  mg: '咪咕',
};

function formatDuration(duration?: number) {
  if (!duration) return '--:--';
  const seconds = Math.floor(duration / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function findResolverSource(track: MusicTrack, sources: MusicSourceConfig[]) {
  return sources.find((source) => source.enabled
    && source.platforms.includes(track.platform)
    && (source.kind === 'lx-script' || track.platform === 'wy'));
}

export default function MusicSection({
  formData,
  handleUpdate,
  musicDetails,
  queryMusic,
  queryLoading,
  queryStage,
  querySummary,
  queryResults,
  addMusicTrack,
  removeSong,
  saveMusicSettings,
}: Props) {
  const { showToast } = useToast();
  const prefersReducedMotion = useReducedMotion();
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [addingSource, setAddingSource] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggedTrackKey, setDraggedTrackKey] = useState<string | null>(null);
  const [dragPreviewTracks, setDragPreviewTracks] = useState<MusicTrack[] | null>(null);
  const [draggedSourceId, setDraggedSourceId] = useState<string | null>(null);
  const [sourceStatuses, setSourceStatuses] = useState<Record<string, SourceStatus>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [previewLoadingKey, setPreviewLoadingKey] = useState<string | null>(null);
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);
  const [previewSourceName, setPreviewSourceName] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewRequestRef = useRef<AbortController | null>(null);
  const trackListRef = useRef<HTMLDivElement | null>(null);
  const trackDragCommittedRef = useRef(false);
  const trackPreviewOrderRef = useRef<MusicTrack[] | null>(null);

  const tracks = formData.musicTracks || [];
  const sources = formData.musicSources || [];
  const displayedTracks = dragPreviewTracks || tracks;

  useEffect(() => () => {
    previewRequestRef.current?.abort();
    previewAudioRef.current?.pause();
    if (previewAudioRef.current) previewAudioRef.current.removeAttribute('src');
  }, []);

  const updateSources = (nextSources: MusicSourceConfig[]) => {
    handleUpdate('musicSources', nextSources);
    setIsDirty(true);
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    void queryMusic(searchQuery);
  };

  const addTrack = (track: MusicTrack) => {
    if (addMusicTrack(track)) setIsDirty(true);
  };

  const removeTrack = (index: number) => {
    removeSong(index);
    setIsDirty(true);
  };

  const beginTrackDrag = (event: DragEvent<HTMLDivElement>, track: MusicTrack) => {
    const card = event.currentTarget.closest<HTMLElement>('[data-track-card]');
    if (card) event.dataTransfer.setDragImage(card, 32, Math.min(card.offsetHeight / 2, 36));
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', track.key);
    trackDragCommittedRef.current = false;
    const initialOrder = [...tracks];
    trackPreviewOrderRef.current = initialOrder;
    setDraggedTrackKey(track.key);
    setDragPreviewTracks(initialOrder);
  };

  const autoScrollTrackList = (clientY: number) => {
    const container = trackListRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const edgeSize = 64;
    if (clientY < bounds.top + edgeSize) {
      const intensity = Math.max(0, (bounds.top + edgeSize - clientY) / edgeSize);
      container.scrollTop -= Math.ceil(18 * intensity);
    } else if (clientY > bounds.bottom - edgeSize) {
      const intensity = Math.max(0, (clientY - (bounds.bottom - edgeSize)) / edgeSize);
      container.scrollTop += Math.ceil(18 * intensity);
    }
  };

  const previewTrackPosition = (event: DragEvent<HTMLDivElement>, hoveredIndex: number) => {
    event.preventDefault();
    if (!draggedTrackKey) return;
    event.dataTransfer.dropEffect = 'move';
    const bounds = event.currentTarget.getBoundingClientRect();
    const insertAfter = event.clientY > bounds.top + bounds.height / 2;
    const hoveredPosition = hoveredIndex + (insertAfter ? 1 : 0);

    setDragPreviewTracks((current) => {
      const orderedTracks = current || trackPreviewOrderRef.current || tracks;
      const fromIndex = orderedTracks.findIndex((track) => track.key === draggedTrackKey);
      if (fromIndex < 0) return orderedTracks;
      let insertIndex = hoveredPosition;
      if (fromIndex < insertIndex) insertIndex -= 1;
      insertIndex = Math.max(0, Math.min(insertIndex, orderedTracks.length - 1));
      if (insertIndex === fromIndex) return orderedTracks;
      const next = [...orderedTracks];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(insertIndex, 0, moved);
      trackPreviewOrderRef.current = next;
      return next;
    });
  };

  const finishTrackDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const finalOrder = trackPreviewOrderRef.current;
    if (!draggedTrackKey || !finalOrder) return;
    trackDragCommittedRef.current = true;
    if (finalOrder.some((track, index) => track.key !== tracks[index]?.key)) {
      handleUpdate('musicTracks', finalOrder);
      setIsDirty(true);
    }
    trackPreviewOrderRef.current = null;
    setDraggedTrackKey(null);
    setDragPreviewTracks(null);
  };

  const endTrackDrag = () => {
    if (!trackDragCommittedRef.current) setDragPreviewTracks(null);
    trackDragCommittedRef.current = false;
    trackPreviewOrderRef.current = null;
    setDraggedTrackKey(null);
  };

  const stopPreview = () => {
    previewRequestRef.current?.abort();
    previewRequestRef.current = null;
    const audio = previewAudioRef.current;
    audio?.pause();
    if (audio) audio.removeAttribute('src');
    setPreviewLoadingKey(null);
    setPreviewingKey(null);
    setPreviewSourceName(null);
  };

  const togglePreview = async (track: MusicTrack) => {
    if (previewingKey === track.key || previewLoadingKey === track.key) {
      stopPreview();
      return;
    }

    previewRequestRef.current?.abort();
    previewAudioRef.current?.pause();
    setPreviewingKey(null);
    setPreviewSourceName(null);
    const controller = new AbortController();
    previewRequestRef.current = controller;
    setPreviewLoadingKey(track.key);

    try {
      const response = await fetch('/api/music/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track, sources }),
        signal: controller.signal,
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok || !result.success || !result.data?.url) {
        throw new Error(result.message || '试听地址解析失败');
      }
      if (controller.signal.aborted) return;
      const audio = previewAudioRef.current;
      if (!audio) throw new Error('试听播放器尚未就绪');
      audio.src = result.data.url;
      audio.load();
      await audio.play();
      setPreviewingKey(track.key);
      setPreviewSourceName(result.data.sourceName || null);
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        showToast(error instanceof Error ? error.message : '试听失败', 'error');
        setPreviewingKey(null);
        setPreviewSourceName(null);
      }
    } finally {
      if (previewRequestRef.current === controller) {
        previewRequestRef.current = null;
        setPreviewLoadingKey(null);
      }
    }
  };

  const addSource = async () => {
    const url = sourceUrl.trim();
    if (!url) {
      showToast('请输入洛雪音源脚本 URL', 'warning');
      return;
    }
    setAddingSource(true);
    try {
      const response = await fetch('/api/music/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '音源检测失败');
      const inspected = result.data;
      if (sources.some((source) => source.id === inspected.id || source.scriptUrl === inspected.scriptUrl)) {
        throw new Error('该音源已经存在');
      }
      const source: MusicSourceConfig = {
        id: inspected.id,
        name: inspected.name,
        kind: 'lx-script',
        enabled: true,
        scriptUrl: inspected.scriptUrl,
        version: inspected.version,
        sha256: inspected.sha256,
        platforms: inspected.platforms,
        qualitys: inspected.qualitys,
      };
      updateSources([...sources, source]);
      setSourceStatuses((current) => ({
        ...current,
        [source.id]: { state: 'ok', message: `支持 ${source.platforms.length} 个平台` },
      }));
      setSourceUrl('');
      showToast(`已添加音源：${source.name}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '音源检测失败', 'error');
    } finally {
      setAddingSource(false);
    }
  };

  const testSource = async (source: MusicSourceConfig) => {
    if (source.kind === 'builtin') {
      setSourceStatuses((current) => ({
        ...current,
        [source.id]: { state: 'ok', message: '内置音源可用' },
      }));
      return;
    }
    setSourceStatuses((current) => ({
      ...current,
      [source.id]: { state: 'testing', message: '正在初始化脚本…' },
    }));
    try {
      const compatibleTrack = tracks.find((track) => source.platforms.includes(track.platform));
      const testTrack = compatibleTrack ? {
        ...compatibleTrack,
        name: compatibleTrack.name || musicDetails[compatibleTrack.id]?.name,
        artist: compatibleTrack.artist || musicDetails[compatibleTrack.id]?.artist,
      } : undefined;
      const response = await fetch('/api/music/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: source.scriptUrl, testTrack }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '测试失败');
      const inspected = result.data;
      updateSources(sources.map((item) => item.id === source.id ? {
        ...item,
        name: inspected.name,
        version: inspected.version,
        sha256: inspected.sha256,
        platforms: inspected.platforms,
        qualitys: inspected.qualitys,
      } : item));
      setSourceStatuses((current) => ({
        ...current,
        [source.id]: {
          state: 'ok',
          message: result.testResolved
            ? `初始化及歌曲解析成功，支持 ${inspected.platforms.length} 个平台`
            : `初始化成功，支持 ${inspected.platforms.length} 个平台；歌单中暂无兼容歌曲可测试`,
        },
      }));
    } catch (error) {
      setSourceStatuses((current) => ({
        ...current,
        [source.id]: { state: 'error', message: error instanceof Error ? error.message : '测试失败' },
      }));
    }
  };

  const removeSource = (source: MusicSourceConfig) => {
    if (!window.confirm(`确认删除音源“${source.name}”吗？`)) return;
    updateSources(sources.filter((item) => item.id !== source.id));
  };

  const toggleSource = (sourceId: string) => {
    updateSources(sources.map((source) => source.id === sourceId
      ? { ...source, enabled: !source.enabled }
      : source));
  };

  const dropSource = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault();
    if (!draggedSourceId || draggedSourceId === targetId) return;
    const fromIndex = sources.findIndex((source) => source.id === draggedSourceId);
    const targetIndex = sources.findIndex((source) => source.id === targetId);
    if (fromIndex < 0 || targetIndex < 0) return;
    const next = [...sources];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(targetIndex, 0, moved);
    updateSources(next);
    setDraggedSourceId(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (await saveMusicSettings(tracks, sources)) setIsDirty(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="space-y-8"
    >
      <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl border border-white/50 dark:border-slate-800/50 rounded-[40px] p-6 md:p-8 shadow-2xl">
        <div className="flex flex-col gap-2 mb-8">
          <h2 className="text-xl font-black text-slate-800 dark:text-white">🎵 歌单管理与搜索</h2>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            输入歌名搜索多个平台；拖动歌单只调整顺序播放时的先后次序。
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">当前歌单</p>
              <span className="text-xs font-bold text-indigo-500">{tracks.length} 首</span>
            </div>
            <div
              ref={trackListRef}
              onDragOver={(event) => {
                event.preventDefault();
                autoScrollTrackList(event.clientY);
              }}
              onDrop={finishTrackDrop}
              className={`relative max-h-[520px] overflow-y-auto pr-2 space-y-2 custom-scrollbar ${draggedTrackKey ? 'select-none' : ''}`}
            >
              {tracks.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-sm text-slate-400">
                  还没有歌曲，请从右侧搜索添加
                </div>
              ) : displayedTracks.map((track, index) => {
                const detail = track.platform === 'wy' ? musicDetails[track.id] : undefined;
                const name = track.name || detail?.name || `歌曲 #${track.id}`;
                const artist = track.artist || detail?.artist || '正在解析歌曲信息';
                const cover = track.cover || detail?.cover;
                const isDropPlaceholder = draggedTrackKey === track.key;
                return (
                  <motion.div
                    key={track.key}
                    layout="position"
                    data-track-card
                    draggable
                    onDragStartCapture={(event) => beginTrackDrag(event, track)}
                    onDragEndCapture={endTrackDrag}
                    onDragOver={(event) => previewTrackPosition(event, index)}
                    transition={prefersReducedMotion
                      ? { duration: 0 }
                      : { layout: { type: 'spring', stiffness: 520, damping: 38, mass: 0.65 } }}
                    className={`group relative min-h-[68px] overflow-hidden rounded-2xl border will-change-transform ${isDropPlaceholder
                      ? 'border-dashed border-indigo-400/80 bg-indigo-500/10 shadow-inner shadow-indigo-500/10'
                      : 'flex items-center gap-3 p-3 bg-white/50 dark:bg-slate-800/50 border-white/30 dark:border-slate-700/50 shadow-sm transition-[border-color,background-color,box-shadow] duration-200 hover:border-indigo-300/60 hover:shadow-md'}`}
                  >
                    {isDropPlaceholder ? (
                      <>
                        <motion.div
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 -left-24 w-24 bg-gradient-to-r from-transparent via-white/35 to-transparent dark:via-indigo-300/10"
                          animate={prefersReducedMotion ? { opacity: 0.15 } : { x: ['0%', '850%'] }}
                          transition={prefersReducedMotion ? { duration: 0 } : { duration: 1.5, repeat: Infinity, ease: 'linear' }}
                        />
                        <div className="relative flex min-h-[68px] items-center gap-3 px-4 text-indigo-500 dark:text-indigo-300">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-indigo-400/40 bg-indigo-500/10">
                            <GripVertical size={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black tracking-wide">释放到此处</p>
                            <p className="mt-0.5 truncate text-[10px] font-bold opacity-65">{name}</p>
                          </div>
                          <span className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-[10px] font-black tabular-nums">
                            #{index + 1}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="cursor-grab active:cursor-grabbing text-slate-400 transition-colors group-hover:text-indigo-500" title="拖动调整顺序播放次序">
                          <GripVertical size={18} />
                        </div>
                        {cover ? (
                          <img src={cover} alt="" className="w-11 h-11 rounded-xl object-cover shadow-sm" />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-indigo-500/10 flex items-center justify-center"><Music2 size={18} className="text-indigo-500" /></div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-slate-800 dark:text-white truncate">{name}</p>
                          <p className="text-[11px] text-slate-500 truncate">{artist} · {PLATFORM_NAMES[track.platform] || track.platform}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeTrack(tracks.findIndex((item) => item.key === track.key))}
                          className="p-2 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                          aria-label={`删除 ${name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">搜索歌曲</p>
            <form onSubmit={submitSearch} className="flex gap-2 mb-5">
              <div className="relative flex-1">
                <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="输入歌曲名或 歌曲名 + 歌手"
                  className="w-full bg-white dark:bg-slate-900 rounded-2xl pl-11 pr-4 py-3 text-sm outline-none ring-1 ring-slate-200 dark:ring-slate-700 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                type="submit"
                disabled={queryLoading}
                className="px-5 rounded-2xl bg-indigo-500 text-white text-xs font-black disabled:opacity-50 flex items-center gap-2"
              >
                {queryLoading ? <LoaderCircle size={16} className="animate-spin" /> : <Search size={16} />}
                {queryStage === 'verifying' ? '验证中' : queryStage === 'searching' ? '搜索中' : '搜索'}
              </button>
            </form>

            {queryLoading && queryStage === 'verifying' ? (
              <div className="mb-4 rounded-2xl bg-indigo-500/10 px-4 py-3 text-xs font-bold text-indigo-600 dark:text-indigo-300 flex items-center gap-2">
                <LoaderCircle size={15} className="animate-spin" />
                正在逐首解析并检测真实音频，请稍候…
              </div>
            ) : querySummary ? (
              <div className="mb-4 rounded-2xl bg-slate-500/10 px-4 py-3 text-xs font-bold text-slate-500">
                {querySummary}
              </div>
            ) : null}

            <div className="max-h-[450px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
              <AnimatePresence mode="popLayout">
                {queryResults.map((result) => {
                  const resolverSource = findResolverSource(result, sources);
                  const isPreviewing = previewingKey === result.key;
                  const isPreviewLoading = previewLoadingKey === result.key;
                  const isAdded = tracks.some((track) => track.key === result.key);
                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={result.key}
                      className="p-3 rounded-2xl bg-white/50 dark:bg-slate-800/50 border border-white/30 dark:border-slate-700/50"
                    >
                      <div className="flex items-center gap-3">
                        {result.cover ? (
                          <img src={result.cover} alt="" className="w-12 h-12 rounded-xl object-cover" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center"><Music2 size={18} /></div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black truncate text-slate-800 dark:text-white">{result.name}</p>
                          <p className="text-[11px] text-slate-500 truncate">{result.artist} · {result.album || '未知专辑'} · {formatDuration(result.duration)}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-bold">
                            <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600">{result.platformName || PLATFORM_NAMES[result.platform] || result.platform}</span>
                            <span className={`px-2 py-0.5 rounded-full ${resolverSource ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                              音源：{isPreviewing && previewSourceName ? previewSourceName : resolverSource?.name || '未配置'}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <button
                            type="button"
                            disabled={!resolverSource}
                            onClick={() => void togglePreview(result)}
                            className={`px-3 py-2 rounded-xl text-white text-[10px] font-black disabled:opacity-40 flex items-center justify-center gap-1.5 ${isPreviewing ? 'bg-rose-500' : 'bg-indigo-500'}`}
                          >
                            {isPreviewLoading ? <LoaderCircle size={13} className="animate-spin" /> : isPreviewing ? <Square size={12} /> : <Play size={13} />}
                            {isPreviewLoading ? '解析中' : isPreviewing ? '停止' : '试听'}
                          </button>
                          <button
                            type="button"
                            disabled={!resolverSource || isAdded}
                            onClick={() => addTrack(result)}
                            className="px-3 py-2 rounded-xl bg-emerald-500 text-white text-[10px] font-black disabled:opacity-40"
                          >
                            {isAdded ? '已添加' : '加入歌单'}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {!queryLoading && queryResults.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">搜索结果仅显示已通过真实音频检测的歌曲</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <audio
        ref={previewAudioRef}
        className="hidden"
        preload="none"
        onEnded={stopPreview}
        onError={() => {
          if (previewingKey) showToast('音频加载失败，请尝试其他音源', 'error');
          stopPreview();
        }}
      />

      <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl border border-white/50 dark:border-slate-800/50 rounded-[40px] p-6 md:p-8 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-black text-slate-800 dark:text-white">🎚️ 音源管理</h2>
            <p className="text-xs text-slate-500 mt-2">拖动调整优先级；播放时从上到下尝试所有已启用音源。</p>
          </div>
          <div className="text-xs font-bold text-slate-500">
            已启用 <span className="text-emerald-500">{sources.filter((source) => source.enabled).length}</span> / {sources.length}
          </div>
        </div>

        <div className="space-y-3 mb-6">
          {sources.map((source, index) => {
            const status = sourceStatuses[source.id];
            return (
              <div
                key={source.id}
                draggable
                onDragStart={() => setDraggedSourceId(source.id)}
                onDragEnd={() => setDraggedSourceId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => dropSource(event, source.id)}
                className={`flex flex-col md:flex-row md:items-center gap-3 p-4 rounded-3xl border transition-all ${draggedSourceId === source.id ? 'opacity-50 border-indigo-500' : 'bg-white/50 dark:bg-slate-800/50 border-white/40 dark:border-slate-700/60'}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="cursor-grab active:cursor-grabbing text-slate-400 p-1" title="拖动调整优先级">
                    <GripVertical size={20} />
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-indigo-500 text-white flex items-center justify-center text-xs font-black">{index + 1}</div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-black text-sm text-slate-800 dark:text-white truncate">{source.name}</p>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-500">{source.version || '未知版本'}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 truncate mt-1">
                      {source.kind === 'builtin' ? '内置解析' : source.scriptUrl} · 支持 {source.platforms.map((item) => PLATFORM_NAMES[item] || item).join(' / ') || '未知平台'}
                    </p>
                    {status ? (
                      <p className={`text-[10px] mt-1 flex items-center gap-1 ${status.state === 'ok' ? 'text-emerald-500' : status.state === 'error' ? 'text-red-500' : 'text-indigo-500'}`}>
                        {status.state === 'ok' ? <CheckCircle2 size={11} /> : status.state === 'error' ? <XCircle size={11} /> : <LoaderCircle size={11} className="animate-spin" />}
                        {status.message}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void testSource(source)}
                    disabled={status?.state === 'testing'}
                    className="p-2.5 rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-300 hover:bg-indigo-500/10 hover:text-indigo-500 disabled:opacity-50"
                    title="测试音源"
                  >
                    <RefreshCw size={16} className={status?.state === 'testing' ? 'animate-spin' : ''} />
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={source.enabled}
                    onClick={() => toggleSource(source.id)}
                    className={`relative w-12 h-7 rounded-full transition-colors ${source.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                    title={source.enabled ? '点击停用' : '点击启用'}
                  >
                    <span className={`absolute left-1 top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${source.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    <CirclePower size={12} className="sr-only" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSource(source)}
                    className="p-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white"
                    title="删除音源"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
          {sources.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-red-300 p-8 text-center text-sm text-red-500">尚未配置音源，播放器将无法解析地址</div>
          ) : null}
        </div>

        <div className="rounded-3xl bg-slate-100/60 dark:bg-slate-800/60 p-4 md:p-5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">增加洛雪音源</p>
          <div className="flex flex-col md:flex-row gap-2">
            <input
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://raw.githubusercontent.com/.../source/1.2.1.js"
              className="flex-1 bg-white dark:bg-slate-900 rounded-2xl px-4 py-3 text-xs outline-none ring-1 ring-slate-200 dark:ring-slate-700 focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => void addSource()}
              disabled={addingSource}
              className="px-5 py-3 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black flex justify-center items-center gap-2 disabled:opacity-50"
            >
              {addingSource ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}
              检测并增加
            </button>
          </div>
          <p className="text-[10px] text-amber-600 mt-3">正式使用请填写固定版本 URL；检测会执行脚本初始化并保存 SHA-256 校验值。</p>
        </div>

        <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <p className={`text-xs font-bold ${isDirty ? 'text-amber-600' : 'text-slate-400'}`}>
            {isDirty ? '存在未保存更改' : '当前配置已保存'}
          </p>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !isDirty}
            className="px-7 py-3.5 rounded-2xl bg-indigo-500 text-white text-sm font-black shadow-lg shadow-indigo-500/20 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving ? <LoaderCircle size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
            保存生效
          </button>
        </div>
        <p className="text-[10px] text-slate-400 text-right mt-2">保存后 Manager 立即生效；线上博客仍需执行同步与部署。</p>
      </div>
    </motion.section>
  );
}
