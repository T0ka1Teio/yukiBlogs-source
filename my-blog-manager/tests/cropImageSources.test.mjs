import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCropImageCandidates } from '../lib/cropImageSources.ts';

test('remote URL crop tries browser direct access before the local proxy', () => {
  const imageUrl = 'https://img.example.com/background.jpg';
  const candidates = buildCropImageCandidates(imageUrl, 'http://127.0.0.1:64003', true);

  assert.equal(candidates[0].source, imageUrl);
  assert.match(candidates[1].source, /\/api\/picbed\/proxy-image/);
});

test('metadata-only crop has a final browser-native fallback without CORS mode', () => {
  const imageUrl = 'https://img.example.com/background.jpg';
  const candidates = buildCropImageCandidates(imageUrl, 'http://127.0.0.1:64003', true);

  assert.deepEqual(candidates.at(-1), {
    source: imageUrl,
    crossOrigin: null,
  });
});
