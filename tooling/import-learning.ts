import { readFile } from 'node:fs/promises';
import { courseSchema } from '@novoapps/content-model';
const source = new URL('../newvines-learning/public/courses/nvi-fgmm-m01.en-global.json', import.meta.url);
const course = courseSchema.parse(JSON.parse(await readFile(source, 'utf8')));
const response = await fetch('http://127.0.0.1:8787/api/v1/cms/import', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(course)
});
const result = await response.json();
if (response.status === 409) console.log('Module already imported; existing drafts kept.');
else if (!response.ok) throw new Error(JSON.stringify(result));
else console.log('Imported ' + course.module.pages.length + ' pages into local D1. ' + JSON.stringify(result));
