"use client";

import BackgroundEffects from './BackgroundEffects';
import BackgroundSlider from './BackgroundSlider';
import { useRuntimeSiteConfig } from './RuntimeSiteConfigProvider';

export default function RuntimeBackgroundLayer() {
  const siteConfig = useRuntimeSiteConfig();
  return (
    <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden">
      {!siteConfig.useGradient && <BackgroundSlider />}
      <div className="absolute inset-0 z-[-9] bg-white/30 dark:bg-slate-900/40 backdrop-blur-md transition-colors duration-1000" />
      <div
        className="absolute inset-0 z-[-8] opacity-60 dark:opacity-20 mix-blend-color transition-opacity duration-1000 transform-gpu"
        style={{
          background: `linear-gradient(-45deg, ${(siteConfig.themeColors || []).join(', ')})`,
          backgroundSize: '400% 400%',
          animation: 'gradientMove 15s ease infinite',
        }}
      />
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-white/40 dark:bg-indigo-900/20 blur-[100px] rounded-full mix-blend-overlay z-[-7]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-400/30 dark:bg-purple-900/30 blur-[100px] rounded-full mix-blend-overlay z-[-7]" />
      <div className="bg-effects-wrapper transition-opacity duration-1000">
        <BackgroundEffects />
      </div>
    </div>
  );
}
