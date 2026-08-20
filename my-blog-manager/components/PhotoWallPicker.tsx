"use client";

import { useEffect, useMemo, useState } from 'react';
import { Check, Images, Loader2 } from 'lucide-react';
import { albums as bundledAlbums, type Album } from '../data/albums';
import { loadRuntimeContent } from '../lib/runtimeContentClient';

interface PhotoWallPickerProps {
  selectedUrls: string[];
  onToggle: (url: string) => void;
  multiple?: boolean;
  compact?: boolean;
}

export default function PhotoWallPicker({
  selectedUrls,
  onToggle,
  multiple = false,
  compact = false,
}: PhotoWallPickerProps) {
  const [albums, setAlbums] = useState<Album[]>(bundledAlbums);
  const [activeAlbumId, setActiveAlbumId] = useState(() => bundledAlbums[0]?.id || '');
  const [isLoading, setIsLoading] = useState(true);

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

  const activeAlbum = useMemo(
    () => albums.find((album) => album.id === activeAlbumId) || albums[0],
    [activeAlbumId, albums],
  );
  const photos = activeAlbum?.photos.filter((photo) => Boolean(photo.url)) || [];

  return (
    <div className="w-full rounded-2xl border border-slate-200/80 bg-white/45 p-4 dark:border-slate-700/70 dark:bg-slate-950/35">
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
          <label className="mb-3 block">
            <span className="sr-only">选择照片墙相册</span>
            <select
              aria-label="选择照片墙相册"
              value={activeAlbum?.id || ''}
              onChange={(event) => setActiveAlbumId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs font-bold text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200"
            >
              {albums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.title}（{album.photos.length}）
                </option>
              ))}
            </select>
          </label>

          <div className={`custom-scrollbar grid max-h-60 overflow-y-auto pr-1 ${compact ? 'grid-cols-3 gap-2' : 'grid-cols-3 gap-3 sm:grid-cols-4'}`}>
            {photos.map((photo, index) => {
              const isSelected = selectedUrls.includes(photo.url);
              const label = photo.caption || `${activeAlbum?.title || '照片墙'}第 ${index + 1} 张图片`;

              return (
                <button
                  key={`${photo.url}-${index}`}
                  type="button"
                  aria-label={`${isSelected ? '取消选择' : '选择'}${label}`}
                  aria-pressed={isSelected}
                  onClick={() => onToggle(photo.url)}
                  className={`group relative aspect-square overflow-hidden rounded-xl border-2 text-left transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                    isSelected
                      ? 'border-indigo-500 shadow-lg shadow-indigo-500/20'
                      : 'border-transparent hover:border-indigo-400/70'
                  }`}
                >
                  <img src={photo.url} alt={label} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  <span className={`absolute inset-0 transition-colors ${isSelected ? 'bg-indigo-950/35' : 'bg-black/0 group-hover:bg-black/15'}`} />
                  {isSelected && (
                    <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg">
                      <Check size={14} strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
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
