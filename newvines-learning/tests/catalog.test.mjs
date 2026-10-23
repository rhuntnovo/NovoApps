import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCatalog,chooseEdition,editionFromUrl,resolveDeliveryCourse} from '../src/catalog.ts';
import {lessonResumeIdentity} from '../src/pwa/lessonResume.ts';
const english={id:'provider/course/module/en-global',providerId:'provider',courseId:'course',moduleId:'module',language:'en',country:'global',label:'English',path:'/delivery/provider/course/en-global/course.json',contentVersion:'one'};
const spanish={...english,id:'provider/course/module/es-ni',language:'es',country:'NI',label:'Español',path:'/delivery/provider/course/es-ni/course.json'};
test('edition links take priority over saved choice, with a stable English default',()=>{
 const entries=parseCatalog({schema_version:1,editions:[english,spanish]});
 assert.equal(chooseEdition(entries,null,null),english);
 assert.equal(chooseEdition(entries,null,spanish.id),spanish);
 assert.equal(chooseEdition(entries,editionFromUrl('?lang=es-ni'),english.id),spanish);
 assert.equal(chooseEdition(entries,'es',english.id),spanish);
 assert.equal(chooseEdition(entries,english.id,spanish.id),english);
 assert.equal(chooseEdition(entries,'unknown','missing'),english);
});
test('catalog rejects duplicate identities, unsafe paths and empty catalogs',()=>{
 assert.throws(()=>parseCatalog({schema_version:1,editions:[]}));
 assert.throws(()=>parseCatalog({schema_version:1,editions:[english,english]}));
 for(const path of ['/delivery/%2e%2e/.env','https://other.example/course.json','//other.example/course.json','/delivery/file.json?token=private'])
  assert.throws(()=>parseCatalog({schema_version:1,editions:[{...english,path}]}));
});
test('update handoffs isolate provider, module and regional editions',()=>{
 const base={provider:{id:'provider-one'},course_id:'course',country:'NI',module:{id:'module-one'}};
 const id=lessonResumeIdentity(base);
 assert.notEqual(id,lessonResumeIdentity({...base,country:'ES'}));
 assert.notEqual(id,lessonResumeIdentity({...base,module:{id:'module-two'}}));
 assert.notEqual(id,lessonResumeIdentity({...base,provider:{id:'provider-two'}}));
});
test('compact media mapping changes only presentation references, preserving source text and identities',()=>{
 const entry={...english,media:{'/assets/family.webp':'assets/'+('a'.repeat(24))+'.webp','/audio/section.opus':'audio/'+('b'.repeat(24))+'.opus'}};
 const document={asset_base_url:'https://content.example/release/',provider:{id:'provider'},module:{id:'module',pages:[{id:'page',title:'Exact title',blocks:[{id:'block',text:'Exact Scripture and wording.',image:{src:'/assets/family.webp',alt:'Exact description'}}],guided:{narration:'Exact notes',segments:[{block_id:'block',text:'Exact narration',audio:'/audio/section.opus'}]}}]}};
 const original=structuredClone(document),resolved=resolveDeliveryCourse(document,entry);
 assert.deepEqual(document,original);
 assert.equal(resolved.module.pages[0].blocks[0].text,original.module.pages[0].blocks[0].text);
 assert.equal(resolved.module.pages[0].guided.segments[0].text,original.module.pages[0].guided.segments[0].text);
 assert.equal(resolved.module.pages[0].blocks[0].id,'block');
 assert.ok(resolved.module.pages[0].blocks[0].image.src.startsWith('/delivery/provider/course/en-global/assets/'));
 assert.ok(resolved.module.pages[0].guided.segments[0].audio.startsWith('/delivery/provider/course/en-global/audio/'));
 assert.equal(resolved.asset_base_url,undefined);
 assert.throws(()=>parseCatalog({schema_version:1,editions:[{...entry,media:{'/assets/image.webp':'../secret'}}]}));
});
