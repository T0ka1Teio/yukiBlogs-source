import { createCipheriv, createHash, publicEncrypt, randomBytes } from 'node:crypto'
import { isIP } from 'node:net'
import vm from 'node:vm'

import type { LxSourceInspection, MusicSourceConfig, MusicTrack } from './types'

const SOURCE_DOWNLOAD_TIMEOUT_MS = 8_000
const SOURCE_INIT_TIMEOUT_MS = 10_000
const SOURCE_RESOLVE_TIMEOUT_MS = 10_000
const MAX_SCRIPT_BYTES = 1_500_000
const SOURCE_CACHE_TTL_MS = 5 * 60_000
const MAX_CACHED_SOURCES = 12

type LxSourceInfo = {
  name?: string
  type?: string
  actions?: string[]
  qualitys?: string[]
}

type LxInitPayload = {
  status?: boolean
  sources?: Record<string, LxSourceInfo>
}

type LxRequestHandler = (payload: {
  source: string
  action: string
  info: { type: string; musicInfo: Record<string, unknown> }
}) => Promise<string>

type LoadedSource = {
  scriptUrl: string
  sha256: string
  metadata: Record<string, string>
  init: LxInitPayload
  requestHandler: LxRequestHandler
}

const loadedSourceCache = new Map<string, { expiresAt: number; promise: Promise<LoadedSource> }>()

function privateIpv4(hostname: string) {
  const parts = hostname.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
}

function assertSafeRemoteUrl(value: string, requireHttps = false) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('音源 URL 格式无效')
  }
  if (requireHttps ? url.protocol !== 'https:' : !['http:', 'https:'].includes(url.protocol)) {
    throw new Error(requireHttps ? '音源脚本必须使用 HTTPS' : '仅允许 HTTP/HTTPS 请求')
  }
  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('音源请求不能访问本机或内网地址')
  }
  const ipVersion = isIP(hostname)
  if ((ipVersion === 4 && privateIpv4(hostname)) || (ipVersion === 6 && (hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd')))) {
    throw new Error('音源请求不能访问私有 IP')
  }
  return url
}

function timeout<T>(promise: Promise<T>, duration: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), duration)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

function parseMetadata(script: string) {
  const metadata: Record<string, string> = {}
  for (const key of ['name', 'description', 'version', 'author', 'homepage']) {
    const match = script.match(new RegExp(`@${key}\\s+([^\\r\\n*]+)`))
    metadata[key] = match?.[1]?.trim() || ''
  }
  return metadata
}

async function readResponseBody(response: Response, responseType?: string) {
  if (responseType === 'arraybuffer' || responseType === 'buffer') {
    return Buffer.from(await response.arrayBuffer())
  }
  const text = await response.text()
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('json') || /^[\[{]/.test(text.trim())) {
    try { return JSON.parse(text) } catch { /* 保留原始文本 */ }
  }
  return text
}

function buildRequest() {
  return (value: string, options: Record<string, unknown> = {}, callback: (...args: unknown[]) => void) => {
    const controller = new AbortController()
    const requestTimeout = Number(options.timeout) || SOURCE_RESOLVE_TIMEOUT_MS
    const timer = setTimeout(() => controller.abort(), requestTimeout)

    void (async () => {
      try {
        const url = assertSafeRemoteUrl(value)
        const method = String(options.method || 'GET').toUpperCase()
        const headers = new Headers(options.headers as HeadersInit | undefined)
        let body: BodyInit | undefined
        if (options.form && typeof options.form === 'object') {
          body = new URLSearchParams(options.form as Record<string, string>)
          if (!headers.has('content-type')) headers.set('content-type', 'application/x-www-form-urlencoded')
        } else if (options.body !== undefined && method !== 'GET' && method !== 'HEAD') {
          body = typeof options.body === 'string' || options.body instanceof Uint8Array
            ? options.body as BodyInit
            : JSON.stringify(options.body)
        }
        const response = await fetch(url, { method, headers, body, signal: controller.signal, cache: 'no-store' })
        const responseBody = await readResponseBody(response, String(options.responseType || ''))
        const headerObject = Object.fromEntries(response.headers.entries())
        const result = { statusCode: response.status, headers: headerObject, body: responseBody }
        callback(null, result, responseBody)
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)), null, null)
      } finally {
        clearTimeout(timer)
      }
    })()
    return () => controller.abort()
  }
}

async function downloadScript(scriptUrl: string) {
  const url = assertSafeRemoteUrl(scriptUrl, true)
  const response = await fetch(url, { signal: AbortSignal.timeout(SOURCE_DOWNLOAD_TIMEOUT_MS), cache: 'no-store' })
  if (!response.ok) throw new Error(`音源脚本下载失败：HTTP ${response.status}`)
  const script = await response.text()
  if (!script.trim()) throw new Error('音源脚本内容为空')
  if (Buffer.byteLength(script, 'utf8') > MAX_SCRIPT_BYTES) throw new Error('音源脚本超过 1.5MB 限制')
  return script
}

