import { NextResponse } from 'next/server'

import { inspectLxSource, resolveLxMusicUrl } from '@/lib/music/lxSourceRunner'
import type { MusicSourceConfig, MusicTrack } from '@/lib/music/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { url?: string; testTrack?: MusicTrack }
    const url = payload.url?.trim()
    if (!url) return NextResponse.json({ success: false, message: '请输入音源 URL' }, { status: 400 })
    const inspection = await inspectLxSource(url)
    let testResolved = false
    if (payload.testTrack && inspection.platforms.includes(payload.testTrack.platform)) {
      const source: MusicSourceConfig = {
        id: inspection.id,
        name: inspection.name,
        kind: 'lx-script',
        enabled: true,
        scriptUrl: inspection.scriptUrl,
        version: inspection.version,
        sha256: inspection.sha256,
        platforms: inspection.platforms,
        qualitys: inspection.qualitys,
      }
      await resolveLxMusicUrl(source, payload.testTrack)
      testResolved = true
    }
    return NextResponse.json({ success: true, data: inspection, testResolved })
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    )
  }
}
