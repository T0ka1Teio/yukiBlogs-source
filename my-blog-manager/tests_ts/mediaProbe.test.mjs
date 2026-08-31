import assert from 'node:assert/strict'
import test from 'node:test'

import { probeAudioUrl } from '../lib/music/mediaProbe.ts'

test('rejects a paid-track JSON response even when HTTP status is 200', async () => {
  const result = await probeAudioUrl('https://example.com/paid-track', {
    fetchImpl: async () => new Response('{"code":403,"message":"VIP only"}', {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
  })

  assert.equal(result.playable, false)
})

test('accepts an MP3 response with a valid ID3 header', async () => {
  const result = await probeAudioUrl('https://example.com/playable-track', {
    fetchImpl: async () => new Response(Uint8Array.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]), {
      status: 206,
      headers: { 'Content-Type': 'audio/mpeg' },
    }),
  })

  assert.equal(result.playable, true)
})

test('rejects an HTML error page mislabeled as an audio request result', async () => {
  const result = await probeAudioUrl('https://example.com/not-found', {
    fetchImpl: async () => new Response('<!doctype html><title>Not found</title>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }),
  })

  assert.equal(result.playable, false)
})

test('does not follow a redirect into a private network', async () => {
  let requestCount = 0
  const result = await probeAudioUrl('https://example.com/redirect', {
    fetchImpl: async () => {
      requestCount += 1
      return new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/audio.mp3' } })
    },
  })

  assert.equal(result.playable, false)
  assert.equal(requestCount, 1)
})
