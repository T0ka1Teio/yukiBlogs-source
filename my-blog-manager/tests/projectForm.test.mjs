import assert from 'node:assert/strict';
import test from 'node:test';

import { formatProjectTags, parseProjectTags } from '../lib/projectForm.ts';

test('project tag draft is formatted only when the modal opens', () => {
  assert.equal(formatProjectTags(['Next.js 16', 'React 19']), 'Next.js 16, React 19');
});

test('project tags are parsed only when the project is saved', () => {
  assert.deepEqual(
    parseProjectTags('Next.js 16,React 19,  Tailwind CSS 4  '),
    ['Next.js 16', 'React 19', 'Tailwind CSS 4'],
  );
});
