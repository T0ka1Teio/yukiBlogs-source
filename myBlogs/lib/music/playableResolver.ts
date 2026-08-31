import { resolveLxMusicUrl } from './lxSourceRunner'
import { probeAudioUrl } from './mediaProbe'
import type { MusicSourceConfig, MusicTrack } from './types'

export type PlayableResolution = {
  url: string
  sourceId: string
  sourceName: string
  contentType: string
  failures: string[]
}

type SourceAttempt = {
  playable: boolean
  url?: string
  contentType?: string
  reason?: string
}

const ATTEMPT_CACHE_TTL_MS = 30_000
const MAX_CACHED_ATTEMPTS = 500
const attemptCache = new Map<string, { expiresAt: number; promise: Promise<SourceAttempt> }>()

function getBuiltinUrl(track: MusicTrack) {
  return `https://music.163.com/song/media/outer/url?id=${encodeURIComponent(track.id)}.mp3`
}

async function attemptSource(source: MusicSourceConfig, track: MusicTrack): Promise<SourceAttempt> {
  const sourceFingerprint = source.kind === 'lx-script' ? `${source.scriptUrl || ''}|${source.sha256 || ''}` : source.id
  const trackFingerprint = `${track.key}|${track.songmid || ''}|${JSON.stringify(track.sourceData || {})}`
  const cacheKey = `${sourceFingerprint}|${trackFingerprint}`
  const cached = attemptCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    attemptCache.delete(cacheKey)
    attemptCache.set(cacheKey, cached)
    return cached.promise
  }
  if (cached) attemptCache.delete(cacheKey)
  while (attemptCache.size >= MAX_CACHED_ATTEMPTS) {
    const oldestKey = attemptCache.keys().next().value
    if (!oldestKey) break
    attemptCache.delete(oldestKey)
  }

  const promise = (async () => {
    try {
      if (source.kind === 'builtin') {
        const url = getBuiltinUrl(track)
        const probe = await probeAudioUrl(url)
        return probe.playable
          ? { playable: true, url, contentType: probe.contentType }
          : { playable: false, reason: probe.reason || '媒体探测失败' }
      }
      const declaredQualities = source.qualitys?.[track.platform] || []
      const standardQualities = ['320k', '128k'].filter((quality) => declaredQualities.includes(quality))
      const qualities = standardQualities.length > 0 ? standardQualities : [declaredQualities[0] || '320k']
      const failures: string[] = []
      for (const quality of qualities.length > 0 ? qualities : ['320k']) {
        try {
          const url = await resolveLxMusicUrl(source, track, quality)
          const probe = await probeAudioUrl(url)
          if (probe.playable) return { playable: true, url, contentType: probe.contentType }
          failures.push(`${quality}: ${probe.reason || '媒体探测失败'}`)
        } catch (error) {
          failures.push(`${quality}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      return { playable: false, reason: failures.join('；') || '所有音质均不可播放' }
    } catch (error) {
      return { playable: false, reason: error instanceof Error ? error.message : String(error) }
    }
  })()
  const entry = { expiresAt: Date.now() + ATTEMPT_CACHE_TTL_MS, promise }
  attemptCache.set(cacheKey, entry)
  return promise
}

export async function resolvePlayableMusic(track: MusicTrack, sources: MusicSourceConfig[]): Promise<PlayableResolution> {
  const failures: string[] = []
  for (const source of sources) {
    if (!source.enabled || !source.platforms.includes(track.platform)) continue
    if (source.kind === 'builtin' && track.platform !== 'wy') continue
    const attempt = await attemptSource(source, track)
    if (attempt.playable && attempt.url) {
      return {
        url: attempt.url,
        sourceId: source.id,
        sourceName: source.name,
        contentType: attempt.contentType || '',
        failures,
      }
    }
    failures.push(`${source.name}: ${attempt.reason || '不可播放'}`)
  }
  throw new Error(failures.length > 0 ? '所有已启用音源均无法返回可播放音频' : '没有支持这首歌的已启用音源')
}
