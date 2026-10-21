import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { courseSchema } from '../src/index';
const source = JSON.parse(await readFile(new URL('../../../newvines-learning/public/courses/nvi-fgmm-m01.en-global.json', import.meta.url), 'utf8'));

test('schema 0.3 import preserves every published value, including Scripture and metadata', () => {
  assert.deepEqual(courseSchema.parse(source), source);
});
test('unknown extension metadata survives validation', () => {
  const extended = structuredClone(source);
  extended.future_metadata = { approved: true };
  extended.module.pages[0].blocks[0].future_metadata = { translated: false };
  assert.deepEqual(courseSchema.parse(extended), extended);
});
test('published IDs must be unique across all pages and blocks', () => {
  const invalid = structuredClone(source);
  invalid.module.pages[1].blocks[0].id = invalid.module.pages[0].blocks[0].id;
  assert.equal(courseSchema.safeParse(invalid).success, false);
});
test('narration must reference a real body block', () => {
  const invalid = structuredClone(source);
  invalid.module.pages.find((page: any) => page.guided).guided.segments[0].block_id = 'missing-block';
  assert.equal(courseSchema.safeParse(invalid).success, false);
});
test('unsafe media paths are rejected', () => {
  for (const path of ['/assets/../secret.png','/assets/%2e%2e/secret.png','https://evil.test/image.png','/assets/\\secret.png','/assets/x.png?secret=y']) {
    const invalid = structuredClone(source);
    invalid.module.pages.find((page: any) => page.blocks.some((block: any) => block.image)).blocks.find((block: any) => block.image).image.src = path;
    assert.equal(courseSchema.safeParse(invalid).success, false, path);
  }
});
