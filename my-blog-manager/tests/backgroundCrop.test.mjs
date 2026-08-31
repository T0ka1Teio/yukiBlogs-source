import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getBackgroundLayout,
  removeBackgroundSelection,
  upsertBackgroundSelection,
} from '../lib/backgroundCrop.ts';

test('photo-wall selection preserves its source URL and stores only display metadata', () => {
  const sourceUrl = 'https://img.example.com/album/photo.jpg';
  const result = upsertBackgroundSelection([], {}, sourceUrl, {
    zoom: 1.4,
    offsetX: -0.12,
    offsetY: 0.08,
  });

  assert.deepEqual(result.images, [sourceUrl]);
  assert.deepEqual(result.crops[sourceUrl], {
    zoom: 1.4,
    offsetX: -0.12,
    offsetY: 0.08,
  });
  assert.equal(result.images.some((url) => url.startsWith('/uploads/')), false);
});

function assertCoversViewport(layout, viewportWidth, viewportHeight) {
  assert.ok(layout.left <= 0, `left edge is blank: ${layout.left}`);
  assert.ok(layout.top <= 0, `top edge is blank: ${layout.top}`);
  assert.ok(layout.left + layout.width >= viewportWidth, 'right edge is blank');
  assert.ok(layout.top + layout.height >= viewportHeight, 'bottom edge is blank');
}

test('saved display area covers the full viewport after an offset', () => {
  const layout = getBackgroundLayout(
    1000,
    700,
    2000,
    1000,
    { zoom: 1, offsetX: 0.1, offsetY: 0 },
  );

  assertCoversViewport(layout, 1000, 700);
});

test('saved display area is clamped again when the homepage aspect ratio changes', () => {
  const layout = getBackgroundLayout(
    700,
    1000,
    2000,
    1000,
    { zoom: 1.3, offsetX: 0.8, offsetY: -0.8 },
  );

  assertCoversViewport(layout, 700, 1000);
});

test('removing a background also removes its display metadata', () => {
  const sourceUrl = 'https://img.example.com/album/photo.jpg';
  const result = removeBackgroundSelection(
    [sourceUrl, 'https://img.example.com/album/keep.jpg'],
    { [sourceUrl]: { zoom: 1.2, offsetX: 0, offsetY: 0 } },
    0,
  );

  assert.deepEqual(result.images, ['https://img.example.com/album/keep.jpg']);
  assert.equal(sourceUrl in result.crops, false);
});
