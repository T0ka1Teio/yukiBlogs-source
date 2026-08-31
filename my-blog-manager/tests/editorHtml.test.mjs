import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeEditorHtml } from '../lib/editorHtml.ts';

test('editor HTML removes only the structural fenced-code newline', () => {
  const html = '<pre><code class="language-text">第一行\n\n第三行\n</code></pre>';
  assert.equal(
    normalizeEditorHtml(html),
    '<pre><code class="language-text">第一行\n\n第三行</code></pre>',
  );
});

test('editor HTML normalizes every code block without touching paragraphs', () => {
  const html = '<p>前文</p><pre><code>a\n</code></pre><p>中间</p><pre><code>b\r\n</code></pre>';
  assert.equal(
    normalizeEditorHtml(html),
    '<p>前文</p><pre><code>a</code></pre><p>中间</p><pre><code>b</code></pre>',
  );
});
