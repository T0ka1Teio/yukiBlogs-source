import { isIP } from 'node:net'

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type MediaProbeResult = {
  playable: boolean
  contentType: string
  reason?: string
}

const PROBE_BYTES = 4096
const PROBE_TIMEOUT_MS = 8_000
const MAX_REDIRECTS = 5

function privateIpv4(hostname: string) {
  const parts = hostname.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
}

function assertSafeMediaUrl(value: string | URL) {
  const url = value instanceof URL ? value : new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('媒体地址仅允许 HTTP/HTTPS')
  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('媒体地址不能访问本机或内网')
  }
  const ipVersion = isIP(hostname)
  if ((ipVersion === 4 && privateIpv4(hostname)) || (ipVersion === 6 && (hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd')))) {
    throw new Error('媒体地址不能访问私有 IP')
  }
  return url
}

async function fetchWithSafeRedirects(url: string, fetchImpl: FetchLike) {
  let currentUrl = assertSafeMediaUrl(url)
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetchImpl(currentUrl, {
      headers: {
        Accept: 'audio/*,application/octet-stream;q=0.9,*/*;q=0.5',
        Range: `bytes=0-${PROBE_BYTES - 1}`,
      },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (response.status < 300 || response.status >= 400) return response
    const location = response.headers.get('location')
    if (!location) return response
    if (response.body) await response.body.cancel()
    currentUrl = assertSafeMediaUrl(new URL(location, currentUrl))
  }
  throw new Error('媒体地址重定向次数过多')
}

async function readPrefix(response: Response) {
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < PROBE_BYTES) {
      const { done, value } = await reader.read()
      if (done || !value) break
      const remaining = PROBE_BYTES - total
      const chunk = value.length > remaining ? value.subarray(0, remaining) : value
      chunks.push(chunk)
      total += chunk.length
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const prefix = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    prefix.set(chunk, offset)
    offset += chunk.length
  }
  return prefix
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value)
}

function hasAudioSignature(bytes: Uint8Array) {
  if (bytes.length < 2) return false
  if (startsWith(bytes, [0x49, 0x44, 0x33])) return true
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true
  if (startsWith(bytes, [0x66, 0x4c, 0x61, 0x43])) return true
  if (startsWith(bytes, [0x4f, 0x67, 0x67, 0x53])) return true
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return true
  if (bytes.length >= 12
    && startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
    && startsWith(bytes.subarray(8), [0x57, 0x41, 0x56, 0x45])) return true
  return bytes.length >= 8 && startsWith(bytes.subarray(4), [0x66, 0x74, 0x79, 0x70])
}

function looksLikeErrorDocument(bytes: Uint8Array) {
  const prefix = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 256))).trimStart().toLowerCase()
  return prefix.startsWith('{')
    || prefix.startsWith('[')
    || prefix.startsWith('<!doctype')
    || prefix.startsWith('<html')
    || prefix.startsWith('<?xml')
}

export async function probeAudioUrl(
  url: string,
  options: { fetchImpl?: FetchLike } = {},
): Promise<MediaProbeResult> {
  try {
    const response = await fetchWithSafeRedirects(url, options.fetchImpl || fetch)
    const contentType = (response.headers.get('content-type') || '').toLowerCase().split(';')[0].trim()
    if (!response.ok) return { playable: false, contentType, reason: `媒体响应 HTTP ${response.status}` }
    const bytes = await readPrefix(response)
    if (bytes.length === 0) return { playable: false, contentType, reason: '媒体响应为空' }
    if (hasAudioSignature(bytes)) return { playable: true, contentType }
    if (looksLikeErrorDocument(bytes)
      || contentType.includes('json')
      || contentType.startsWith('text/')
      || contentType.includes('html')
      || contentType.includes('xml')) {
      return { playable: false, contentType, reason: `音源返回的不是音频（${contentType || '文本响应'}）` }
    }
    if (contentType.startsWith('audio/')
      || contentType === 'application/octet-stream'
      || contentType === 'application/ogg'
      || contentType === 'video/mp4') {
      return { playable: true, contentType }
    }
    return { playable: false, contentType, reason: `无法识别媒体格式（${contentType || '无 Content-Type'}）` }
  } catch (error) {
    return {
      playable: false,
      contentType: '',
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}
