"use client";
import { useState, useEffect } from 'react';
import { siteConfig } from '../siteConfig';
import type { BackgroundCrop } from '../lib/backgroundCrop';
import CroppedBackgroundImage from './CroppedBackgroundImage';

export default function BackgroundSlider() {
  const [index, setIndex] = useState(0);
  const images = siteConfig.bgImages;
  const crops = (siteConfig.bgImageCrops || {}) as Record<string, BackgroundCrop>;

  useEffect(() => {
    if (images.length <= 1) return;

    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 10000); // 10秒切换一次

    return () => clearInterval(timer);
  }, [images.length]);

  return (
    <div className="absolute inset-0 z-[-10] overflow-hidden">
      {images.map((img, i) => (
          <div
            key={img}
            className="absolute inset-0 overflow-hidden transition-opacity duration-[2000ms] ease-in-out transform-gpu"
            style={{
              opacity: i === index ? 1 : 0,
              visibility: Math.abs(i - index) <= 1 || (i === images.length - 1 && index === 0) ? 'visible' : 'hidden'
            }}
          >
            <CroppedBackgroundImage src={img} crop={crops[img]} />
          </div>
      ))}
    </div>
  );
}
