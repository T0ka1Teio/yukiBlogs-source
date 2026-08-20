"use client";

import { useEffect, useState } from 'react';

export default function StatsOwnerPage() {
  const [key, setKey] = useState('');
  const [active, setActive] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [message, setMessage] = useState('正在检查当前浏览器...');

  const refresh = () => fetch('/api/stats/owner', { cache: 'no-store' })
    .then(response => response.json())
    .then(data => {
      setActive(Boolean(data.active));
      setConfigured(Boolean(data.configured));
      setMessage(data.active ? '当前浏览器已排除统计' : '当前浏览器仍会参与统计');
    });

  useEffect(() => { refresh().catch(() => setMessage('状态读取失败')); }, []);

  const enable = async () => {
    const response = await fetch('/api/stats/owner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    const data = await response.json();
    setMessage(data.success ? '设置成功：当前浏览器不再计数' : data.error || '设置失败');
    if (data.success) { setActive(true); setKey(''); }
  };

  const disable = async () => {
    await fetch('/api/stats/owner', { method: 'DELETE' });
    setActive(false);
    setMessage('已恢复：当前浏览器会参与统计');
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-slate-950 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl">
        <p className="text-xs tracking-[0.3em] text-indigo-300 uppercase">Private Stats Control</p>
        <h1 className="mt-3 text-2xl font-black">站长访客排除</h1>
        <p className="mt-3 text-sm text-slate-300">{message}</p>
        {!active && (
          <div className="mt-6 space-y-3">
            <input
              type="password"
              value={key}
              onChange={event => setKey(event.target.value)}
              placeholder={configured ? '输入 STATS_OWNER_KEY' : '请先在 EdgeOne 配置 STATS_OWNER_KEY'}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-indigo-400"
            />
            <button onClick={enable} disabled={!key || !configured} className="w-full rounded-xl bg-indigo-500 px-4 py-3 font-bold disabled:opacity-40">
              排除当前浏览器
            </button>
          </div>
        )}
        {active && <button onClick={disable} className="mt-6 w-full rounded-xl bg-slate-700 px-4 py-3 font-bold">恢复计数</button>}
      </section>
    </main>
  );
}
