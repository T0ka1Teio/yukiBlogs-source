"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Crop, Loader2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import type { BackgroundCrop } from '../../lib/backgroundCrop';
import { buildCropImageCandidates } from '../../lib/cropImageSources';
import { useToast } from '../ToastProvider';

export const COVER_CROP_WIDTH = 1280;
export const COVER_CROP_HEIGHT = 720;
export const COVER_CROP_ASPECT = COVER_CROP_WIDTH / COVER_CROP_HEIGHT;
export const COVER_CROPPER_Z_INDEX = 2_147_483_000;

type Offset = { x: number; y: number };

interface CoverCropperProps {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
  onComplete: (url: string, crop?: BackgroundCrop) => void;
  outputWidth?: number;
  outputHeight?: number;
  title?: string;
  description?: string;
  ratioLabel?: string;
  successMessage?: string;
  reuseSourceUrl?: boolean;
  initialCrop?: BackgroundCrop;
}

export function getCoverCropMetrics(
  imageWidth: number,
  imageHeight: number,
  zoom: number,
  outputWidth = COVER_CROP_WIDTH,
  outputHeight = COVER_CROP_HEIGHT,
) {
  const baseScale = Math.max(outputWidth / imageWidth, outputHeight / imageHeight);
  const scale = baseScale * zoom;
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;

  return {
    drawWidth,
    drawHeight,
    maxOffsetX: Math.max(0, (drawWidth - outputWidth) / 2),
    maxOffsetY: Math.max(0, (drawHeight - outputHeight) / 2),
  };
}

function clampOffset(
  offset: Offset,
  image: HTMLImageElement,
  zoom: number,
  outputWidth: number,
  outputHeight: number,
): Offset {
  const metrics = getCoverCropMetrics(
    image.naturalWidth,
    image.naturalHeight,
    zoom,
    outputWidth,
    outputHeight,
  );
  return {
    x: Math.max(-metrics.maxOffsetX, Math.min(metrics.maxOffsetX, offset.x)),
    y: Math.max(-metrics.maxOffsetY, Math.min(metrics.maxOffsetY, offset.y)),
  };
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('浏览器没有生成裁剪图片'));
      }, 'image/jpeg', 0.92);
    } catch (error) {
      reject(error);
    }
  });
}

