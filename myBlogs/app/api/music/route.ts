import { NextRequest, NextResponse } from 'next/server'

import type { MusicTrack } from '@/lib/music/types'
import { siteConfig } from '@/siteConfig'

export const dynamic = 'force-dynamic'

const NET_EASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
  Referer: 'https://music.163.com/',
}

type MusicConfig = { cloudMusicIds?: Array<string | number>; musicTracks?: MusicTrack[] }

function configuredTracks(request: NextRequest): MusicTrack[] {
  const ids = request.nextUrl.searchParams.get('ids')
  if (ids) {
    return ids.split(',').map((id) => id.trim()).filter(Boolean)
      .map((id) => ({ key: `wy:${id}`, platform: 'wy', id }))
  }
  const config = siteConfig as unknown as MusicConfig
  if (config.musicTracks?.length) return config.musicTracks
  return (config.cloudMusicIds || []).map((value) => {
    const id = String(value)
    return { key: `wy:${id}`, platform: 'wy', id }
  })
}

async function hydrateTrack(track: MusicTrack) {
  let hydrated = track
  let lrc = ''
  if (track.platform === 'wy') {
    const [detailResponse, lyricResponse] = await Promise.all([
      fetch(`https://music.163.com/api/song/detail/?id=${track.id}&ids=[${track.id}]`, {
        headers: NET_EASE_HEADERS,
        signal: AbortSignal.timeout(6_000),
      }).catch(() => null),
      fetch(`https://music.163.com/api/song/lyric?id=${track.id}&lv=-1&kv=-1&tv=-1`, {
        headers: NET_EASE_HEADERS,
        signal: AbortSignal.timeout(6_000),
      }).catch(() => null),
    ])
    if (detailResponse?.ok) {
      const detail = await detailResponse.json()
      const song = detail.songs?.[0]
      if (song) {
        hydrated = {
          ...track,
          name: track.name || song.name,
          artist: track.artist || song.artists?.map((artist: { name?: string }) => artist.name).filter(Boolean).join(' / '),
          album: track.album || song.album?.name,
          cover: track.cover || song.album?.picUrl,
          duration: track.duration || song.duration,
        }
      }
    }
    if (lyricResponse?.ok) {
      try { lrc = (await lyricResponse.json()).lrc?.lyric || '' } catch { /* 歌词可选 */ }
    }
  }
  return {
    id: hydrated.key,
    platform: hydrated.platform,
    name: hydrated.name || '未知歌曲',
    artist: hydrated.artist || '未知歌手',
    author: hydrated.artist || '未知歌手',
    album: hydrated.album || '',
    cover: hydrated.cover || '',
    pic: hydrated.cover || '',
    url: `/api/music/stream?key=${encodeURIComponent(hydrated.key)}`,
    lrc,
  }
}

export async function GET(request: NextRequest) {
  const tracks = configuredTracks(request)
  if (tracks.length === 0) return NextResponse.json([])
  const results = await Promise.all(tracks.map(async (track) => {
    try { return await hydrateTrack(track) }
    catch (error) { return { id: track.key, error: error instanceof Error ? error.message : String(error) } }
  }))
  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } })
}
