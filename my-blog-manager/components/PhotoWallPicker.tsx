"use client";

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown, Images, Loader2 } from 'lucide-react';
import { albums as bundledAlbums, type Album } from '../data/albums';
import { loadRuntimeContent } from '../lib/runtimeContentClient';

interface PhotoWallPickerProps {
  selectedUrls: string[];
  onToggle: (url: string) => void;
  multiple?: boolean;
  compact?: boolean;
  selectedItemAction?: 'toggle' | 'edit';
}

export default function PhotoWallPicker({
  selectedUrls,
  onToggle,
  multiple = false,
  compact = false,
  selectedItemAction = 'toggle',
}: PhotoWallPickerProps) {
  const [albums, setAlbums] = useState<Album[]>(bundledAlbums);
  const [activeAlbumId, setActiveAlbumId] = useState(() => bundledAlbums[0]?.id || '');
  const [isLoading, setIsLoading] = useState(true);
  const [isAlbumMenuOpen, setIsAlbumMenuOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const albumListboxId = useId();
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;

    loadRuntimeContent()
      .then((content) => {
        if (cancelled || content.albums.length === 0) return;
        setAlbums(content.albums);
        setActiveAlbumId((current) => (
          content.albums.some((album) => album.id === current)
            ? current
            : content.albums[0]?.id || ''
        ));
      })
      .catch(() => {
        // 保留打包时的照片墙数据作为离线回退。
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isAlbumMenuOpen) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setIsAlbumMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsAlbumMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isAlbumMenuOpen]);

  const activeAlbum = useMemo(
    () => albums.find((album) => album.id === activeAlbumId) || albums[0],
    [activeAlbumId, albums],
  );
  const photos = activeAlbum?.photos.filter((photo) => Boolean(photo.url)) || [];

  const selectAlbum = (albumId: string) => {
    setActiveAlbumId(albumId);
    setIsAlbumMenuOpen(false);
  };

  return (
    <div ref={pickerRef} className="w-full rounded-2xl border border-slate-200/80 bg-white/45 p-4 dark:border-slate-700/70 dark:bg-slate-950/35">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Images size={18} className="shrink-0 text-indigo-500" />
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-700 dark:text-slate-200">从照片墙选择</p>
            <p className="text-[10px] font-bold text-slate-400">{multiple ? '可选择多张图片' : '选择一张图片'}</p>
          </div>
        </div>
        {multiple && selectedUrls.length > 0 && (
          <span className="shrink-0 rounded-full bg-indigo-500/10 px-2.5 py-1 text-[10px] font-black text-indigo-500">
            已选 {selectedUrls.length}
          </span>
        )}
      </div>

      {albums.length > 0 ? (
        <>
          <div className="relative z-30 mb-3">
            <button
              type="button"
              aria-label="选择照片墙相册"
              aria-haspopup="listbox"
              aria-expanded={isAlbumMenuOpen}
              aria-controls={albumListboxId}
              onClick={() => setIsAlbumMenuOpen((open) => !open)}
              className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left outline-none transition duration-200 focus:ring-2 focus:ring-indigo-500/25 ${
                isAlbumMenuOpen
                  ? 'border-indigo-400/70 bg-white shadow-lg shadow-indigo-500/10 dark:border-indigo-500/60 dark:bg-slate-800'
                  : 'border-slate-200/90 bg-white/70 hover:border-indigo-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800/70 dark:hover:border-indigo-500/60'
              }`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
                  <Images size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-black text-slate-700 dark:text-slate-100">{activeAlbum?.title}</span>
                  <span className="mt-0.5 block text-[9px] font-bold text-slate-400">{photos.length} 张照片</span>
                </span>
              </span>
              <motion.span
                animate={{ rotate: isAlbumMenuOpen ? 180 : 0 }}
                transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 30 }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-700"
              >
                <ChevronDown size={15} />
              </motion.span>
            </button>

            <AnimatePresence>
              {isAlbumMenuOpen && (
                <motion.div
                  id={albumListboxId}
                  role="listbox"
                  aria-label="照片墙相册"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
                  transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                  className="custom-scrollbar absolute left-0 right-0 top-[calc(100%+0.5rem)] max-h-56 overflow-y-auto rounded-2xl border border-white/70 bg-white/95 p-1.5 shadow-2xl shadow-slate-900/15 backdrop-blur-2xl dark:border-slate-700/80 dark:bg-slate-900/95"
                >
                  {albums.map((album) => {
                    const isActive = album.id === activeAlbum?.id;
                    return (
                      <button
                        key={album.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onClick={() => selectAlbum(album.id)}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500/40 ${
                          isActive
                            ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                            : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300'
                        }`}
                      >
                        <span className="min-w-0 truncate text-xs font-black">{album.title}</span>
                        <span className={`flex shrink-0 items-center gap-1.5 text-[9px] font-black ${isActive ? 'text-white/75' : 'text-slate-400'}`}>
                          {album.photos.length} 张
                          {isActive && <Check size={13} strokeWidth={3} />}
                        </span>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="custom-scrollbar max-h-60 overflow-y-auto pr-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeAlbum?.id || 'empty'}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
                className={`grid ${compact ? 'grid-cols-3 gap-2' : 'grid-cols-3 gap-3 sm:grid-cols-4'}`}
              >
                {photos.map((photo, index) => {
                  const isSelected = selectedUrls.includes(photo.url);
                  const label = photo.caption || `${activeAlbum?.title || '照片墙'}第 ${index + 1} 张图片`;

                  return (
                    <motion.button
                      key={`${photo.url}-${index}`}
                      type="button"
                      aria-label={`${isSelected ? selectedItemAction === 'edit' ? '重新选择显示区域' : '取消选择' : '选择'}${label}`}
                      aria-pressed={isSelected}
                      onClick={() => onToggle(photo.url)}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                      className={`group relative aspect-square overflow-hidden rounded-xl border-2 text-left transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                        isSelected
                          ? 'border-indigo-500 shadow-lg shadow-indigo-500/20'
                          : 'border-transparent hover:border-indigo-400/70'
                      }`}
                    >
                      <img src={photo.url} alt={label} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      <span className={`absolute inset-0 transition-colors ${isSelected ? 'bg-indigo-950/35' : 'bg-black/0 group-hover:bg-black/15'}`} />
                      {isSelected && (
                        <motion.span
                          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.65 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg"
                        >
                          <Check size={14} strokeWidth={3} />
                        </motion.span>
                      )}
                    </motion.button>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>

          {photos.length === 0 && (
            <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-slate-300 text-xs font-bold text-slate-400 dark:border-slate-700">
              这个相册暂时没有照片
            </div>
          )}
        </>
      ) : (
        <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-slate-300 text-xs font-bold text-slate-400 dark:border-slate-700">
          照片墙暂时没有可选图片
        </div>
      )}

      {isLoading && (
        <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-bold text-slate-400">
          <Loader2 size={12} className="animate-spin" /> 正在读取最新照片墙
        </div>
      )}
    </div>
  );
}
