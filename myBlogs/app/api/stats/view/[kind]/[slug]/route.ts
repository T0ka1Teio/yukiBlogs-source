import { randomUUID } from 'crypto';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { getRedis } from '@/lib/server/redis';
import {
  DAILY_KEY_TTL_SECONDS,
  VISITOR_COOKIE,
  dailyViewDedupKey,
  hashValue,
  isLikelyBot,
  isOwner,
  legacyArticleViewKey,
  statsCookieOptions,
  validKind,
  validSlug,
  validVisitorId,
  viewKey,
  viewMigrationKey,
} from '@/lib/server/stats';
import { readOrRecordView } from '@/lib/server/statsStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ViewKind = 'post' | 'chatter' | 'moment';
type RouteParams = Promise<{ kind: string; slug: string }>;

async function contentIdentity(params: RouteParams) {
  const { kind, slug } = await params;
  if (!validKind(kind) || !validSlug(slug)) return null;
  return { kind, slug } satisfies { kind: ViewKind; slug: string };
}

function keysFor(kind: ViewKind, slug: string) {
  const currentKey = viewKey(kind, slug);
  return {
    currentKey,
    legacyKey: kind === 'post' ? legacyArticleViewKey(slug) : currentKey,
    migrationKey: viewMigrationKey(kind, slug),
    migrateLegacy: kind === 'post',
  };
}

export async function GET(_request: Request, { params }: { params: RouteParams }) {
  const identity = await contentIdentity(params);
  if (!identity) return NextResponse.json({ success: false, error: '内容标识无效' }, { status: 400 });

  try {
    const keys = keysFor(identity.kind, identity.slug);
    const { views } = await readOrRecordView(getRedis(), {
      ...keys,
      dedupKey: keys.currentKey,
      count: false,
      ttlSeconds: DAILY_KEY_TTL_SECONDS,
    });
    return NextResponse.json(
      { success: true, views },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch {
    return NextResponse.json({ success: false, views: null, error: '统计存储尚未连接' }, { status: 503 });
  }
}

export async function POST(_request: Request, { params }: { params: RouteParams }) {
  const identity = await contentIdentity(params);
  if (!identity) return NextResponse.json({ success: false, error: '内容标识无效' }, { status: 400 });

  try {
    const cookieStore = await cookies();
    const requestHeaders = await headers();
    const redis = getRedis();
    const keys = keysFor(identity.kind, identity.slug);

    if (isOwner(cookieStore) || isLikelyBot(requestHeaders.get('user-agent'))) {
      const { views } = await readOrRecordView(redis, {
        ...keys,
        dedupKey: keys.currentKey,
        count: false,
        ttlSeconds: DAILY_KEY_TTL_SECONDS,
      });
      return NextResponse.json({ success: true, views, counted: false });
    }

    const existingId = cookieStore.get(VISITOR_COOKIE)?.value;
    const visitorId = validVisitorId(existingId) ? existingId! : randomUUID();
    const { counted, views } = await readOrRecordView(redis, {
      ...keys,
      dedupKey: dailyViewDedupKey(identity.kind, identity.slug, hashValue(visitorId)),
      count: true,
      ttlSeconds: DAILY_KEY_TTL_SECONDS,
    });

    const response = NextResponse.json({ success: true, views, counted });
    if (!validVisitorId(existingId)) {
      response.cookies.set(VISITOR_COOKIE, visitorId, statsCookieOptions);
    }
    return response;
  } catch {
    return NextResponse.json({ success: false, views: null, error: '统计存储尚未连接' }, { status: 503 });
  }
}
