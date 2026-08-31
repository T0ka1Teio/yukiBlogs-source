import { NextRequest, NextResponse } from 'next/server'

import { resolvePlayableMusic } from '@/lib/music/playableResolver'
import type { MusicSourceConfig, MusicTrack } from '@/lib/music/types'
import { readRuntimeSiteConfig } from '@/lib/server/runtimeConfig'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type MusicConfig = {
  cloudMusicIds?: Array<string | number>
  musicTracks?: MusicTrack[]
  musicSources?: MusicSourceConfig[]
}

const DEFAULT_SOURCE: MusicSourceConfig = {
  id: 'netease-direct', name: '网易云直链', kind: 'builtin', enabled: true, platforms: ['wy'],
}

function getConfig() { return readRuntimeSiteConfig() as MusicConfig }

function findTrack(key: string): MusicTrack | undefined {
  const config = getConfig()
  const configured = config.musicTracks?.find((track) => track.key === key)
  if (configured) return configured
  if (key.startsWith('wy:')) {
    const id = key.slice(3)
    if (config.cloudMusicIds?.some((item) => String(item) === id)) return { key, platform: 'wy', id }
  }
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')?.trim()
  if (!key) return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 })
  const track = findTrack(key)
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })
  const config = getConfig()
  const sources = config.musicSources === undefined ? [DEFAULT_SOURCE] : config.musicSources
  try {
    const resolution = await resolvePlayableMusic(track, sources)
    return NextResponse.redirect(resolution.url, 307)
  } catch (error) {
    return NextResponse.json(
      { error: 'No enabled source could resolve playable audio for this track', failures: [error instanceof Error ? error.message : String(error)] },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
