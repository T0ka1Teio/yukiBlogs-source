import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'crypto';

export const OWNER_COOKIE = 'yb_owner';
export const VISITOR_COOKIE = 'yb_vid';
export const VISITOR_SET_KEY = 'yukiblogs:stats:visitors';

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

export function hashValue(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function expectedOwnerCookie() {
  const key = process.env.STATS_OWNER_KEY;
  return key ? createHmac('sha256', key).update('yukiblogs-owner').digest('hex') : '';
}

export function isOwner(cookies: CookieReader) {
  const actual = cookies.get(OWNER_COOKIE)?.value || '';
  const expected = expectedOwnerCookie();
  if (!actual || !expected || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function ownerKeyMatches(input: string) {
  const expected = process.env.STATS_OWNER_KEY || '';
  if (!input || !expected) return false;
  const actualDigest = createHash('sha256').update(input).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function isLikelyBot(userAgent: string | null) {
  return /bot|crawler|spider|slurp|preview|headless|lighthouse|vercel-screenshot/i.test(userAgent || '');
}

export function validVisitorId(value: string | undefined) {
  return Boolean(value && /^[0-9a-f-]{36}$/i.test(value));
}

export function validSlug(value: string) {
  return value.length > 0 && value.length <= 180 && /^[\p{L}\p{N}._-]+$/u.test(value);
}

export const statsCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
};

// 🌟 累计访客总计数（单个用户当天访问 +1，逐日累加）
export const VISITOR_TOTAL_KEY = 'yukiblogs:stats:visitors:total';

// 每日去重键的过期时间（48 小时足够跨天清理，键名本身带日期保证正确性）
export const DAILY_KEY_TTL_SECONDS = 60 * 60 * 48;

// 支持统计的内容类型：文章 / 杂谈 / 说说
export const VIEW_KINDS = new Set(['post', 'chatter', 'moment']);

export function validKind(value: string | null): value is 'post' | 'chatter' | 'moment' {
  return Boolean(value && VIEW_KINDS.has(value));
}

// 按上海时区计算“当天”日期键（YYYY-MM-DD），保证国内用户跨天判定一致
export function shanghaiDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function dailyVisitorSetKey(day = shanghaiDayKey()) {
  return `yukiblogs:stats:visitors:day:${day}`;
}

export function viewKey(kind: 'post' | 'chatter' | 'moment', slug: string) {
  return `yukiblogs:stats:view:${kind}:${slug}`;
}

export function legacyArticleViewKey(slug: string) {
  return `yukiblogs:stats:article:${slug}:views`;
}

export function viewMigrationKey(kind: 'post' | 'chatter' | 'moment', slug: string) {
  return `yukiblogs:stats:view:migration:${kind}:${slug}`;
}

export function dailyViewDedupKey(
  kind: 'post' | 'chatter' | 'moment',
  slug: string,
  visitorHash: string,
  day = shanghaiDayKey(),
) {
  return `yukiblogs:stats:view:${kind}:${slug}:${day}:${visitorHash}`;
}
