import 'katex/dist/katex.min.css';
import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Serif_SC } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "../components/ThemeProvider";
import { MusicProvider } from "../components/MusicProvider";
import FloatingPlayer from "../components/FloatingPlayer";
import { siteConfig } from "../siteConfig";
import ClickEffect from "../components/ClickEffect";
import GlobalToolbox from "../components/GlobalToolbox";
import SplashScreen from "../components/SplashScreen";
import { OperationProvider } from "../context/OperationContext";
import { ToastProvider } from '../components/ToastProvider';
import CyberCat from '../components/CyberCat';
import DanmakuBackground from '../components/DanmakuBackground';
import GlobalSnow from '../components/GlobalSnow';
import RuntimeBackgroundLayer from '../components/RuntimeBackgroundLayer';
import { RuntimeSiteConfigProvider } from '../components/RuntimeSiteConfigProvider';

// 🌟 1. 引入 Next.js 官方脚本组件
import Script from 'next/script';

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const notoSerif = Noto_Serif_SC({ subsets: ["latin"], weight: ["400", "700", "900"], variable: "--font-serif", display: 'swap' });

export const metadata: Metadata = {
  title: siteConfig.title,
  description: siteConfig.bio,
  icons: { icon: siteConfig.faviconUrl, apple: siteConfig.faviconUrl },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} ${notoSerif.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* 🌟 2. 这里的 CSS 逻辑保持原样，因为 style 标签在 React 中是受支持的 */}
        <style
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              #app-mount-root { opacity: 0; visibility: hidden; pointer-events: none; }
              html.splash-seen #app-mount-root { opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; }
            `
          }}
        />

        {/* 🌟 3. 核心修复：使用 <Script> 组件替代原生 <script> */}
        {/* strategy="beforeInteractive" 确保脚本在页面交互前执行，防止闪屏 */}
        <Script id="handle-splash-logic" strategy="beforeInteractive">
          {`
            try {
              if (sessionStorage.getItem('hasSeenSplash') === 'true') {
                document.documentElement.classList.add('splash-seen');
              }
            } catch (e) {}
          `}
        </Script>
      </head>

      <body className="w-screen overflow-x-hidden min-h-full flex flex-col relative transition-colors duration-1000 bg-slate-50 dark:bg-slate-950 font-serif">
        <RuntimeSiteConfigProvider>
          <ThemeProvider>
            <OperationProvider>
              <ToastProvider>
              <SplashScreen />
              <MusicProvider>
                <div id="app-mount-root" className="flex-1 flex flex-col transition-opacity duration-1000">
                  <RuntimeBackgroundLayer />

                  <DanmakuBackground />
                  <GlobalSnow />

                  <div className="relative z-10 flex-1 flex flex-col">
                    {children}
                  </div>

                  <FloatingPlayer />
                  <GlobalToolbox />
                  <ClickEffect />
                </div>

                <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `
                  @keyframes gradientMove { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
                  body.winter-mode .bg-effects-wrapper { opacity: 0 !important; visibility: hidden; }
                  .winter-mode .snow-cap { position: relative !important; overflow: visible !important; }
                  .dark.winter-mode .snow-cap {
                    background-color: rgba(23, 37, 84, 0.4) !important;
                    border-color: rgba(59, 130, 246, 0.3) !important;
                    backdrop-filter: blur(12px) brightness(80%) !important;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important;
                  }
                  body.winter-mode .snow-cap {
                    background-color: rgba(239, 246, 255, 0.45) !important;
                    border-color: rgba(191, 219, 254, 0.6) !important;
                    backdrop-filter: blur(12px) saturate(120%) !important;
                    box-shadow: 0 8px 32px rgba(191, 219, 254, 0.25) !important;
                    transition: all 0.7s ease !important;
                  }
                `}} />
              </MusicProvider>
              </ToastProvider>
            </OperationProvider>
          </ThemeProvider>
          <CyberCat />
        </RuntimeSiteConfigProvider>
      </body>
    </html>
  );
}
