import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const catalogPath = path.join(root, 'lib/catalog.ts');
const source = await readFile(catalogPath, 'utf8');
const productBlock = source.match(/const productImages:[^=]+?=\s*\{([\s\S]*?)\n\};/);
if (!productBlock) throw new Error('Could not read productImages in lib/catalog.ts');

const products = [...productBlock[1].matchAll(/'([^']+)':\s*'([^']+)'/g)].map((match) => ({ name: match[1], url: match[2] })).filter((item) => item.url.startsWith('https://'));
const storage = [...source.matchAll(/\{ id: 'storage-([^']+)', name: '([^']+)'[^\n]+image: '([^']+)'/g)].map((match) => ({ name: match[2], url: match[3], id: `storage-${match[1]}` })).filter((item) => item.url.startsWith('https://'));
const productsByName = new Map(products.map((item) => [item.name, item]));
for (const item of storage) productsByName.set(item.name, item);

const slug = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const outputDir = path.join(root, 'public/products');
await mkdir(outputDir, { recursive: true });

const results = [];
const entries = [...productsByName.values()];
let cursor = 0;
async function worker() {
  while (cursor < entries.length) {
    const item = entries[cursor++];
    const filename = `${slug(item.name)}.webp`;
    try {
      const response = await fetch(item.url, {
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36', accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' },
        signal: AbortSignal.timeout(12000),
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.startsWith('image/')) throw new Error(`HTTP ${response.status} ${contentType}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 100) throw new Error(`Image too small: ${bytes.length} bytes`);
      await sharp(bytes).rotate().resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toFile(path.join(outputDir, filename));
      results.push({ ...item, file: `/products/${filename}`, status: 'ok', bytes: bytes.length });
    } catch (error) {
      results.push({ ...item, status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

for (const item of results.sort((a, b) => a.name.localeCompare(b.name))) console.log(`${item.status}\t${item.name}\t${item.file || item.error}`);
const manifestPath = path.join(root, 'lib/product-image-sources.json');
let priorSources = [];
try { priorSources = JSON.parse(await readFile(manifestPath, 'utf8')); } catch {}
const sourceByName = new Map(priorSources.map((item) => [item.name, item]));
for (const { name, url, file, status } of results) if (status === 'ok') sourceByName.set(name, { name, url, file });
await writeFile(manifestPath, `${JSON.stringify([...sourceByName.values()], null, 2)}\n`);

let updated = source;
for (const item of results.filter((candidate) => candidate.status === 'ok')) {
  const escapedName = item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedUrl = item.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const entry = new RegExp(`('${escapedName}'\\s*:\\s*)'${escapedUrl}'`);
  if (item.id) {
    const storageEntry = new RegExp(`(id: '${item.id}'[^\\n]+image: )'${escapedUrl}'`);
    updated = updated.replace(storageEntry, `$1'${item.file}'`);
  } else {
    updated = updated.replace(entry, `$1'${item.file}'`);
  }
}
await writeFile(catalogPath, updated);
console.log(`\nSaved ${results.filter((item) => item.status === 'ok').length}/${results.length} product photos locally.`);
