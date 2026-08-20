"use client";

import { useEffect, useRef, useState } from 'react';

export default function ArticleViewCounter({ slug }: { slug: string }) {
  const [views, setViews] = useState<number | null>(null);
  const eventId = useRef<string>('');

  useEffect(() => {
    if (!eventId.current) eventId.current = crypto.randomUUID();
    let cancelled = false;
    fetch(`/api/stats/view/post/${encodeURIComponent(slug)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: eventId.current }),
      cache: 'no-store',
      keepalive: true,
    })
      .then(response => response.json())
      .then(data => {
        if (!cancelled && data.success && Number.isFinite(data.views)) setViews(data.views);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [slug]);

  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true">📖</span>
      阅读 {views === null ? '--' : views.toLocaleString('zh-CN')} 次
    </span>
  );
}
