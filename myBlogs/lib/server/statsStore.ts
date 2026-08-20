export type RedisEval = {
  eval<TResult = unknown>(script: string, keys: string[], args: string[]): Promise<TResult>;
};

const READ_VISITOR_TOTAL_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  redis.call('SET', KEYS[1], redis.call('SCARD', KEYS[2]))
end
return tonumber(redis.call('GET', KEYS[1]) or '0')
`;

const RECORD_DAILY_VISITOR_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  redis.call('SET', KEYS[1], redis.call('SCARD', KEYS[2]))
end
local added = redis.call('SADD', KEYS[3], ARGV[1])
if added == 1 then
  redis.call('INCR', KEYS[1])
  redis.call('EXPIRE', KEYS[3], tonumber(ARGV[2]))
end
return { added, tonumber(redis.call('GET', KEYS[1]) or '0') }
`;

const READ_OR_RECORD_VIEW_SCRIPT = `
if ARGV[1] == '1' and redis.call('EXISTS', KEYS[3]) == 0 then
  local legacy = tonumber(redis.call('GET', KEYS[2]) or '0')
  if legacy > 0 then
    redis.call('INCRBY', KEYS[1], legacy)
  end
  redis.call('SET', KEYS[3], '1')
end
local counted = 0
if ARGV[2] == '1' then
  local accepted = redis.call('SET', KEYS[4], '1', 'NX', 'EX', tonumber(ARGV[3]))
  if accepted then
    counted = 1
    redis.call('INCR', KEYS[1])
  end
end
return { counted, tonumber(redis.call('GET', KEYS[1]) or '0') }
`;

function pair(result: unknown): [number, number] {
  if (!Array.isArray(result) || result.length < 2) {
    throw new Error('Redis statistics script returned an invalid result');
  }
  return [Number(result[0]), Number(result[1])];
}

export async function readVisitorTotal(
  redis: RedisEval,
  totalKey: string,
  legacySetKey: string,
) {
  return Number(await redis.eval(READ_VISITOR_TOTAL_SCRIPT, [totalKey, legacySetKey], []));
}

export async function recordDailyVisitor(
  redis: RedisEval,
  input: {
    totalKey: string;
    legacySetKey: string;
    dailySetKey: string;
    visitorHash: string;
    ttlSeconds: number;
  },
) {
  const [added, total] = pair(await redis.eval(
    RECORD_DAILY_VISITOR_SCRIPT,
    [input.totalKey, input.legacySetKey, input.dailySetKey],
    [input.visitorHash, String(input.ttlSeconds)],
  ));
  return { added: added === 1, total };
}

export async function readOrRecordView(
  redis: RedisEval,
  input: {
    currentKey: string;
    legacyKey: string;
    migrationKey: string;
    dedupKey: string;
    migrateLegacy: boolean;
    count: boolean;
    ttlSeconds: number;
  },
) {
  const [counted, views] = pair(await redis.eval(
    READ_OR_RECORD_VIEW_SCRIPT,
    [input.currentKey, input.legacyKey, input.migrationKey, input.dedupKey],
    [input.migrateLegacy ? '1' : '0', input.count ? '1' : '0', String(input.ttlSeconds)],
  ));
  return { counted: counted === 1, views };
}
