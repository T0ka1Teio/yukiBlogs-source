export type MusicSourceKind = 'builtin' | 'lx-script'

export type MusicTrack = {
  key: string
  platform: string
  platformName?: string
  id: string
  songmid?: string
  name?: string
  artist?: string
  album?: string
  duration?: number
  cover?: string
  sourceData?: Record<string, unknown>
}

export type MusicSourceConfig = {
  id: string
  name: string
  kind: MusicSourceKind
  enabled: boolean
  scriptUrl?: string
  version?: string
  sha256?: string
  platforms: string[]
  qualitys?: Record<string, string[]>
}

export type LxSourceInspection = {
  id: string
  name: string
  description: string
  version: string
  author: string
  scriptUrl: string
  sha256: string
  platforms: string[]
  qualitys: Record<string, string[]>
}
