import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('public');
const catalog=JSON.parse(await readFile(path.join(root,'courses/catalog.json'),'utf8'));
assert.equal(catalog.schema_version,1);assert.ok(catalog.editions.length);
let total=0;const ids=new Set();
for(const entry of catalog.editions){
 assert.ok(!ids.has(entry.id),'Duplicate edition');ids.add(entry.id);
 assert.ok(entry.path.startsWith('/delivery/')||entry.path.startsWith('/courses/'));
 const directory=path.dirname(path.resolve(root,'.'+entry.path));assert.ok(directory.startsWith(root+path.sep));
 const course=JSON.parse(await readFile(path.resolve(root,'.'+entry.path),'utf8'));
 assert.equal(course.course_id,entry.courseId);assert.equal(course.module.id,entry.moduleId);assert.equal(course.language,entry.language);assert.equal(course.country.toLowerCase(),entry.country.toLowerCase());
 if(!entry.path.startsWith('/delivery/'))continue;
 const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
 assert.equal(course.content_version,entry.contentVersion);assert.equal(manifest.release,entry.contentVersion);
 for(const file of manifest.files){
  const destination=path.resolve(directory,file.path);assert.ok(destination.startsWith(directory+path.sep));
  const bytes=await readFile(destination);assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,'Publication hash changed: '+file.path);total++;
 }
}
console.log('Validated '+catalog.editions.length+' course editions and '+total+' immutable publication files.');
