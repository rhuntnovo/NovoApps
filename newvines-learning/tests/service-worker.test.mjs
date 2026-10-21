import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const origin = 'https://learning.test';
const manifest = {
  revision: 'test-release',
  core: ['/', '/assets/app-hash.js', '/assets/app-hash.css', '/courses/course.json'],
  optional: ['/audio/lesson.opus', '/assets/illustrations/lesson.webp']
};
const cacheName = `novo-apps-shell-${manifest.revision}`;
const source = (await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'))
  .replace('__NOVOAPPS_PRECACHE__', JSON.stringify(manifest));

function harness({ online = true, network = async () => new Response('downloaded') } = {}) {
  const handlers = new Map();
  const stores = new Map();
  const requests = [];
  const timeouts = [];
  const background = [];
  let skipped = false;
  let claimed = false;
  const key = input => new URL(typeof input === 'string' ? input : input.url, origin).href;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(request, options = {}) {
          const entry = store.get(key(request));
          if (!entry) return;
          const headers = new Headers(typeof request === 'string' ? {} : request.headers);
          const vary = entry.response.headers.get('Vary');
          if (!options.ignoreVary && vary?.split(',').some(name =>
            headers.get(name.trim()) !== entry.headers.get(name.trim()))) return;
          return entry.response.clone();
        },
        async put(request, response) {
          // Cache.put consumes the body before resolving, as the browser does.
          const saved = new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers });
          store.set(key(request), { response: saved, headers: new Headers(typeof request === 'string' ? {} : request.headers) });
        }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); }
  };
  runInNewContext(source, {
    self: {
      location: { origin }, navigator: { onLine: online },
      addEventListener: (name, handler) => handlers.set(name, handler),
      skipWaiting: async () => { skipped = true; },
      clients: { claim: async () => { claimed = true; } }
    },
    caches, Response, Headers, URL, AbortController,
    fetch: (request, options) => { requests.push({ request, options }); return network(request, options); },
    // Exercise cancellation without making regression tests wait real seconds.
    setTimeout: (callback, ms) => { timeouts.push(ms); return setTimeout(callback, Math.min(ms, 20)); },
    clearTimeout
  });
  return {
    caches, requests, timeouts,
    settled: () => Promise.all(background),
    get skipped() { return skipped; }, get claimed() { return claimed; },
    async seed(url, body, name = cacheName, headers = {}) {
      await (await caches.open(name)).put(url, new Response(body, { headers }));
    },
    lifecycle(name) {
      let result;
      handlers.get(name)({ waitUntil: promise => { result = promise; } });
      return result;
    },
    message(data) {
      let result;
      handlers.get('message')({ data, waitUntil: promise => { result = promise; } });
      return result;
    },
    request(path, { navigation = false, method = 'GET', headers = {} } = {}) {
      let response;
      handlers.get('fetch')({
        request: { url: new URL(path, origin).href, method, mode: navigation ? 'navigate' : 'cors', headers: new Headers(headers) },
        waitUntil: promise => background.push(promise),
        respondWith: promise => { response = promise; }
      });
      return response;
    }
  };
}

const hangsUntilAborted = (_request, { signal }) => new Promise((_resolve, reject) => {
  signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
});

test('saved navigation opens immediately even when the network never answers', { timeout: 500 }, async () => {
  const worker = harness({ network: () => new Promise(() => {}) });
  await worker.seed('/', '<html>saved app</html>');
  const response = await worker.request('/?mode=guided', { navigation: true });
  assert.equal(await response.text(), '<html>saved app</html>');
  assert.equal(worker.requests.length, 0);
});

test('offline startup serves the complete shell and course without any network attempts', async () => {
  const worker = harness({ online: false, network: () => { throw new Error('Must stay offline'); } });
  for (const url of manifest.core) await worker.seed(url, `saved ${url}`);
  for (const url of manifest.core) {
    const response = await worker.request(url, { navigation: url === '/' });
    assert.equal(await response.text(), `saved ${url}`);
  }
  assert.equal(worker.requests.length, 0);
});

test('cached code and content stay in the same release while online', async () => {
  const worker = harness({ network: async () => new Response('different release') });
  await worker.seed('/courses/course.json', 'saved course');
  assert.equal(await (await worker.request('/courses/course.json')).text(), 'saved course');
  assert.equal(worker.requests.length, 0);
});

test('module/CORS requests find precached public assets despite CDN Vary: Origin', async () => {
  const worker = harness({ online: false });
  for (const url of ['/assets/app-hash.js', '/assets/app-hash.css']) {
    await worker.seed(url, 'saved public asset', cacheName, { Vary: 'Origin' });
    const response = await worker.request(url, { headers: { Origin: origin } });
    assert.equal(await response.text(), 'saved public asset');
  }
  assert.equal(worker.requests.length, 0);
});

