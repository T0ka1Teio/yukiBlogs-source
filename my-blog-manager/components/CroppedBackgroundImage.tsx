"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getBackgroundLayout,
  type BackgroundCrop,
  type BackgroundLayout,
} from '../lib/backgroundCrop';

interface CroppedBackgroundImageProps {
  src: string;
  crop?: BackgroundCrop;
  alt?: string;
  className?: string;
}

function sameLayout(first: BackgroundLayout | null, second: BackgroundLayout) {
  return first
    && Math.abs(first.width - second.width) < 0.5
    && Math.abs(first.height - second.height) < 0.5
    && Math.abs(first.left - second.left) < 0.5
    && Math.abs(first.top - second.top) < 0.5;
}

export default function CroppedBackgroundImage({
  src,
  crop,
  alt = '',
  className = '',
}: CroppedBackgroundImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [layoutState, setLayoutState] = useState<{ src: string; layout: BackgroundLayout } | null>(null);
  const layout = layoutState?.src === src ? layoutState.layout : null;

  const updateLayout = useCallback(() => {
    const container = containerRef.current;
    const image = imageRef.current;
    if (!container || !image?.naturalWidth || !image.naturalHeight) return;

    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nextLayout = getBackgroundLayout(
      rect.width,
      rect.height,
      image.naturalWidth,
      image.naturalHeight,
      crop,
    );
    setLayoutState((current) => (
      current?.src === src && sameLayout(current.layout, nextLayout)
        ? current
        : { src, layout: nextLayout }
    ));
  }, [crop, src]);

  useEffect(() => {
    const frame = requestAnimationFrame(updateLayout);
    const container = containerRef.current;
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateLayout);
    if (container) observer?.observe(container);
    window.addEventListener('resize', updateLayout);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', updateLayout);
    };
  }, [src, updateLayout]);

  return (
    <div ref={containerRef} className={`absolute inset-0 overflow-hidden ${className}`}>
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={updateLayout}
        className="absolute max-w-none select-none"
        style={layout ? {
          width: layout.width,
          height: layout.height,
          left: layout.left,
          top: layout.top,
        } : {
          width: '100%',
          height: '100%',
          left: 0,
          top: 0,
          objectFit: 'cover',
        }}
      />
    </div>
  );
}