async function getBackendBase() {
  const response = await fetch(`/backend_config.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('无法读取控制台后端配置');
  const config = await response.json() as { api_port?: number };
  if (!Number.isInteger(config.api_port)) throw new Error('本地后端端口无效');
  return `http://127.0.0.1:${config.api_port}`;
}

function normalizeDimension(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Math.round(Number(value)) : fallback;
}

export default function CoverCropper({
  isOpen,
  imageUrl,
  onClose,
  onComplete,
  outputWidth,
  outputHeight,
  title = '裁剪封面',
  description,
  ratioLabel,
  successMessage,
  reuseSourceUrl = false,
  initialCrop,
}: CoverCropperProps) {
  const { showToast } = useToast();
  const cropWidth = normalizeDimension(outputWidth, COVER_CROP_WIDTH);
  const cropHeight = normalizeDimension(outputHeight, COVER_CROP_HEIGHT);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    offset: Offset;
  } | null>(null);

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    let cancelled = false;
    let nextImage: HTMLImageElement | null = null;

    setImage(null);
    setLoadError('');
    setZoom(initialCrop?.zoom || 1);
    setOffset({
      x: (initialCrop?.offsetX || 0) * cropWidth,
      y: (initialCrop?.offsetY || 0) * cropHeight,
    });

    const loadImage = async () => {
      let backendBase: string | null = null;
      if (/^https?:\/\//i.test(imageUrl)) {
        try {
          backendBase = await getBackendBase();
        } catch {
          // 后端暂不可用时保留浏览器直连候选。
        }
      }

      if (cancelled) return;
      const candidates = buildCropImageCandidates(imageUrl, backendBase, reuseSourceUrl);

      const tryCandidate = (candidateIndex: number) => {
        const candidate = candidates[candidateIndex];
        if (cancelled) return;
        if (!candidate) {
          setLoadError('图片读取失败，请检查链接或图片访问权限后重试');
          return;
        }

        const candidateImage = new Image();
        nextImage = candidateImage;
        if (candidate.crossOrigin) candidateImage.crossOrigin = candidate.crossOrigin;
        if (candidate.referrerPolicy) candidateImage.referrerPolicy = candidate.referrerPolicy;
        candidateImage.decoding = 'async';
        candidateImage.onload = () => {
          if (cancelled) return;
          const restoredZoom = Math.max(1, Math.min(3, initialCrop?.zoom || 1));
          const restoredOffset = clampOffset(
            {
              x: (initialCrop?.offsetX || 0) * cropWidth,
              y: (initialCrop?.offsetY || 0) * cropHeight,
            },
            candidateImage,
            restoredZoom,
            cropWidth,
            cropHeight,
          );
          setImage(candidateImage);
          setZoom(restoredZoom);
          setOffset(restoredOffset);
        };
        candidateImage.onerror = () => {
          candidateImage.onload = null;
          candidateImage.onerror = null;
          tryCandidate(candidateIndex + 1);
        };
        candidateImage.src = candidate.source;
      };

      tryCandidate(0);
    };

    void loadImage();

    return () => {
      cancelled = true;
      if (nextImage) {
        nextImage.onload = null;
        nextImage.onerror = null;
      }
    };
  }, [cropHeight, cropWidth, imageUrl, initialCrop?.offsetX, initialCrop?.offsetY, initialCrop?.zoom, isOpen, reuseSourceUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const metrics = getCoverCropMetrics(
      image.naturalWidth,
      image.naturalHeight,
      zoom,
      cropWidth,
      cropHeight,
    );
    const drawX = (cropWidth - metrics.drawWidth) / 2 + offset.x;
    const drawY = (cropHeight - metrics.drawHeight) / 2 + offset.y;

    context.clearRect(0, 0, cropWidth, cropHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, drawX, drawY, metrics.drawWidth, metrics.drawHeight);
  }, [cropHeight, cropWidth, image, offset, zoom]);

  const updateZoom = useCallback((nextZoom: number) => {
    if (!image) return;
    const normalizedZoom = Math.max(1, Math.min(3, nextZoom));
    setZoom(normalizedZoom);
    setOffset((current) => clampOffset(current, image, normalizedZoom, cropWidth, cropHeight));
  }, [cropHeight, cropWidth, image]);

  const resetCrop = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!image) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offset,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !image) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const outputScale = cropWidth / rect.width;
    const nextOffset = {
      x: drag.offset.x + (event.clientX - drag.startX) * outputScale,
      y: drag.offset.y + (event.clientY - drag.startY) * outputScale,
    };
    setOffset(clampOffset(nextOffset, image, zoom, cropWidth, cropHeight));
  };

  const stopDragging = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  };

  const saveCrop = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !image || isSaving) return;

    if (reuseSourceUrl) {
      onComplete(imageUrl, {
        zoom,
        offsetX: offset.x / cropWidth,
        offsetY: offset.y / cropHeight,
      });
      showToast(successMessage || '✅ 显示区域已保存，图片继续使用原始 URL', 'success');
      return;
    }

    setIsSaving(true);
    try {
      const blob = await canvasToJpeg(canvas);
      const backendBase = await getBackendBase();

      const formData = new FormData();
      formData.append('file', blob, `cover-${cropWidth}x${cropHeight}-${Date.now()}.jpg`);
      const uploadResponse = await fetch(`${backendBase}/api/picbed/upload-cover`, {
        method: 'POST',
        body: formData,
      });
      if (!uploadResponse.ok) throw new Error(`裁剪图片上传失败（HTTP ${uploadResponse.status}）`);

      const result = await uploadResponse.json();
      if (!result.success || !result.url) {
        throw new Error(result.message || '图床没有返回裁剪图片链接');
      }

      onComplete(result.url);
      showToast(successMessage || '✅ 封面已按 16:9 裁剪并保存', 'success');
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'SecurityError'
        ? '该图片来源不允许浏览器裁剪，请换用照片墙中的图片'
        : error instanceof Error ? error.message : '封面裁剪失败';
      showToast(`❌ ${message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isMounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 isolate flex items-center justify-center p-4"
          style={{ zIndex: COVER_CROPPER_Z_INDEX }}
        >
          <motion.button
            type="button"
            aria-label={`关闭${title}`}
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/80"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cover-crop-title"
            initial={false}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 20 }}
            className="relative max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-[36px] border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-200/70 px-6 py-5 dark:border-slate-700/70">
              <div>
                <h3 id="cover-crop-title" className="flex items-center gap-2 text-lg font-black text-slate-900 dark:text-white">
                  <Crop size={20} className="text-indigo-500" /> {title}
                </h3>
                <p className="mt-1 text-xs font-bold text-slate-400">
                  {description || '拖动图片选择区域，输出比例固定为 16:9'}
                </p>
              </div>
              <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-red-500 hover:text-white dark:bg-slate-800">
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              <div
                className="relative w-full overflow-hidden rounded-[28px] bg-slate-950 shadow-inner"
                style={{ aspectRatio: `${cropWidth} / ${cropHeight}` }}
              >
                <canvas
                  ref={canvasRef}
                  width={cropWidth}
                  height={cropHeight}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={stopDragging}
                  onPointerCancel={stopDragging}
                  className="block h-full w-full touch-none cursor-grab select-none active:cursor-grabbing"
                />

                <div className="pointer-events-none absolute inset-0">
                  <span className="absolute inset-y-0 left-1/3 w-px bg-white/35" />
                  <span className="absolute inset-y-0 right-1/3 w-px bg-white/35" />
                  <span className="absolute inset-x-0 top-1/3 h-px bg-white/35" />
                  <span className="absolute inset-x-0 bottom-1/3 h-px bg-white/35" />
                  <span className="absolute inset-0 rounded-[28px] border-2 border-white/70 shadow-[inset_0_0_0_999px_rgba(15,23,42,0.08)]" />
                </div>

                {!image && !loadError && (
                  <div className="absolute inset-0 flex items-center justify-center gap-3 bg-slate-950/80 text-sm font-bold text-slate-300">
                    <Loader2 size={20} className="animate-spin text-indigo-400" /> 正在读取图片
                  </div>
                )}
                {loadError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 px-8 text-center text-sm font-bold text-red-300">
                    {loadError}
                  </div>
                )}
                <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1.5 text-[10px] font-black tracking-wider text-white backdrop-blur-md">
                  {ratioLabel || `16:9 · ${cropWidth} × ${cropHeight}`}
                </div>
              </div>

              <div className="mt-5 flex items-center gap-4 rounded-2xl bg-slate-100/80 px-4 py-3 dark:bg-slate-800/70">
                <button type="button" aria-label="缩小封面" onClick={() => updateZoom(zoom - 0.1)} disabled={!image || zoom <= 1} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm transition hover:text-indigo-500 disabled:opacity-40 dark:bg-slate-700 dark:text-slate-200">
                  <Minus size={16} />
                </button>
                <input
                  aria-label="封面缩放"
                  type="range"
                  min="1"
                  max="3"
                  step="0.01"
                  value={zoom}
                  disabled={!image}
                  onChange={(event) => updateZoom(Number(event.target.value))}
                  className="h-2 flex-1 cursor-pointer accent-indigo-500 disabled:opacity-40"
                />
                <button type="button" aria-label="放大封面" onClick={() => updateZoom(zoom + 0.1)} disabled={!image || zoom >= 3} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm transition hover:text-indigo-500 disabled:opacity-40 dark:bg-slate-700 dark:text-slate-200">
                  <Plus size={16} />
                </button>
                <span className="w-12 text-right text-xs font-black text-indigo-500">{zoom.toFixed(2)}×</span>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={resetCrop} disabled={!image || isSaving} className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-5 py-3 text-xs font-black text-slate-600 transition hover:bg-slate-200 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                  <RotateCcw size={15} /> 重置区域
                </button>
                <button type="button" onClick={onClose} disabled={isSaving} className="rounded-2xl px-5 py-3 text-xs font-black text-slate-500 transition hover:text-slate-900 disabled:opacity-40 dark:hover:text-white">
                  取消
                </button>
                <button type="button" onClick={saveCrop} disabled={!image || Boolean(loadError) || isSaving} className="flex min-w-36 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3 text-xs font-black text-white shadow-lg shadow-indigo-500/25 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50">
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Crop size={16} />}
                  {isSaving ? '正在上传...' : reuseSourceUrl ? '应用显示区域' : '应用裁剪'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
