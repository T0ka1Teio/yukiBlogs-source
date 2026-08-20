"use client";

import { useEffect, useState } from 'react';

export default function VisitorCounter() {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/stats/visitor', { method: 'POST', cache: 'no-store' })
      .then(response => response.json())
      .then(data => {
        if (!cancelled && data.success && Number.isFinite(data.total)) setTotal(data.total);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true">👥</span>
      累计访客：
      <span className="text-indigo-600 dark:text-indigo-400 font-black">
        {total === null ? '--' : total.toLocaleString('zh-CN')}
      </span>
    </span>
  );
}
