import { NextResponse } from 'next/server'

import { resolvePlayableMusic } from '@/lib/music/playableResolver'
import { readMusicSources, readMusicTracks } from '@/lib/music/requestValidation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AVAILABILITY_CONCURRENCY = 6

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { tracks?: unknown; sources?: unknown }
    const tracks = readMusicTracks(payload.tracks)
    const sources = readMusicSources(payload.sources)
    const checks = await mapWithConcurrency(tracks, AVAILABILITY_CONCURRENCY, async (track) => {
      try {
        const resolution = await resolvePlayableMusic(track, sources)
        return {
          key: track.key,
          playable: true as const,
          resolverSourceId: resolution.sourceId,
          resolverSourceName: resolution.sourceName,
          contentType: resolution.contentType,
        }
      } catch (error) {
        return {
          key: track.key,
          playable: false as const,
          reason: error instanceof Error ? error.message : String(error),
        }
      }
    })
    return NextResponse.json({
      success: true,
      data: checks.filter((check) => check.playable),
      checked: checks.length,
      filtered: checks.filter((check) => !check.playable).length,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
}
