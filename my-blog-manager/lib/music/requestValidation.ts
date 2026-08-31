import type { MusicSourceConfig, MusicTrack } from './types'

const MAX_TRACKS = 40
const MAX_SOURCES = 20

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function readMusicTrack(value: unknown): MusicTrack {
  if (!isRecord(value)) throw new Error('歌曲数据无效')
  const key = typeof value.key === 'string' ? value.key.trim() : ''
  const platform = typeof value.platform === 'string' ? value.platform.trim() : ''
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  if (!key || !platform || !id || key.length > 200 || platform.length > 20 || id.length > 200) {
    throw new Error('歌曲缺少有效的 key、platform 或 id')
  }
  return value as MusicTrack
}

export function readMusicTracks(value: unknown): MusicTrack[] {
  if (!Array.isArray(value) || value.length > MAX_TRACKS) throw new Error(`歌曲列表无效或超过 ${MAX_TRACKS} 首限制`)
  return value.map(readMusicTrack)
}

export function readMusicSources(value: unknown): MusicSourceConfig[] {
  if (!Array.isArray(value) || value.length > MAX_SOURCES) throw new Error(`音源配置无效或超过 ${MAX_SOURCES} 个限制`)
  return value.map((item) => {
    if (!isRecord(item)) throw new Error('音源配置无效')
    const kind = item.kind
    const platforms = item.platforms
    if ((kind !== 'builtin' && kind !== 'lx-script')
      || typeof item.id !== 'string'
      || typeof item.name !== 'string'
      || typeof item.enabled !== 'boolean'
      || !Array.isArray(platforms)
      || !platforms.every((entry) => typeof entry === 'string')) {
      throw new Error('音源配置无效')
    }
    return item as MusicSourceConfig
  })
}
