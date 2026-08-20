import { randomUUID } from 'crypto';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { getRedis } from '@/lib/server/redis';
import {
  DAILY_KEY_TTL_SECONDS,
  VISITOR_COOKIE,
  VISITOR_SET_KEY,
  VISITOR_TOTAL_KEY,
  dailyVisitorSetKey,
  hashValue,
  isLikelyBot,
  isOwner,
  statsCookieOptions,
  validVisitorId,
} from '@/lib/server/stats';
import { readVisitorTotal, recordDailyVisitor } from '@/lib/server/statsStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function currentTotal() {
  return readVisitorTotal(getRedis(), VISITOR_TOTAL_KEY, VISITOR_SET_KEY);
}

export async function GET() {
  try {
    return NextResponse.json(
      { success: true, total: await currentTotal() },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch {
    return NextResponse.json({ success: false, total: null, error: '统计存储尚未连接' }, { status: 503 });
  }
}

export async function POST() {
  try {
    const cookieStore = await cookies();
    const requestHeaders = await headers();
    const redis = getRedis();

    if (isOwner(cookieStore) || isLikelyBot(requestHeaders.get('user-agent'))) {
      return NextResponse.json({ success: true, total: await currentTotal(), counted: false });
    }

    const existingId = cookieStore.get(VISITOR_COOKIE)?.value;
    const visitorId = validVisitorId(existingId) ? existingId! : randomUUID();

    // 单个用户当天访问 +1；迁移、去重与递增由一个 Redis Lua 脚本原子完成。
    const { added, total } = await recordDailyVisitor(redis, {
      totalKey: VISITOR_TOTAL_KEY,
      legacySetKey: VISITOR_SET_KEY,
      dailySetKey: dailyVisitorSetKey(),
      visitorHash: hashValue(visitorId),
      ttlSeconds: DAILY_KEY_TTL_SECONDS,
    });

    const response = NextResponse.json({
      success: true,
      total,
      counted: added,
    });
    if (!validVisitorId(existingId)) {
      response.cookies.set(VISITOR_COOKIE, visitorId, statsCookieOptions);
    }
    return response;
  } catch {
    return NextResponse.json({ success: false, total: null, error: '统计存储尚未连接' }, { status: 503 });
  }
}