async function loadSource(scriptUrl: string, expectedSha256?: string): Promise<LoadedSource> {
  const script = await downloadScript(scriptUrl)
  const metadata = parseMetadata(script)
  const sha256 = createHash('sha256').update(script).digest('hex')
  if (expectedSha256 && sha256 !== expectedSha256) {
    throw new Error('远程音源脚本已变化，请在 Manager 中重新测试后保存')
  }
  const handlers = new Map<string, (...args: never[]) => unknown>()
  let resolveInit!: (payload: LxInitPayload) => void
  let rejectInit!: (error: Error) => void
  const initPromise = new Promise<LxInitPayload>((resolve, reject) => {
    resolveInit = resolve
    rejectInit = reject
  })
  const eventNames = { request: 'request', inited: 'inited', updateAlert: 'updateAlert' }
  const lx = {
    EVENT_NAMES: eventNames,
    env: 'desktop',
    version: 2,
    currentScriptInfo: { ...metadata, rawScript: script },
    request: buildRequest(),
    on: (eventName: string, handler: (...args: never[]) => unknown) => handlers.set(eventName, handler),
    send: (eventName: string, payload: LxInitPayload) => {
      if (eventName === eventNames.inited) resolveInit(payload)
    },
    utils: {
      buffer: {
        from: Buffer.from.bind(Buffer),
        bufToString: (buffer: Uint8Array, encoding: BufferEncoding = 'utf8') => Buffer.from(buffer).toString(encoding),
      },
      crypto: {
        md5: (value: string) => createHash('md5').update(value).digest('hex'),
        randomBytes,
        aesEncrypt: (buffer: Uint8Array, mode: string, key: Uint8Array, iv: Uint8Array) => {
          const cipher = createCipheriv(`aes-${Buffer.from(key).length * 8}-${mode.toLowerCase()}`, Buffer.from(key), Buffer.from(iv))
          return Buffer.concat([cipher.update(Buffer.from(buffer)), cipher.final()])
        },
        rsaEncrypt: (buffer: Uint8Array, key: string) => publicEncrypt(key, Buffer.from(buffer)),
      },
    },
  }

  const sandbox: Record<string, unknown> = {
    lx,
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    TextEncoder,
    TextDecoder,
    URL,
  }
  sandbox.window = sandbox
  const context = vm.createContext(sandbox, {
    name: `lx-source:${metadata.name || 'unknown'}`,
    codeGeneration: { strings: true, wasm: false },
  })
  try {
    new vm.Script(script, { filename: 'lx-source.js' }).runInContext(context, { timeout: 1_500 })
  } catch (error) {
    rejectInit(error instanceof Error ? error : new Error(String(error)))
  }
  const init = await timeout(initPromise, SOURCE_INIT_TIMEOUT_MS, '音源初始化超时')
  if (init.status === false) throw new Error('音源脚本报告初始化失败')
  const requestHandler = handlers.get(eventNames.request) as LxRequestHandler | undefined
  if (!requestHandler) throw new Error('音源没有注册播放地址解析函数')
  return { scriptUrl, sha256, metadata, init, requestHandler }
}

function loadConfiguredSource(source: MusicSourceConfig) {
  if (!source.scriptUrl) throw new Error('音源缺少脚本 URL')
  const cacheKey = `${source.scriptUrl}|${source.sha256 || ''}`
  const cached = loadedSourceCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    loadedSourceCache.delete(cacheKey)
    loadedSourceCache.set(cacheKey, cached)
    return cached.promise
  }
  if (cached) loadedSourceCache.delete(cacheKey)
  while (loadedSourceCache.size >= MAX_CACHED_SOURCES) {
    const oldestKey = loadedSourceCache.keys().next().value
    if (!oldestKey) break
    loadedSourceCache.delete(oldestKey)
  }
  const promise = loadSource(source.scriptUrl, source.sha256)
  const entry = { expiresAt: Date.now() + SOURCE_CACHE_TTL_MS, promise }
  loadedSourceCache.set(cacheKey, entry)
  void promise.catch(() => {
    if (loadedSourceCache.get(cacheKey) === entry) loadedSourceCache.delete(cacheKey)
  })
  return promise
}

export async function inspectLxSource(scriptUrl: string): Promise<LxSourceInspection> {
  const loaded = await loadSource(scriptUrl)
  const sources = loaded.init.sources || {}
  const platforms = Object.keys(sources)
  if (platforms.length === 0) throw new Error('音源没有声明支持的平台')
  const qualitys = Object.fromEntries(platforms.map((platform) => [platform, sources[platform]?.qualitys || []]))
  const baseName = loaded.metadata.name || '洛雪音源'
  return {
    id: `${baseName.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '') || 'lx-source'}-${loaded.sha256.slice(0, 8)}`,
    name: baseName,
    description: loaded.metadata.description || '',
    version: loaded.metadata.version || '未知版本',
    author: loaded.metadata.author || '',
    scriptUrl,
    sha256: loaded.sha256,
    platforms,
    qualitys,
  }
}

export async function resolveLxMusicUrl(source: MusicSourceConfig, track: MusicTrack, preferredQuality = '320k') {
  const loaded = await loadConfiguredSource(source)
  const sourceInfo = loaded.init.sources?.[track.platform]
  if (!sourceInfo) throw new Error(`音源不支持平台 ${track.platform}`)
  const qualities = sourceInfo.qualitys || []
  const quality = qualities.includes(preferredQuality) ? preferredQuality : (qualities[0] || preferredQuality)
  const musicInfo = {
    ...track.sourceData,
    ...track,
    source: track.platform,
    id: track.id,
    songmid: track.songmid || track.id,
    singer: track.artist || '',
    albumName: track.album || '',
    interval: Math.floor((track.duration || 0) / 1000),
    img: track.cover || '',
  }
  const result = await timeout(
    Promise.resolve(loaded.requestHandler({
      source: track.platform,
      action: 'musicUrl',
      info: { type: quality, musicInfo },
    })),
    SOURCE_RESOLVE_TIMEOUT_MS,
    '音源解析播放地址超时',
  )
  const url = assertSafeRemoteUrl(String(result))
  return url.toString()
}
