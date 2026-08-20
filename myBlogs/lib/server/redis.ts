import 'server-only';

import { Redis } from '@upstash/redis';

let redisClient: Redis | null = null;

export function getRedis() {
  if (redisClient) return redisClient;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('Redis environment variables are not configured');
  }
  redisClient = new Redis({ url, token });
  return redisClient;
}
