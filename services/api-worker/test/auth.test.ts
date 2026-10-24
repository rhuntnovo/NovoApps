import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {app} from '../src/index';
import {reviewerPage} from '../src/authorization';
const source=JSON.parse(await readFile(new URL('../../../newvines-learning/public/courses/nvi-fgmm-m01.en-global.json',import.meta.url),'utf8'));
function binding(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 const prepare=(query:string,values:any[]=[]):any=>({bind:(...next:any[])=>prepare(query,next),
  async first(){return sqlite.prepare(query).get(...values)||null;},
  async all(){return {success:true,results:sqlite.prepare(query).all(...values),meta:{}};},
  async raw(){const statement=sqlite.prepare(query);statement.setReturnArrays(true);return statement.all(...values);},
  async run(){const result=sqlite.prepare(query).run(...values);return {success:true,results:[],meta:{changes:Number(result.changes)}};}
 });
 const d1:any={prepare,async batch(statements:any[]){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 return {sqlite,d1};
}
const password='Test-only-long-password!43';
async function context(){
 const content=binding(),control=binding();
 for(const [db,name] of [[content,'content'],[control,'control']] as const){const path=new URL('../../../database/'+name+'/migrations/',import.meta.url);for(const file of (await readdir(path)).filter(file=>file.endsWith('.sql')).sort())db.sqlite.exec(await readFile(new URL(file,path),'utf8'));}
 const env={CONTENT_DB:content.d1,CONTROL_DB:control.d1,LOCAL_AUTHORING:'true',AUTH_REQUIRED:'true',CMS_ORIGIN:'http://127.0.0.1:5174',PLATFORM_ORIGIN:'http://127.0.0.1:5176',AUTH_ORIGIN:'http://127.0.0.1:8787',CMS_MEDIA_SECRET:'test-bridge-secret-only-0000000000000000',BETTER_AUTH_SECRET:'test-secret-only-not-a-real-secret-0000000000000'};
 async function request(path:string,method='GET',body?:any,cookie='',extra:Record<string,string>={}){return app.fetch(new Request(env.AUTH_ORIGIN+path,{method,headers:{Origin:env.PLATFORM_ORIGIN,...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)}),env);}
 const data=async(response:Response,status:number)=>{assert.equal(response.status,status,await response.clone().text());return response.json() as Promise<any>;};
 const signIn=async(email:string)=>{const response=await request('/api/auth/sign-in/email','POST',{email,password});assert.equal(response.status,200,await response.clone().text());assert.deepEqual(await response.clone().json(),{ok:true});assert.equal(response.headers.get('Access-Control-Allow-Origin'),env.PLATFORM_ORIGIN);assert.equal(response.headers.get('Access-Control-Allow-Credentials'),'true');const set=response.headers.getSetCookie();assert.ok(set.some(cookie=>cookie.includes('HttpOnly')&&cookie.includes('SameSite=Lax')));return set.map(cookie=>cookie.split(';')[0]).join('; ');};
 const setup=async()=>{await data(await request('/api/v1/account/setup','POST',{name:'Test Owner',email:'owner@example.test',password}),201);return signIn('owner@example.test');};
 const close=()=>{content.sqlite.close();control.sqlite.close();};
 return {env,content,control,request,data,signIn,setup,close};
}
test('Better Auth uses real password verification, HttpOnly cookies, expiry and server-side logout; native signup is closed',async()=>{
 const c=await context();try{
  assert.equal((await c.request('/api/v1/cms/providers')).status,401);
  assert.equal((await c.request('/api/auth/sign-up/email','POST',{name:'Intruder',email:'no@example.test',password})).status,404);
  assert.equal((await c.request('/api/v1/account/register','POST',{name:'Intruder',password,token:'1'.repeat(64)})).status,400);
  const cookie=await c.setup();
  const session=await c.data(await c.request('/api/v1/access','GET',undefined,cookie),200);
  assert.equal(session.owner,true);assert.equal(session.user.email,'owner@example.test');assert.equal('session' in session,false);
  assert.match(session.user.id,/^[a-f\d-]{14}7/);
  assert.equal((await c.request('/api/auth/sign-in/email','POST',{email:'owner@example.test',password:'incorrect-password'})).status,401);
  assert.equal((await c.request('/api/v1/account/setup','POST',{name:'Another',email:'another@example.test',password})).status,409);
  const stored=c.control.sqlite.prepare('SELECT password FROM auth_account').get()!.password as string;assert.ok(stored&&!stored.includes(password));
  await c.data(await c.request('/api/auth/sign-out','POST',{},cookie),200);
  assert.equal((await c.request('/api/v1/access','GET',undefined,cookie)).status,401);
  const second=await c.signIn('owner@example.test');c.control.sqlite.exec('UPDATE auth_session SET expires_at=0');
  assert.equal((await c.request('/api/v1/access','GET',undefined,second)).status,401);
 }finally{c.close();}
});
test('invite acceptance restricts provider, primary course and language, audits saves, and revocation takes effect on an existing session',async()=>{
 const c=await context();try{
  const owner=await c.setup();
  const imported=await c.data(await c.request('/api/v1/cms/import','POST',source,owner),201);
  const original=await c.data(await c.request('/api/v1/cms/modules/'+imported.moduleId,'GET',undefined,owner),200);
  const edition=await c.data(await c.request('/api/v1/cms/modules/'+original.id+'/editions','POST',{language:'es',region:'NI'},owner),201);
  const spanish=await c.data(await c.request('/api/v1/cms/modules/'+edition.moduleId,'GET',undefined,owner),200);
  await c.data(await c.request('/api/v1/cms/modules/'+original.id+'/editions','POST',{language:'fr',region:'FR'},owner),201);
  await c.data(await c.request('/api/v1/cms/import','POST',{...source,course_id:'OTHER-COURSE',title:'A Different Course'},owner),201);
  const other=await c.data(await c.request('/api/v1/cms/providers','POST',{name:'Other Provider',slug:'other-provider'},owner),201);
  await c.data(await c.request('/api/v1/cms/import','POST',{providerId:other.id,course:source},owner),201);
  const invite=await c.data(await c.request('/api/v1/account/invitations','POST',{email:'reviewer@example.test',providerId:original.provider.id,courseId:original.courseId,locale:'es-ni'},owner),201);
  const token=new URLSearchParams(new URL(invite.url).hash.slice(1)).get('invite')!;
  assert.ok(token);assert.notEqual(c.control.sqlite.prepare('SELECT token_hash FROM cms_invitation').get()!.token_hash,token);
  await c.data(await c.request('/api/v1/account/register','POST',{name:'Reviewer',password,token}),201);
  const reviewer=await c.signIn('reviewer@example.test');
  assert.deepEqual(await c.data(await c.request('/api/v1/cms/providers','GET',undefined,reviewer),200),[]);
  await c.data(await c.request('/api/v1/account/accept','POST',{token},reviewer),200);
  assert.equal((await c.request('/api/v1/account/accept','POST',{token},reviewer)).status,400);
  const providers=await c.data(await c.request('/api/v1/cms/providers','GET',undefined,reviewer),200);assert.deepEqual(providers.map((p:any)=>p.id),[original.provider.id]);
  const courses=await c.data(await c.request('/api/v1/cms/courses','GET',undefined,reviewer),200);assert.equal(courses.length,2);assert.ok(courses.every((row:any)=>row.locale!=='fr-fr'));
  const modules=await c.data(await c.request('/api/v1/cms/modules','GET',undefined,reviewer),200);assert.equal(modules.length,2);
  const all=await c.data(await c.request('/api/v1/cms/modules','GET',undefined,owner),200);
  for(const denied of all.filter((row:any)=>!modules.some((m:any)=>m.id===row.id)))assert.equal((await c.request('/api/v1/cms/modules/'+denied.id,'GET',undefined,reviewer)).status,403);
  const page=structuredClone(spanish.course.module.pages[4]);page.blocks[0].text+=' Prueba de revisión.';
  const pageURL='/api/v1/cms/pages/'+spanish.pages[4].id+'/draft';
  const body={expectedRevision:1,page,allowWordingChanges:true,translationStatus:'draft',sourceRevision:spanish.pages[4].sourceCurrentRevision};
  await c.data(await c.request(pageURL,'PUT',body,reviewer),200);
  const audit=c.control.sqlite.prepare("SELECT actor_id,status FROM platform_audit WHERE target=?").get(pageURL.replace('/api/v1/cms',''))!;assert.equal(audit.status,200);assert.notEqual(audit.actor_id,null);
  assert.equal(c.content.sqlite.prepare('SELECT created_by FROM cms_page_revisions WHERE page_id=? AND revision=2').get(spanish.pages[4].id)!.created_by,audit.actor_id);
  const reviewed={...body,expectedRevision:2,translationStatus:'reviewed',reviewNote:'Checked against source.'};
  await c.data(await c.request(pageURL,'PUT',reviewed,reviewer),200);
  assert.equal((await c.request('/api/v1/cms/pages/'+original.pages[4].id+'/draft','PUT',{...body,page:original.course.module.pages[4]},reviewer)).status,403);
  assert.equal((await c.request(pageURL,'PUT',{...body,expectedRevision:2,page:{...page,layout:'prayer'}},reviewer)).status,403);
  for(const [path,method] of [['/media-capabilities','GET'],['/media-tools/ffmpeg-core.wasm','GET'],['/translation-settings','GET'],['/translation-settings','PUT'],['/providers','POST'],['/storage-settings','GET'],['/modules/'+spanish.id+'/publish','POST'],['/modules/'+spanish.id+'/sync-source','POST'],['/pages/'+spanish.pages[4].id+'/translate','POST']])assert.equal((await c.request('/api/v1/cms'+path,method,method==='GET'?undefined:{},reviewer)).status,403,path);
  assert.equal((await c.request('/api/v1/account/invitations','GET',undefined,reviewer)).status,403);
  assert.equal((await c.request('/assets/cms/private/unrelated.webp','GET',undefined,reviewer)).status,403);
  const attached=structuredClone(page);attached.blocks[0].image={src:'/assets/cms/private/test.webp',alt:'Private test',width:120,height:80};
  await c.data(await c.request(pageURL,'PUT',{...reviewed,expectedRevision:3,page:attached},owner),200);
  let bridgeCalled=false;
  const mocked=mock.method(globalThis,'fetch',async(_input:any,options:any)=>{bridgeCalled=true;assert.equal(options.headers['X-CMS-Bridge'],c.env.CMS_MEDIA_SECRET);assert.equal(options.headers.Range,'bytes=0-15');return new Response(new Uint8Array(16),{status:206,headers:{'Content-Type':'image/webp','Content-Range':'bytes 0-15/100','Cache-Control':'private, max-age=31536000'}});});
  try{const response=await c.request(attached.blocks[0].image.src,'GET',undefined,reviewer,{Range:'bytes=0-15'});assert.equal(response.status,206);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Access-Control-Allow-Origin'),c.env.PLATFORM_ORIGIN);assert.equal(response.headers.get('Access-Control-Allow-Credentials'),'true');assert.equal((await response.arrayBuffer()).byteLength,16);assert.equal(bridgeCalled,true);}finally{mocked.mock.restore();}
  await c.data(await c.request('/api/v1/account/invitations/'+invite.id+'/revoke','POST',{},owner),200);
  assert.equal((await c.request('/api/v1/cms/modules/'+spanish.id,'GET',undefined,reviewer)).status,403);
  assert.equal((await c.request(pageURL,'PUT',{...body,expectedRevision:2},reviewer)).status,403);
  assert.deepEqual(await c.data(await c.request('/api/v1/cms/courses','GET',undefined,reviewer),200),[]);
 }finally{c.close();}
});
test('auth mode rejects missing configuration, absent/cross-site origins and non-loopback hosting',async()=>{
 const c=await context();try{
  for(const env of [{...c.env,BETTER_AUTH_SECRET:''},{...c.env,CONTROL_DB:undefined}])assert.equal((await app.fetch(new Request(c.env.AUTH_ORIGIN+'/api/v1/access'),env)).status,503);
  assert.equal((await c.request('/api/v1/account/setup','POST',{},'',{Origin:'https://evil.test'})).status,403);
  assert.equal((await app.fetch(new Request(c.env.AUTH_ORIGIN+'/api/v1/account/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),c.env)).status,403);
  assert.equal((await c.request('/api/v1/access','GET',undefined,'',{'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await app.fetch(new Request('https://hosted.example.test/api/v1/access'),c.env)).status,403);
 }finally{c.close();}
});
test('text review preserves structure/media and detaches only changed narration',()=>{
 const before=structuredClone(source.module.pages[4]);
 before.guided={narration:'Notes',segments:[{block_id:before.blocks[0].id,text:'Recorded text',audio:'/audio/example.opus',audio_source:'human'}]};
 const next=structuredClone(before);next.title+=' Draft';next.blocks[0].text+=' Translation';assert.equal(reviewerPage(before,next),true);
 next.guided.segments[0].text='Changed narration';assert.equal(reviewerPage(before,next),false);delete next.guided.segments[0].audio;delete next.guided.segments[0].audio_source;assert.equal(reviewerPage(before,next),true);
 next.blocks.reverse();assert.equal(reviewerPage(before,next),false);
});

test('expired/revoked invitations cannot register or be accepted, and a different signed-in email cannot claim access',async()=>{
 const c=await context();try{
  const owner=await c.setup(),imported=await c.data(await c.request('/api/v1/cms/import','POST',source,owner),201);
  const primary=await c.data(await c.request('/api/v1/cms/modules/'+imported.moduleId,'GET',undefined,owner),200);
  await c.data(await c.request('/api/v1/cms/modules/'+primary.id+'/editions','POST',{language:'es',region:'NI'},owner),201);
  const create=async()=>{const result=await c.data(await c.request('/api/v1/account/invitations','POST',{email:'invited@example.test',providerId:primary.provider.id,courseId:primary.courseId,locale:'es-ni'},owner),201);return {...result,token:new URLSearchParams(new URL(result.url).hash.slice(1)).get('invite')!};};
  const expired=await create();c.control.sqlite.prepare('UPDATE cms_invitation SET expires_at=0 WHERE id=?').run(expired.id);
  assert.equal((await c.request('/api/v1/account/register','POST',{name:'Invited',password,token:expired.token})).status,400);
  const revoked=await create();await c.data(await c.request('/api/v1/account/invitations/'+revoked.id+'/revoke','POST',{},owner),200);
  assert.equal((await c.request('/api/v1/account/register','POST',{name:'Invited',password,token:revoked.token})).status,400);
  const valid=await create();assert.equal((await c.request('/api/v1/account/accept','POST',{token:valid.token},owner)).status,403);
  await c.data(await c.request('/api/v1/account/register','POST',{name:'Invited',password,token:valid.token}),201);
  const invited=await c.signIn('invited@example.test');
  const results=await Promise.all([c.request('/api/v1/account/accept','POST',{token:valid.token},invited),c.request('/api/v1/account/accept','POST',{token:valid.token},invited)]);
  assert.ok(results.some(response=>response.status===200));assert.ok(results.every(response=>[200,400,409].includes(response.status)));
  assert.equal(c.control.sqlite.prepare('SELECT count(*) AS count FROM cms_grant').get()!.count,1);
  let limited=false;for(let i=0;i<22;i++){const response=await c.request('/api/v1/account/invitation','POST',{token:'f'.repeat(64)});if(response.status===429){limited=true;break;}assert.equal(response.status,400);}assert.equal(limited,true);
 }finally{c.close();}
});
