import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import sharp from 'sharp';
import {contentRepository} from '../src/repository';
import {storePrepared,readPrivate,sha256,decodeData,imageInfo,mediaKey,checkMediaOwnership} from '../src/r2-storage';
import {publishR2} from '../src/r2-publishing';

class Bucket{
 objects=new Map<string,any>();writes:string[]=[];onPut?: (key:string)=>void|Promise<void>;
 async head(key:string){return this.objects.get(key)?{...this.objects.get(key),body:undefined}:null;}
 async get(key:string,options?:any){const object=this.objects.get(key);if(!object)return null;const data=options?.range?object.data.subarray(options.range.offset,options.range.offset+options.range.length):object.data;
  return {...object,body:new Blob([data]).stream(),arrayBuffer:async()=>data.slice().buffer,text:async()=>new TextDecoder().decode(data),writeHttpMetadata:(headers:Headers)=>{for(const [name,value] of Object.entries(object.httpMetadata||{}))headers.set(name==='contentType'?'Content-Type':name==='cacheControl'?'Cache-Control':name,String(value));}};
 }
 async put(key:string,value:any,options:any={}){
  await this.onPut?.(key);const existing=this.objects.get(key),condition=options.onlyIf;
  if(condition?.etagDoesNotMatch==='*'&&existing||condition?.etagMatches&&condition.etagMatches!==existing?.etag)return null;
  const data=typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(await new Response(value).arrayBuffer()),hash=await sha256(data);
  if(options.sha256)assert.equal(hash,options.sha256);
  const object={data,size:data.length,etag:hash,httpEtag:'"'+hash+'"',httpMetadata:options.httpMetadata,customMetadata:options.customMetadata};this.objects.set(key,object);this.writes.push(key);return object;
 }
}
async function setup(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 const dir=new URL('../../../database/content/migrations/',import.meta.url);for(const file of (await readdir(dir)).filter(name=>name.endsWith('.sql')).sort())sqlite.exec(await readFile(new URL(file,dir),'utf8'));
 const prepare=(query:string,values:any[]=[]):any=>({bind:(...next:any[])=>prepare(query,next),async first(){return sqlite.prepare(query).get(...values)||null;},async all(){return {success:true,results:sqlite.prepare(query).all(...values),meta:{}};},async raw(){const statement=sqlite.prepare(query);statement.setReturnArrays(true);return statement.all(...values);},async run(){const result=sqlite.prepare(query).run(...values);return {success:true,results:[],meta:{changes:Number(result.changes)}};}});
 const d1:any={prepare,async batch(statements:any[]){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const source=JSON.parse(await readFile(new URL('../../../newvines-learning/public/courses/nvi-fgmm-m01.en-global.json',import.meta.url),'utf8'));
 const repo=contentRepository(d1),{moduleId}=await repo.importCourse(source),module=await repo.getModule(moduleId),draft=new Bucket(),published=new Bucket();
 const env:any={CONTENT_DB:d1,DRAFT_MEDIA:draft,PUBLISHED_CONTENT:published,CMS_STORAGE:'r2',PUBLIC_CONTENT_BUCKET:'published-test',PUBLIC_CONTENT_BASE_URL:'https://content.example.test'};
 const owner={providerId:module.provider.id,courseId:module.courseId,moduleId,pageId:module.pages[0].id,blockId:source.module.pages[0].blocks[0].id,locale:'en-global'};
 const image=await sharp({create:{width:120,height:80,channels:3,background:'#31543a'}}).webp().toBuffer();
 const input={provider:'new-vines',courseId:source.course_id+'-'+module.courseId,moduleId:source.module.id,locale:'en-global',course:{...source,provider:{id:module.provider.id,name:module.provider.name}},media:['/assets/example.webp'],approval:{actorId:'test-owner',pages:{},confirm:true}};
 await draft.put('media/assets/example.webp',image,{httpMetadata:{contentType:'image/webp'},customMetadata:{sha256:await sha256(image)}});
 return {sqlite,env,module,owner,image,input,draft,published};
}
test('prepared media stays private with UUIDv7 ownership, server-read image dimensions, scoped reads and byte ranges',async()=>{
 const c=await setup();try{
  const saved=await storePrepared(c.env,c.owner,'test-owner',{data:c.image.toString('base64'),smallData:c.image.toString('base64'),description:'Exact description'},false);
  assert.ok('image' in saved);if(!('image' in saved))throw Error('Expected image');
  assert.equal(saved.image.width,120);assert.equal(saved.image.height,80);assert.equal(saved.image.alt,'Exact description');assert.ok(saved.image.src.includes(c.owner.providerId+'/'+c.owner.courseId+'/en-global/'));
  assert.equal(c.published.objects.size,0);assert.equal(c.sqlite.prepare('SELECT count(*) AS count FROM cms_media_assets').get()!.count,2);
  const response=await readPrivate(c.env,saved.image.src,'bytes=0-15',c.owner);assert.equal(response.status,206);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal((await response.arrayBuffer()).byteLength,16);
  assert.equal((await readPrivate(c.env,saved.image.src,'bytes=999999-')).status,416);
  await assert.rejects(readPrivate(c.env,saved.image.src,undefined,{providerId:'another-provider',courseId:c.owner.courseId}),/different course/);
  for(const bad of ['/assets/../secret','/assets/cms/a%2Fb','https://example.test/a','/assets//duplicate'])assert.throws(()=>mediaKey(bad));
  const legacy='/assets/cms/new-vines/FGMM-'+c.owner.courseId+'/en-global/test/test.webp';
  assert.doesNotThrow(()=>checkMediaOwnership(legacy,undefined,{...c.owner,providerSlug:'new-vines'}));
  assert.throws(()=>checkMediaOwnership(legacy,undefined,{...c.owner,providerSlug:'different-provider'}),/different course/);
  assert.throws(()=>checkMediaOwnership(legacy,undefined,{...c.owner,providerSlug:'new-vines',courseId:'different-course'}),/different course/);
  assert.throws(()=>checkMediaOwnership('/assets/cms/provider',undefined,c.owner),/different course/);
  assert.throws(()=>decodeData('bad!'));assert.throws(()=>imageInfo(new Uint8Array(50)));
  await assert.rejects(storePrepared(c.env,c.owner,'test-owner',{data:c.image.toString('base64')},true),/Ogg\/Opus/);
 }finally{c.sqlite.close();}
});
test('publishing activates only a complete immutable release and preserves canonical text and exact media bytes',async()=>{
 const c=await setup();try{
  let checks=0;const result=await publishR2(c.env,c.module.id,'test-owner',c.input,async()=>{checks++;});assert.equal(checks,2);
  const pointer=c.published.writes.at(-1)!;assert.ok(pointer.endsWith('/latest.json'));const latest=JSON.parse((await c.published.get(pointer)).text?await(await c.published.get(pointer)).text():'');assert.equal(latest.release,result.release);
  const course=JSON.parse(await(await c.published.get(new URL(result.url).pathname.slice(1))).text());
  const {asset_base_url,content_version,...canonical}=course;assert.deepEqual(canonical,c.input.course);
  const key=new URL(result.url).pathname.slice(1).replace('course.json','assets/example.webp');assert.deepEqual(Buffer.from(await(await c.published.get(key)).arrayBuffer()),c.image);
  assert.equal(c.sqlite.prepare('SELECT status,created_by FROM cms_publications').get()!.status,'published');assert.equal(c.sqlite.prepare('SELECT count(*) AS count FROM cms_publication_leases').get()!.count,0);
  assert.equal(c.published.objects.get(pointer).httpMetadata.cacheControl,'no-store');assert.ok(c.published.objects.has('robots.txt'));
 }finally{c.sqlite.close();}
});
test('missing/corrupt private media and interrupted writes retain the previous publication',async()=>{
 const c=await setup();try{
  const initial=await publishR2(c.env,c.module.id,'test-owner',c.input,async()=>{}),pointer=c.published.writes.at(-1)!,previous=await(await c.published.get(pointer)).text();
  await assert.rejects(publishR2(c.env,c.module.id,'test-owner',{...c.input,media:['/assets/missing.webp']},async()=>{}),/missing/);assert.equal(await(await c.published.get(pointer)).text(),previous);
  c.published.onPut=key=>{if(key.endsWith('/manifest.json'))throw Error('Injected upload failure');};
  await assert.rejects(publishR2(c.env,c.module.id,'test-owner',c.input,async()=>{}),/Injected/);assert.equal(await(await c.published.get(pointer)).text(),previous);
  c.published.onPut=undefined;c.draft.objects.get('media/assets/example.webp').customMetadata.sha256='0'.repeat(64);
  await assert.rejects(publishR2(c.env,c.module.id,'test-owner',c.input,async()=>{}),/checksum/);assert.equal(await(await c.published.get(pointer)).text(),previous);
  assert.equal(c.sqlite.prepare("SELECT count(*) AS count FROM cms_publications WHERE status='failed'").get()!.count,3);
 }finally{c.sqlite.close();}
});
test('D1 publication leases serialize different Worker invocations and expired leases can be recovered',async()=>{
 const c=await setup();try{
  let ready!:()=>void,release!:()=>void;const started=new Promise<void>(resolve=>ready=resolve),gate=new Promise<void>(resolve=>release=resolve);let checks=0;
  const first=publishR2(c.env,c.module.id,'test-owner',c.input,async()=>{if(++checks===1){ready();await gate;}});
  await started;await assert.rejects(publishR2(c.env,c.module.id,'test-owner',c.input,async()=>{}),/already being published/);release();await first;
  c.sqlite.prepare('INSERT INTO cms_publication_leases VALUES(?,?,0)').run(c.module.id,'expired-test');await publishR2(c.env,c.module.id,'test-owner',c.input,async()=>{});
 }finally{c.sqlite.close();}
});
test('a competing R2 pointer or source change cannot be overwritten by an in-flight publisher',async()=>{
 const c=await setup();try{
  await publishR2(c.env,c.module.id,'test-owner',c.input,async()=>{});const pointer=c.published.writes.at(-1)!;
  c.published.onPut=async key=>{if(key.endsWith('/manifest.json')){c.published.onPut=undefined;await c.published.put(pointer,'{"release":"competing"}');}};
  await assert.rejects(publishR2(c.env,c.module.id,'test-owner',c.input,async()=>{}),/pointer changed/);assert.equal(await(await c.published.get(pointer)).text(),'{"release":"competing"}');
  let checks=0;await assert.rejects(publishR2(c.env,c.module.id,'test-owner',c.input,async()=>{if(++checks===2)throw Error('Source changed');}),/Source changed/);assert.equal(await(await c.published.get(pointer)).text(),'{"release":"competing"}');
 }finally{c.sqlite.close();}
});

test('an R2 conditional write failure cannot activate an incomplete release',async()=>{
 const c=await setup();try{
  await publishR2(c.env,c.module.id,'test-owner',c.input,async()=>{});const pointer=c.published.writes.at(-1)!,before=await(await c.published.get(pointer)).text();
  const original=c.published.put.bind(c.published);c.published.put=async(key,value,options)=>key.endsWith('/course.json')?null:original(key,value,options);
  await assert.rejects(publishR2(c.env,c.module.id,'test-owner',c.input,async()=>{}),/immutable release object/);
  assert.equal(await(await c.published.get(pointer)).text(),before);
 }finally{c.sqlite.close();}
});

test('post-activation D1 bookkeeping failures retain success and report pending audit',async()=>{
 const c=await setup();try{
  const original=c.env.CONTENT_DB.prepare;
  c.env.CONTENT_DB.prepare=(query:string,...rest:any[])=>{
   if(query.startsWith("UPDATE cms_publications SET status='published'")||query.startsWith('DELETE FROM cms_publication_leases'))throw Error('Injected D1 bookkeeping failure');
   return original(query,...rest);
  };
  const result=await publishR2(c.env,c.module.id,'test-owner',c.input,async()=>{});
  assert.equal(result.auditPending,true);
  const pointer=c.published.writes.at(-1)!;
  assert.equal(JSON.parse(await(await c.published.get(pointer)).text()).release,result.release);
  assert.ok(c.published.objects.has(new URL(result.url).pathname.slice(1)));
 }finally{c.sqlite.close();}
});
