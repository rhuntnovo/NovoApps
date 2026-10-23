
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {stagePublications} from '../stage-learning-publications';
const digest=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
function fixture(){
 const folder='provider/course-uuid/en-global/modules/module-one/releases/release-one/';
 const url='https://content.example/'+folder+'course.json',manifestUrl='https://content.example/'+folder+'manifest.json';
 const course={schema_version:'0.3',provider:{id:'019a0640-0000-7000-8000-000000000001',name:'Provider'},course_id:'course',title:'Canonical Course',track:'Test',language:'en',country:'global',content_version:'release-one',
 module:{id:'module-one',number:1,title:'Canonical Module',pages:[{id:'page-one',source_slide:1,title:'Original Title',layout:'teaching',blocks:[{id:'block-one',type:'paragraph',text:'Scripture and canonical words remain exact.',localization_policy:'LOCKED',image:{src:'/assets/family.webp',alt:'A family',width:768,height:512}}]}]},source_issues:[]};
 const document=Buffer.from(JSON.stringify(course)),image=Buffer.from('test image bytes');
 const manifest={release:'release-one',provider:'provider',courseId:'course-uuid',locale:'en-global',moduleId:'module-one',files:[
  {path:'course.json',bytes:document.length,sha256:digest(document)},{path:'assets/family.webp',bytes:image.length,sha256:digest(image)}]};
 const requests:string[]=[];
 const request=(async(input:any)=>{const address=String(input);requests.push(address);
  if(address===manifestUrl)return Response.json(manifest);
  if(address===url)return new Response(document);
  if(address==='https://content.example/'+folder+'assets/family.webp')return new Response(image);
  return new Response('Missing',{status:404});
 }) as typeof fetch;
 return {url,manifestUrl,course,document,image,manifest,request,requests,folder};
}
test('staging preserves published course/media bytes and keeps other provider editions',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'novoapps-delivery-')),f=fixture();
 await mkdir(path.join(root,'courses'));await writeFile(path.join(root,'courses/catalog.json'),JSON.stringify({schema_version:1,editions:[{id:'another-provider',providerId:'another-provider',courseId:'other',moduleId:'module',language:'en',country:'global'}]}));
 const [entry]=await stagePublications([f],root,f.request);
 assert.deepEqual(await readFile(path.join(root,entry.path.slice(1))),f.document);
 assert.deepEqual(await readFile(path.join(root,path.dirname(entry.path.slice(1)),entry.media['/assets/family.webp'])),f.image);
 const catalog=JSON.parse(await readFile(path.join(root,'courses/catalog.json'),'utf8'));assert.equal(catalog.editions.length,2);
 assert.ok(path.join(root,entry.path.slice(1)).length<250);assert.ok(Object.values(entry.media).every(value=>String(value).length<40));assert.equal(entry.publicationUrl,f.url);assert.equal(entry.contentVersion,'release-one');
 assert.deepEqual(JSON.parse(await readFile(path.join(root,entry.path.slice(1)),'utf8')),f.course);
});
test('a tampered asset cannot replace the previous valid delivery catalog',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'novoapps-delivery-')),f=fixture();await stagePublications([f],root,f.request);
 const before=await readFile(path.join(root,'courses/catalog.json'),'utf8');
 f.manifest.files[1].sha256='0'.repeat(64);
 await assert.rejects(stagePublications([f],root,f.request),/checksum mismatch/);
 assert.equal(await readFile(path.join(root,'courses/catalog.json'),'utf8'),before);
});
test('staging rejects path traversal, mismatched manifests and credential-bearing URLs',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'novoapps-delivery-'));
 for(const bad of ['../../.env','/outside','assets/%2e%2e/secret','assets/../secret']){
  const f=fixture();f.manifest.files[1].path=bad;await assert.rejects(stagePublications([f],root,f.request),/Unsafe publication file path/);
 }
 const f=fixture();await assert.rejects(stagePublications([{...f,url:f.url.replace('https://','https://user:secret@')}],root,f.request),/immutable HTTPS/);
 await assert.rejects(stagePublications([{...f,manifestUrl:'https://other.example/manifest.json'}],root,f.request),/matching manifest/);
});
