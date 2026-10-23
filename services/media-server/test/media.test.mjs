
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
process.env.NODE_ENV='test';
const state=await mkdtemp(path.join(os.tmpdir(),'novoapps-media-test-'));
process.env.CMS_MEDIA_STATE=state;
process.env.CMS_PUBLISH_TEST_DIR=path.join(state,'fake-r2');
const {handle}=await import('../src/server.mjs');
const server=http.createServer((req,res)=>void handle(req,res));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const root='http://127.0.0.1:'+server.address().port;
const context={provider:'test-provider',course:'test-course',locale:'es-ni',page:'test-page',block:'test-block'};
const post=(route,value,headers={})=>fetch(root+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(value)});
function wav(){const size=48000*2*3,bytes=Buffer.alloc(44+size);bytes.write('RIFF');bytes.writeUInt32LE(36+size,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(48000,24);bytes.writeUInt32LE(96000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(size,40);for(let i=0;i<size/2;i++)bytes.writeInt16LE(Math.round(Math.sin(i*440*2*Math.PI/48000)*8000),44+i*2);return bytes;}
test('local media conversion, ownership paths, ranges, image variants and atomic publication',async t=>{
 try{
  const policy=await fetch(root+'/robots.txt');assert.equal(policy.status,200);assert.ok((await policy.text()).includes('Disallow: /'));assert.ok(policy.headers.get('X-Robots-Tag').includes('noindex'));
  assert.equal((await post('/audio',{context,data:wav().toString('base64')},{Origin:'https://untrusted.example'})).status,403);
  const response=await post('/audio',{context,data:wav().toString('base64')});
  assert.equal(response.status,201,await response.clone().text());
  const audio=await response.json();assert.match(audio.audio,/^\/audio\/cms\/test-provider\/test-course\/es-ni\/test-page\/test-block\/.*\.opus$/);
  const sound=Buffer.from(await(await fetch(root+audio.audio)).arrayBuffer());
  assert.equal(sound.subarray(0,4).toString(),'OggS');assert.ok(sound.includes(Buffer.from('OpusHead')));assert.ok(sound.length<wav().length/4);
  const range=await fetch(root+audio.audio,{headers:{Range:'bytes=0-15'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,16);
  const imageBytes=await sharp({create:{width:1200,height:800,channels:3,background:'#31543a'}}).png().toBuffer();
  const imageResponse=await post('/image',{context,description:'A test illustration',data:imageBytes.toString('base64')});assert.equal(imageResponse.status,201);
  const {image}=await imageResponse.json();assert.equal(image.width,768);assert.equal(image.height,512);assert.equal(image.alt,'A test illustration');
  const small=await sharp(Buffer.from(await(await fetch(root+image.small_src)).arrayBuffer())).metadata();assert.equal(small.width,384);assert.equal(small.format,'webp');
  assert.equal((await post('/settings',{bucket:'novoapps-content',publicBaseUrl:'https://content.example.test'})).status,200);
  const body={confirm:true,provider:context.provider,courseId:context.course,locale:context.locale,moduleId:'module-one',course:{title:'Test'},media:[audio.audio,image.src,image.small_src],approval:{mode:'test'}};
  const publish=await post('/publish',body);assert.equal(publish.status,201,await publish.clone().text());const result=await publish.json();
  assert.match(result.url,/test-provider\/test-course\/es-ni\/modules\/module-one\/releases\//);
  const pointer=path.join(state,'fake-r2/novoapps-content/test-provider/test-course/es-ni/modules/module-one/latest.json');
  assert.ok((await readFile(path.join(state,'fake-r2/novoapps-content/robots.txt'),'utf8')).includes('Disallow: /'));const previous=await readFile(pointer,'utf8');assert.equal(JSON.parse(previous).release,result.release);
  const packagePath=path.join(state,'fake-r2/novoapps-content',new URL(result.url).pathname);
  const document=JSON.parse(await readFile(packagePath,'utf8'));assert.ok(document.asset_base_url.endsWith('/'));assert.equal(document.content_version,result.release);
  const manifest=JSON.parse(await readFile(packagePath.replace('course.json','manifest.json'),'utf8'));assert.equal(manifest.files.length,4);assert.equal(manifest.approval.mode,'test');assert.ok(manifest.files.every(file=>file.sha256.length===64));
  assert.equal((await post('/publish',{...body,media:['/audio/missing.opus']})).status,404);
  assert.equal(await readFile(pointer,'utf8'),previous,'A missing asset cannot replace the last complete publication');
  assert.equal((await post('/settings',{bucket:'novoapps-content',publicBaseUrl:'https://user:password@example.test'})).status,400);
  assert.equal((await post('/audio',{context,data:'invalid'})).status,400);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
