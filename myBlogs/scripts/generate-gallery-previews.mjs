import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const MAX_BYTES = 30 * 1024 * 1024;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

async function readImage(source, root) {
  if (source.startsWith('/') && !source.startsWith('//')) {
    const publicRoot = await fs.realpath(path.join(root, 'public'));
    const file = await fs.realpath(path.resolve(publicRoot, `.${decodeURIComponent(source.split(/[?#]/)[0])}`));
    const relative = path.relative(publicRoot, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid local image path');
    if ((await fs.stat(file)).size > MAX_BYTES) throw new Error('Image exceeds 30 MB');
    return fs.readFile(file);
  }
  const url = new URL(source);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Unsupported image URL');
  }
  // Only build-time, locally configured album URLs are fetched. No public proxy endpoint.
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error('Image exceeds 30 MB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function generatePreviews(root) {
  const source = await fs.readFile(path.join(root, 'data/albums.ts'), 'utf8');
  const match = /export\s+const\s+albums[^=]*=\s*([\s\S]*?);?\s*$/.exec(source);
  if (!match) throw new Error('Cannot read generated albums data');
  const albums = JSON.parse(match[1]);
  const urls = [...new Set(albums.flatMap(album => [album.cover, ...album.photos.map(photo => photo.url)]).filter(Boolean))];
  const destination = path.join(root, '.cache/gallery-previews.json');
  let previous = {};
  try { previous = JSON.parse(await fs.readFile(destination, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  const previews = {};
  let cursor = 0;
  let failed = 0;
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      const cached = previous[url];
      // Local files may have changed without changing their URL; regenerate them.
      if (!url.startsWith('/') && cached?.dataUrl && Date.now() - cached.generatedAt < MAX_AGE) {
        previews[url] = cached;
        continue;
      }
      try {
        const input = await readImage(url, root).catch(() => readImage(url, root));
        const pipeline = sharp(input, { limitInputPixels: 100_000_000 });
        const metadata = await pipeline.metadata();
        const rotated = metadata.orientation >= 5 && metadata.orientation <= 8;
        const data = await pipeline.rotate().resize(16, 16, { fit: 'inside' }).blur(0.8).webp({ quality: 35 }).toBuffer();
        previews[url] = {
          width: rotated ? metadata.height : metadata.width,
          height: rotated ? metadata.width : metadata.height,
          dataUrl: `data:image/webp;base64,${data.toString('base64')}`,
          generatedAt: Date.now(),
        };
      } catch {
        failed++;
        if (cached?.dataUrl) previews[url] = cached;
        // A failed preview must never prevent loading the original or deploying the blog.
      }
    }
  }));
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(previews));
    await fs.rename(temporary, destination);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  console.log(`Gallery previews: ${Object.keys(previews).length}/${urls.length} ready; ${failed} unavailable (original images remain enabled).`);
  return previews;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generatePreviews(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
}
