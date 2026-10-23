import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const output = resolve('dist');
const template = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const files = (await readdir(output, { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile())
  .map(entry => relative(output, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
  .filter(file => file !== 'sw.js')
  .sort();

if (!files.includes('index.html') || !files.some(file => /^assets\/.*\.js$/.test(file)) ||
    !files.some(file => /^assets\/.*\.css$/.test(file))) {
  throw new Error('Build the complete Vite app before generating its service worker.');
}

// Include content, media, and worker behavior, not just the package version.
// A change to any published file gets an independent release cache.
const hash = createHash('sha256').update(template);
for (const file of files) {
  hash.update(file).update('\0').update(await readFile(join(output, file))).update('\0');
}
// Cloudflare consumes deployment directives; they are not downloadable assets.
// Keep them in the release hash, but never require them for offline installation.
const urls = files.filter(file => !['_headers', '_redirects'].includes(file))
  .map(file => file === 'index.html' ? '/' : `/${file}`);
const optionalMedia = url => /^\/(audio\/|assets\/illustrations\/)/.test(url) || /^\/delivery\/.*\/(audio|assets|icons)\//.test(url);
const manifest = {
  revision: hash.digest('hex').slice(0, 20),
  core: urls.filter(url => !optionalMedia(url)),
  optional: urls.filter(optionalMedia)
};
await writeFile(join(output, 'sw.js'), template.replace('__NOVOAPPS_PRECACHE__', JSON.stringify(manifest)));
console.log(`Offline release ${manifest.revision}: ${manifest.core.length} required files, ${manifest.optional.length} optional media files.`);
