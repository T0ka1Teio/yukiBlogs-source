import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeTableSize } from '../lib/editorTable.ts';

test('table picker accepts a user-selected row and column count', () => {
  assert.deepEqual(normalizeTableSize(6, 8), { rows: 6, cols: 8 });
});

test('table picker keeps dimensions inside the Word-style grid limits', () => {
  assert.deepEqual(normalizeTableSize(0, 99), { rows: 1, cols: 10 });
  assert.deepEqual(normalizeTableSize(Number.NaN, 4), { rows: 1, cols: 4 });
});
