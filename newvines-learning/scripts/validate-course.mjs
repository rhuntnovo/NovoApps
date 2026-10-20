import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const course = JSON.parse(fs.readFileSync('public/courses/nvi-fgmm-m01.en-global.json', 'utf8'));
const ids = new Set();
const unique = (id, context) => {
  assert.equal(typeof id, 'string', `${context}: missing stable ID`);
  assert.ok(id.length && !ids.has(id), `${context}: empty or duplicate ID ${id}`);
  ids.add(id);
};
for (const page of course.module.pages) {
  unique(page.id, 'Page');
  for (const block of page.blocks) {
    unique(block.id, page.id);
    assert.equal(typeof block.text, 'string', `${block.id}: missing canonical text`);
    assert.ok(block.localization_policy, `${block.id}: missing localization policy`);
    if (block.image) {
      assert.ok(block.image.alt && block.image.width > 0 && block.image.height > 0, `${block.id}: incomplete illustration metadata`);
      for (const url of [block.image.src, block.image.small_src].filter(Boolean)) {
        assert.ok(url.startsWith('/assets/'), `${block.id}: invalid illustration URL`);
        const assetPath = path.resolve('public', url.slice(1));
        assert.ok(assetPath.startsWith(path.resolve('public/assets') + path.sep), `${block.id}: illustration outside public/assets`);
        assert.ok(fs.existsSync(assetPath), `${block.id}: missing illustration ${url}`);
      }
    }
  }
  if (!page.presentation?.reveal_blocks) continue;
  const body = page.blocks.filter(block => block.type !== 'title');
  assert.ok(body.length, `${page.id}: no reveal blocks`);
  const mapped = new Set();
  for (const segment of page.guided?.segments || []) {
    assert.ok(body.some(block => block.id === segment.block_id), `${page.id}: unknown narration block ${segment.block_id}`);
    assert.ok(!mapped.has(segment.block_id), `${page.id}: duplicate narration mapping`);
    mapped.add(segment.block_id);
    assert.ok(segment.text?.trim(), `${page.id}: empty narration`);
    if (segment.audio) {
      assert.ok(segment.audio.startsWith('/audio/'), `${page.id}: invalid audio URL`);
      const audioPath = path.resolve('public', segment.audio.slice(1));
      assert.ok(audioPath.startsWith(path.resolve('public/audio') + path.sep), `${page.id}: audio outside public/audio`);
      assert.ok(fs.existsSync(audioPath), `${page.id}: missing audio ${segment.audio}`);
    }
  }
  if (page.guided) assert.equal(mapped.size, body.length, `${page.id}: narration does not cover every block`);
  if (page.reflection) assert.ok(page.reflection.title && page.reflection.prompt, `${page.id}: incomplete individual reflection`);
}
console.log(`Validated ${course.module.pages.length} pages, stable IDs, narration mappings, and existing audio assets.`);
