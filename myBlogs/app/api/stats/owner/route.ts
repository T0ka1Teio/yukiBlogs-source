import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { getRedis } from '@/lib/server/redis';
import {
  OWNER_COOKIE,
  VISITOR_COOKIE,
  VISITOR_SET_KEY,
  dailyVisitorSetKey,
  expectedOwnerCookie,
  hashValue,
  isOwner,
  ownerKeyMatches,
  statsCookieOptions,
} from '@/lib/server/stats';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const cookieStore = await cookies();
  return NextResponse.json({ success: true, active: isOwner(cookieStore), configured: Boolean(expectedOwnerCookie()) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { key?: unknown };
  const key = typeof body.key === 'string' ? body.key : '';
  if (!expectedOwnerCookie()) {
    return NextResponse.json({ success: false, error: 'STATS_OWNER_KEY 尚未配置' }, { status: 503 });
  }
  if (!ownerKeyMatches(key)) {
    return NextResponse.json({ success: false, error: '站长密钥错误' }, { status: 403 });
  }

  const cookieStore = await cookies();
  const visitorId = cookieStore.get(VISITOR_COOKIE)?.value;
  if (visitorId) {
    try {
      const redis = getRedis();
      await redis.srem(VISITOR_SET_KEY, hashValue(visitorId));
      // 🌟 同时把站长从“当天访客集合”里移除，避免计入当日计数
      await redis.srem(dailyVisitorSetKey(), hashValue(visitorId));
    } catch {}
  }
  const response = NextResponse.json({ success: true, active: true });
  response.cookies.set(OWNER_COOKIE, expectedOwnerCookie(), statsCookieOptions);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true, active: false });
  response.cookies.set(OWNER_COOKIE, '', { ...statsCookieOptions, maxAge: 0 });
  return response;
}
