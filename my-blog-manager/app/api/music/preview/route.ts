import { NextResponse } from 'next/server'

import { resolvePlayableMusic } from '@/lib/music/playableResolver'
import { readMusicSources, readMusicTrack } from '@/lib/music/requestValidation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { track?: unknown; sources?: unknown }
    const track = readMusicTrack(payload.track)
    const sources = readMusicSources(payload.sources)
    try {
      const resolution = await resolvePlayableMusic(track, sources)
      return NextResponse.json({ success: true, data: resolution }, {
        headers: { 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      return NextResponse.json({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
}
