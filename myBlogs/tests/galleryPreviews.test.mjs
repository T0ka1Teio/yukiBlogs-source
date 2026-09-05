import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import sharp from 'sharp';
import { generatePreviews } from '../scripts/generate-gallery-previews.mjs';

test('generates tiny previews, preserves orientation, caches remote images and tolerates failures', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gallery-previews-'));
  const original = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#3456ab' } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests++;
    response.writeHead(200, { 'content-type': 'image/jpeg' });
    response.end(original);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/photo.jpg`;
  const saveAlbums = async photos => fs.writeFile(path.join(root, 'data/albums.ts'),
    `export const albums: Album[] = ${JSON.stringify([{ cover: url, photos: photos.map(url => ({ url })) }])};`);
  try {
    await fs.mkdir(path.join(root, 'data'));
    await fs.mkdir(path.join(root, 'public'));
    await fs.writeFile(path.join(root, 'public/local.jpg'), original);
    await saveAlbums([url, '/local.jpg', '/missing.jpg', '/../../outside.jpg', 'data:text/plain,invalid']);
    const previews = await generatePreviews(root);
    assert.equal(Object.keys(previews).length, 2);
    assert.equal(requests, 1, 'cover and photo share one download');
    assert.equal(previews[url].width, 400);
    assert.equal(previews[url].height, 600);
    const tiny = Buffer.from(previews[url].dataUrl.split(',')[1], 'base64');
    assert.ok(tiny.length < 1024);
    const metadata = await sharp(tiny).metadata();
    assert.equal(metadata.height, 16);
    assert.ok(metadata.width < 16);
    await saveAlbums([url]);
    const cached = await generatePreviews(root);
    assert.equal(requests, 1, 'second build reuses preview cache');
    assert.equal(cached[url].dataUrl, previews[url].dataUrl);
    assert.equal(cached['/local.jpg'], undefined, 'removed photos are pruned');
    await fs.writeFile(path.join(root, '.cache/gallery-previews.json'), '{broken');
    assert.ok((await generatePreviews(root))[url], 'a corrupt cache can be rebuilt');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
});