test('installation saves all required files and tolerates missing optional media', async () => {
  const worker = harness({ network: async url => new Response(url, { status: url.endsWith('.webp') ? 404 : 200 }) });
  await worker.lifecycle('install');
  const cache = await worker.caches.open(cacheName);
  for (const url of manifest.core) assert.ok(await cache.match(url), `Missing ${url}`);
  assert.ok(await cache.match('/audio/lesson.opus'));
  assert.equal(await cache.match('/assets/illustrations/lesson.webp'), undefined);
  assert.equal(worker.skipped, false);
  assert.ok(worker.requests.every(({ options }) => options.cache === 'reload'));
});

test('a failed required download preserves the previous working release', async () => {
  const worker = harness({ network: async () => new Response('missing', { status: 404 }) });
  await worker.seed('/', 'previous app', 'novo-apps-shell-previous');
  await assert.rejects(worker.lifecycle('install'), /Cannot save/);
  assert.equal(worker.skipped, false);
  assert.deepEqual(await worker.caches.keys(), ['novo-apps-shell-previous']);
});

test('a stalled required download is aborted without replacing the previous release', async () => {
  const worker = harness({ network: hangsUntilAborted });
  await worker.seed('/', 'previous app', 'novo-apps-shell-previous');
  await assert.rejects(worker.lifecycle('install'), /Aborted/);
  assert.equal(worker.skipped, false);
  assert.ok(worker.timeouts.includes(8000));
  assert.ok((await worker.caches.keys()).includes('novo-apps-shell-previous'));
});

test('stalled optional media cannot indefinitely delay installation', async () => {
  const worker = harness({ network: (url, options) => manifest.optional.includes(url)
    ? hangsUntilAborted(url, options) : Promise.resolve(new Response('core')) });
  await worker.lifecycle('install');
  assert.equal(worker.skipped, false);
  assert.ok(worker.timeouts.includes(5000));
});

test('a downloaded update waits for an explicit activation message', async () => {
  const worker = harness();
  await worker.lifecycle('install');
  assert.equal(worker.skipped, false);
  await worker.message({ type: 'OTHER_MESSAGE' });
  assert.equal(worker.skipped, false);
  await worker.message({ type: 'ACTIVATE_UPDATE' });
  assert.equal(worker.skipped, true);
});

test('activation removes old Learning caches while preserving unrelated application caches', async () => {
  const worker = harness();
  await worker.seed('/', 'new app');
  await worker.seed('/', 'old app', 'novo-apps-shell-v0.8.2');
  await worker.seed('/', 'other app', 'another-application');
  await worker.lifecycle('activate');
  assert.deepEqual(await worker.caches.keys(), [cacheName, 'another-application']);
  assert.equal(worker.claimed, true);
});

test('a missing offline file returns a response immediately without fetching', async () => {
  const worker = harness({ online: false });
  assert.equal((await worker.request('/missing')).status, 503);
  assert.equal(worker.requests.length, 0);
});

test('a missing file on an unresponsive connection has a three-second fetch limit', async () => {
  const worker = harness({ network: hangsUntilAborted });
  assert.equal((await worker.request('/missing')).status, 503);
  assert.deepEqual(worker.timeouts, [3000]);
});

test('optional media missed at installation can be saved later without caching partial recordings', async () => {
  const worker = harness();
  await worker.request('/audio/lesson.opus');
  await worker.settled();
  await worker.request('/audio/lesson.opus');
  assert.equal(worker.requests.length, 1);
  const partial = harness({ network: async () => new Response('part', { status: 206 }) });
  await partial.request('/audio/lesson.opus', { headers: { Range: 'bytes=0-3' } });
  await partial.settled();
  assert.equal(await (await partial.caches.open(cacheName)).match('/audio/lesson.opus'), undefined);
});

test('saved recordings support mobile byte-range requests without a network connection', async () => {
  const worker = harness({ online: false });
  await worker.seed('/audio/lesson.opus', '0123456789', cacheName, { 'Content-Type': 'audio/ogg' });
  for (const [range, expected, contentRange] of [
    ['bytes=0-1', '01', 'bytes 0-1/10'],
    ['bytes=7-', '789', 'bytes 7-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10']
  ]) {
    const response = await worker.request('/audio/lesson.opus', { headers: { Range: range } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('Content-Range'), contentRange);
    assert.equal(response.headers.get('Content-Type'), 'audio/ogg');
    assert.equal(await response.text(), expected);
  }
  assert.equal((await worker.request('/audio/lesson.opus', { headers: { Range: 'bytes=100-' } })).status, 416);
  assert.equal(worker.requests.length, 0);
});

test('requests for other origins and non-GET operations are left to the browser', () => {
  const worker = harness();
  assert.equal(worker.request('https://another.test/file'), undefined);
  assert.equal(worker.request('/', { method: 'POST' }), undefined);
});
