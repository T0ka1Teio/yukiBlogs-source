"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

export type ViewsKind = 'post' | 'chatter' | 'moment';

export type ViewsBadgeHandle = { trigger: () => void };

type ViewsBadgeProps = {
  kind: ViewsKind;
  slug: string;
  /** 挂载时是否计一次浏览（详情页使用）；卡片列表只展示不计数 */
  countOnMount?: boolean;
  label?: string;
  className?: string;
};

// 🌟 浏览数徽章：贴在封面/卡片上，右下角小胶囊样式。
// 服务端按“单个用户当天浏览 +1”去重，重复挂载/刷新不会刷数字。
const ViewsBadge = forwardRef<ViewsBadgeHandle, ViewsBadgeProps>(function ViewsBadge(
  { kind, slug, countOnMount = false, label = '', className = '' },
  ref,
) {
  const [views, setViews] = useState<number | null>(null);
  const inFlight = useRef(false);
  const pendingCount = useRef(false);

  const load = useCallback(async (count: boolean) => {
    if (inFlight.current) {
      if (count) pendingCount.current = true;
      return;
    }
    inFlight.current = true;

    const request = async (shouldCount: boolean) => {
      try {
        const response = await fetch(
          `/api/stats/view/${encodeURIComponent(kind)}/${encodeURIComponent(slug)}`,
          {
            method: shouldCount ? 'POST' : 'GET',
            cache: 'no-store',
            ...(shouldCount ? { keepalive: true } : {}),
          },
        );
        const data = await response.json();
        if (data.success && Number.isFinite(data.views)) setViews(data.views);
      } catch {
        // 统计接口不可用时静默保持 '--'，不打断页面
      }
    };

    await request(count);
    if (!count && pendingCount.current) {
      pendingCount.current = false;
      await request(true);
    }
    pendingCount.current = false;
    inFlight.current = false;
  }, [kind, slug]);

  useEffect(() => {
    void load(countOnMount);
  }, [countOnMount, load]);

  useImperativeHandle(ref, () => ({
    trigger: () => {
      void load(true);
    },
  }), [load]);

  const shown = views === null ? '--' : views.toLocaleString('zh-CN');

  return (
    <span
      className={`pointer-events-none inline-flex items-center gap-1 rounded-full bg-black/45 backdrop-blur-md text-white text-[10px] md:text-xs font-bold px-2 py-1 border border-white/20 shadow-sm ${className}`}
      title={label ? `已被${label} ${shown} 次` : `浏览次数 ${shown}`}
    >
      <span aria-hidden="true">👁</span>
      <span>{shown}</span>
      {label ? <span className="hidden md:inline opacity-80">{label}</span> : null}
    </span>
  );
});

export default ViewsBadge;
