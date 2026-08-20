import assert from 'node:assert/strict';
import test from 'node:test';

import {
  readOrRecordView,
  readVisitorTotal,
  recordDailyVisitor,
  type RedisEval,
} from '../lib/server/statsStore.ts';

function fakeRedis(result: unknown) {
  const calls: Array<{ script: string; keys: string[]; args: string[] }> = [];
  const redis: RedisEval = {
    async eval<TResult>(script: string, keys: string[], args: string[]) {
      calls.push({ script, keys, args });
      return result as TResult;
    },
  };
  return { redis, calls };
}

test('visitor migration and daily increment are issued as one Redis script', async () => {
  const { redis, calls } = fakeRedis([1, 43]);
  const result = await recordDailyVisitor(redis, {
    totalKey: 'total',
    legacySetKey: 'legacy',
    dailySetKey: 'day',
    visitorHash: 'visitor',
    ttlSeconds: 172800,
  });

  assert.deepEqual(result, { added: true, total: 43 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].keys, ['total', 'legacy', 'day']);
  assert.match(calls[0].script, /SCARD/);
  assert.match(calls[0].script, /SADD/);
  assert.match(calls[0].script, /INCR/);
});

test('visitor total initialization is a single atomic Redis read', async () => {
  const { redis, calls } = fakeRedis(42);
  assert.equal(await readVisitorTotal(redis, 'total', 'legacy'), 42);
  assert.equal(calls.length, 1);
  assert.match(calls[0].script, /SCARD/);
});

test('post views migrate the legacy key and count in the same Redis script', async () => {
  const { redis, calls } = fakeRedis([1, 18]);
  const result = await readOrRecordView(redis, {
    currentKey: 'current',
    legacyKey: 'legacy-article',
    migrationKey: 'migrated',
    dedupKey: 'daily-view',
    migrateLegacy: true,
    count: true,
    ttlSeconds: 172800,
  });

  assert.deepEqual(result, { counted: true, views: 18 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].keys, ['current', 'legacy-article', 'migrated', 'daily-view']);
  assert.deepEqual(calls[0].args, ['1', '1', '172800']);
  assert.match(calls[0].script, /INCRBY/);
  assert.match(calls[0].script, /NX/);
});
