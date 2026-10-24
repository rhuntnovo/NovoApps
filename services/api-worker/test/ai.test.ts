import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import sharp from 'sharp';
import {app} from '../src/index';
import {contentRepository} from '../src/repository';
import {encryptCredential,decryptCredential,reportedUsage} from '../src/ai';
import {activityCSV,activityTotals} from '../src/ai-routes';
const source=JSON.parse(await readFile(new URL('../../../newvines-learning/public/courses/nvi-fgmm-m01.en-global.json',import.meta.url),'utf8'));
const password='Test-only-long-password-5678',apiKey='unit-test-provider-api-key-not-a-real-key';
function binding(){const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');const prepare=(query:string,values:any[]=[]):any=>({bind:(...next:any[])=>prepare(query,next),async first(){return sqlite.prepare(query).get(...values)||null;},async all(){return {success:true,results:sqlite.prepare(query).all(...values),meta:{}};},async raw(){const statement=sqlite.prepare(query);statement.setReturnArrays(true);return statement.all(...values);},async run(){const result=sqlite.prepare(query).run(...values);return {success:true,results:[],meta:{changes:Number(result.changes)}};}});const d1:any={prepare,async batch(statements:any[]){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};return {sqlite,d1};}
class Bucket{objects=new Map<string,any>();async put(key:string,data:any,options:any){const value={size:data.length,etag:'test-'+this.objects.size,customMetadata:options.customMetadata,httpMetadata:options.httpMetadata};this.objects.set(key,{...value,data});return value;}}
async function context(){
 const content=binding(),control=binding();for(const [db,name] of [[content,'content'],[control,'control']] as const){const folder=new URL('../../../database/'+name+'/migrations/',import.meta.url);for(const file of (await readdir(folder)).filter(file=>file.endsWith('.sql')).sort())db.sqlite.exec(await readFile(new URL(file,folder),'utf8'));}
 const env:any={CONTENT_DB:content.d1,CONTROL_DB:control.d1,LOCAL_AUTHORING:'true',AUTH_REQUIRED:'true',CMS_ORIGIN:'http://127.0.0.1:5174',PLATFORM_ORIGIN:'http://127.0.0.1:5176',AUTH_ORIGIN:'http://127.0.0.1:8787',CMS_MEDIA_SECRET:'unit-test-bridge-secret-not-a-real-one',BETTER_AUTH_SECRET:'unit-test-auth-secret-not-a-real-one-000',AI_CREDENTIAL_MASTER_KEY:'11'.repeat(32),AI_CREDENTIAL_KEY_ID:'test-v1',CMS_STORAGE:'r2',DRAFT_MEDIA:new Bucket()};
 const request=(path:string,method='GET',body?:any,cookie='')=>app.fetch(new Request(env.AUTH_ORIGIN+path,{method,headers:{Origin:env.PLATFORM_ORIGIN,...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)}),env);
 const data=async(response:Response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json() as Promise<any>;};
 const signIn=async(email:string)=>{const response=await request('/api/auth/sign-in/email','POST',{email,password});await data(response);return response.headers.getSetCookie().map(cookie=>cookie.split(';')[0]).join('; ');};
 await data(await request('/api/v1/account/setup','POST',{name:'AI Test Admin',email:'admin@example.test',password}),201);const admin=await signIn('admin@example.test');
 const repo=contentRepository(env.CONTENT_DB),{moduleId}=await repo.importCourse(source),primary=await repo.getModule(moduleId),{moduleId:editionId}=await repo.createEdition(moduleId,{language:'es',region:'NI'}),edition=await repo.getModule(editionId);
 const providerId=primary.provider.id,base='/api/v1/cms/providers/'+providerId;
 const settings=(overrides:any={})=>({revision:0,apiKey,model:'gpt-5-mini',projectId:'proj_unit_test',features:{translate:true,narration:true,images:true},dailyLimit:100,...overrides});
 async function reviewer(){const invite=await data(await request('/api/v1/account/invitations','POST',{email:'reviewer@example.test',providerId,courseId:primary.courseId,locale:'es-ni'},admin),201),token=new URL(invite.url).hash.split('=')[1];await data(await request('/api/v1/account/register','POST',{name:'AI Test Reviewer',password,token}),201);const cookie=await signIn('reviewer@example.test');await data(await request('/api/v1/account/accept','POST',{token},cookie));const grant=control.sqlite.prepare('SELECT id FROM cms_grant').get()!.id as string;return {cookie,grant,invite};}
 return {env,content,control,request,data,admin,repo,primary,edition,providerId,base,settings,reviewer,close(){content.sqlite.close();control.sqlite.close();}};
}
const translated=(init:any)=>{const body=JSON.parse(init.body),keys=Object.keys(body.text.format.schema.properties);return Response.json({id:'resp_unit_test',model:'gpt-5-mini-2025-test',status:'completed',usage:{input_tokens:101,output_tokens:53,total_tokens:154,input_tokens_details:{cached_tokens:21},output_tokens_details:{reasoning_tokens:7},unexpected_secret:'must-not-be-stored'},output:[{content:[{type:'output_text',text:JSON.stringify(Object.fromEntries(keys.map(key=>[key,'Translated '+key])))}]}]},{headers:{'x-request-id':'req_unit_test','openai-organization':'org_unit_test'}});};

test('provider credentials are authenticated ciphertext, write-only, revisioned and isolated, with no environment fallback',async()=>{
 const c=await context();try{
  c.env.OPENAI_API_KEY='must-not-fall-back-for-another-provider';
  const saved=await c.data(await c.request(c.base+'/ai-settings','PUT',c.settings(),c.admin));assert.equal(saved.configured,true);assert.equal(saved.revision,1);assert.equal(JSON.stringify(saved).includes(apiKey),false);
  const stored=c.control.sqlite.prepare('SELECT * FROM cms_ai_settings').get() as any;assert.notEqual(stored.encrypted_key,apiKey);assert.equal(await decryptCredential(c.env,stored),apiKey);
  assert.equal(c.control.sqlite.prepare('SELECT count(*) AS n FROM platform_audit WHERE action=?').get('ai.credential.replace')!.n,1);
  const another=await encryptCredential(c.env,stored.provider_id,stored.credential_id,apiKey);assert.notEqual(another.nonce,stored.key_nonce);
  await assert.rejects(decryptCredential(c.env,{...stored,provider_id:'a-different-provider'}),/cannot be decrypted/);
  await assert.rejects(decryptCredential({...c.env,AI_CREDENTIAL_MASTER_KEY:'22'.repeat(32)},stored),/cannot be decrypted/);
  assert.equal(await decryptCredential({...c.env,AI_CREDENTIAL_KEY_ID:'test-v2',AI_CREDENTIAL_MASTER_KEY:'22'.repeat(32),AI_CREDENTIAL_PREVIOUS_KEY_ID:'test-v1',AI_CREDENTIAL_PREVIOUS_MASTER_KEY:'11'.repeat(32)},stored),apiKey);
  const provider=await c.repo.createProvider({name:'Other Provider',slug:'other-provider'});const other=await c.data(await c.request('/api/v1/cms/providers/'+provider.id+'/ai-settings','GET',undefined,c.admin));assert.equal(other.configured,false);
  await c.data(await c.request(c.base+'/ai-settings','PUT',c.settings(),c.admin),409);
  await c.data(await c.request(c.base+'/ai-settings','PUT',c.settings({revision:1,apiKey:undefined,removeKey:true}),c.admin));const removed=c.control.sqlite.prepare('SELECT * FROM cms_ai_settings').get() as any;assert.equal(removed.encrypted_key,null);assert.equal(removed.credential_id,null);
  c.env.AI_CREDENTIAL_MASTER_KEY='';await c.data(await c.request(c.base+'/ai-settings','PUT',c.settings({revision:2}),c.admin),503);
 }finally{c.close();}
});

test('selected reviewer translation records exact upstream usage and IDs, saves drafts, and cannot manage credentials/history',async()=>{
 const c=await context();let mocked:ReturnType<typeof mock.method>|undefined;try{
  await c.data(await c.request(c.base+'/ai-settings','PUT',c.settings(),c.admin));const who=await c.reviewer(),page=c.edition.pages[4],url='/api/v1/cms/pages/'+page.id+'/translate';
  for(const path of ['/ai-settings','/ai-grants','/ai-activity'])await c.data(await c.request(c.base+path,'GET',undefined,who.cookie),403);
  await c.data(await c.request(url,'POST',{expectedRevision:1},who.cookie),403);
  await c.data(await c.request(c.base+'/ai-grants/'+who.grant,'PUT',{translate:true,narration:false,images:false},c.admin));
  let calls=0;mocked=mock.method(globalThis,'fetch',async(input:any,init:any)=>{calls++;assert.equal(String(input),'https://api.openai.com/v1/responses');const headers=new Headers(init.headers);assert.equal(headers.get('Authorization'),'Bearer '+apiKey);assert.equal(headers.get('OpenAI-Project'),'proj_unit_test');assert.match(headers.get('X-Client-Request-Id')!,/^[a-f0-9-]{36}$/);return translated(init);});
  await c.data(await c.request(url,'POST',{expectedRevision:1},who.cookie));assert.equal(calls,1);
  const rows=(await c.data(await c.request(c.base+'/ai-activity','GET',undefined,c.admin))).rows;assert.equal(rows.length,1);assert.equal(rows[0].request_id,'req_unit_test');assert.equal(rows[0].response_id,'resp_unit_test');assert.equal(rows[0].outcome,'succeeded');assert.equal(rows[0].application_status,'saved');assert.equal(rows[0].usage.input_tokens,101);assert.equal(rows[0].usage.input_tokens_details.cached_tokens,21);assert.equal(rows[0].usage.unexpected_secret,undefined);assert.equal(rows[0].page_id,page.id);assert.equal(rows[0].course_id,c.primary.courseId);assert.equal(rows[0].actor_name,'AI Test Reviewer');assert.equal(JSON.stringify(rows).includes(apiKey),false);assert.equal(JSON.stringify(rows).includes(source.module.pages[4].blocks[0].text),false);
  const updated=await c.repo.getModule(c.edition.id);assert.equal(updated.pages[4].translationStatus,'draft');assert.deepEqual((await c.repo.getModule(c.primary.id)).course.module.pages,source.module.pages);
  await c.data(await c.request('/api/v1/cms/pages/'+c.primary.pages[4].id+'/translate','POST',{expectedRevision:1},who.cookie),403);assert.equal(calls,1);
  await c.data(await c.request('/api/v1/account/invitations/'+who.invite.id+'/revoke','POST',{},c.admin));assert.equal(c.control.sqlite.prepare('SELECT count(*) AS n FROM cms_ai_grant').get()!.n,0);
  await c.data(await c.request(url,'POST',{expectedRevision:2,overwrite:true},who.cookie),403);assert.equal(calls,1);
 }finally{mocked?.mock.restore();c.close();}
});

test('rejected requests and network uncertainty remain bill-reconciliation records; limits and feature switches prevent further spending',async()=>{
 const c=await context();let mocked:ReturnType<typeof mock.method>|undefined;try{
  await c.data(await c.request(c.base+'/ai-settings','PUT',c.settings({dailyLimit:2}),c.admin));const url='/api/v1/cms/pages/'+c.edition.pages[4].id+'/translate';let calls=0;
  mocked=mock.method(globalThis,'fetch',async()=>{calls++;if(calls===1)return new Response('DO NOT STORE upstream body or secrets',{status:429,headers:{'x-request-id':'req_rejected'}});throw Error('Simulated lost response');});
  await c.data(await c.request(url,'POST',{expectedRevision:1},c.admin),502);const uncertain=await c.data(await c.request(url,'POST',{expectedRevision:1},c.admin),502);assert.match(uncertain.error,/may still be billed/);
  await c.data(await c.request(url,'POST',{expectedRevision:1},c.admin),429);assert.equal(calls,2);
  const ledger=(await c.data(await c.request(c.base+'/ai-activity','GET',undefined,c.admin))).rows;assert.deepEqual(new Set(ledger.map((row:any)=>row.outcome)),new Set(['unknown','rejected']));assert.ok(ledger.every((row:any)=>row.usage===null));assert.equal(JSON.stringify(ledger).includes('DO NOT STORE'),false);
  const current=await c.data(await c.request(c.base+'/ai-settings','GET',undefined,c.admin));await c.data(await c.request(c.base+'/ai-settings','PUT',c.settings({revision:current.revision,apiKey:undefined,features:{translate:false,narration:true,images:true},dailyLimit:100}),c.admin));await c.data(await c.request(url,'POST',{expectedRevision:1},c.admin),403);assert.equal(calls,2);
 }finally{mocked?.mock.restore();c.close();}
});

test('an in-flight permission revocation preserves the upstream charge record but prevents applying the generated translation',async()=>{
 const c=await context();let mocked:ReturnType<typeof mock.method>|undefined;try{
  await c.data(await c.request(c.base+'/ai-settings','PUT',c.settings(),c.admin));const who=await c.reviewer();await c.data(await c.request(c.base+'/ai-grants/'+who.grant,'PUT',{translate:true,narration:false,images:false},c.admin));
  mocked=mock.method(globalThis,'fetch',async(_input:any,init:any)=>{c.control.sqlite.prepare('UPDATE cms_ai_grant SET translate_enabled=0').run();return translated(init);});
  await c.data(await c.request('/api/v1/cms/pages/'+c.edition.pages[4].id+'/translate','POST',{expectedRevision:1},who.cookie),403);
  const row=c.control.sqlite.prepare('SELECT outcome,application_status,usage_json FROM cms_ai_activity').get()!;assert.equal(row.outcome,'succeeded');assert.equal(row.application_status,'not_applied');assert.ok(row.usage_json);assert.equal((await c.repo.getModule(c.edition.id)).pages[4].revision,1);
 }finally{mocked?.mock.restore();c.close();}
});

test('reconciliation is versioned, exportable and formula-safe without rewriting original usage',async()=>{
 const c=await context();let mocked:ReturnType<typeof mock.method>|undefined;try{
  await c.data(await c.request(c.base+'/ai-settings','PUT',c.settings(),c.admin));mocked=mock.method(globalThis,'fetch',async(_input:any,init:any)=>translated(init));await c.data(await c.request('/api/v1/cms/pages/'+c.edition.pages[4].id+'/translate','POST',{expectedRevision:1},c.admin));
  const row=c.control.sqlite.prepare('SELECT * FROM cms_ai_activity').get() as any,url=c.base+'/ai-activity/'+row.id+'/reconciliation';
  await c.data(await c.request(url,'PUT',{version:0,reconciled:true,note:'Invoice October · matched project totals'},c.admin));await c.data(await c.request(url,'PUT',{version:0,reconciled:false,note:'Stale edit'},c.admin),409);
  const stored=c.control.sqlite.prepare('SELECT * FROM cms_ai_activity').get()!;assert.equal(stored.usage_json,row.usage_json);assert.equal(stored.reconciliation_version,1);assert.ok(stored.reconciled_at);assert.equal(c.control.sqlite.prepare('SELECT count(*) AS n FROM cms_ai_reconciliation_event').get()!.n,1);
  const report=await c.data(await c.request(c.base+'/ai-activity?reconciled=yes','GET',undefined,c.admin));assert.equal(report.totals.requests,1);assert.equal(report.totals.inputTokens,101);assert.equal(report.totals.outputTokens,53);assert.equal(report.totals.reconciled,1);assert.equal(activityTotals([{usage_json:'{}',usage:{input_tokens:10}}]).missingUsage,1);assert.equal(activityTotals([{usage_json:'{}',usage:{input_tokens:0,output_tokens:0}}]).missingUsage,0);
  const exported=await c.request(c.base+'/ai-activity?format=csv','GET',undefined,c.admin);assert.equal(exported.status,200);const csv=await exported.text();assert.match(csv,/req_unit_test/);assert.match(csv,/Invoice October/);assert.equal(csv.includes(apiKey),false);
  assert.match(activityCSV([{...row,actor_name:'=HYPERLINK("bad")',usage:{},reconciliation_note:'\t=1+1'}]),/"'=HYPERLINK/);
  assert.equal(reportedUsage({input_tokens:-1,total_tokens:'secret',input_tokens_details:{cached_tokens:0,secret:apiKey}})?.input_tokens_details!==undefined,true);
 }finally{mocked?.mock.restore();c.close();}
});

test('reviewers with image permission can attach only their generated page assets and cannot reuse a receipt for another page',async()=>{
 const c=await context();let mocked:ReturnType<typeof mock.method>|undefined;try{
  await c.data(await c.request(c.base+'/ai-settings','PUT',c.settings(),c.admin));const who=await c.reviewer();await c.data(await c.request(c.base+'/ai-grants/'+who.grant,'PUT',{translate:false,narration:false,images:true},c.admin));
  const image=await sharp({create:{width:120,height:80,channels:3,background:'#31543a'}}).webp().toBuffer();mocked=mock.method(globalThis,'fetch',async()=>Response.json({data:[{b64_json:image.toString('base64')}],usage:{input_tokens:8,output_tokens:64,total_tokens:72}},{headers:{'x-request-id':'req_image'}}));
  const page=c.edition.pages[4],document=structuredClone(c.edition.course.module.pages[4]),block=document.blocks[0],prefix='/api/v1/cms/modules/'+c.edition.id+'/pages/'+page.id+'/media/',input={expectedRevision:1,blockId:block.id,description:'Exact description'};
  const generated=await c.data(await c.request(prefix+'image-generate','POST',input,who.cookie),201);assert.ok(generated.generationId);
  const payload={...input,prepared:true,data:image.toString('base64'),generationId:generated.generationId,source:'ai'};
  const uploaded=await c.data(await c.request(prefix+'image-upload','POST',payload,who.cookie),201);assert.ok(uploaded.image.src.includes(c.providerId));
  const again=await c.data(await c.request(prefix+'image-upload','POST',payload,who.cookie),201);assert.equal(again.image.src,uploaded.image.src);assert.equal(c.control.sqlite.prepare('SELECT count(*) AS n FROM cms_ai_artifact').get()!.n,1);
  const save=(value:any,revision=1)=>c.request('/api/v1/cms/pages/'+page.id+'/draft','PUT',{expectedRevision:revision,page:value,allowWordingChanges:true,translationStatus:'draft',sourceRevision:1,reviewNote:''},who.cookie);
  const arbitrary=structuredClone(document);arbitrary.blocks[0].image={...uploaded.image,src:'/assets/cms/someone-else.webp'};await c.data(await save(arbitrary),403);
  document.blocks[0].image=uploaded.image;await c.data(await save(document));assert.equal(c.control.sqlite.prepare('SELECT application_status FROM cms_ai_activity').get()!.application_status,'saved');
  const other=c.edition.pages[5];await c.data(await c.request('/api/v1/cms/modules/'+c.edition.id+'/pages/'+other.id+'/media/image-upload','POST',{...payload,blockId:c.edition.course.module.pages[5].blocks[0].id},who.cookie),403);
  await c.data(await c.request(prefix+'recording','POST',{...input,data:image.toString('base64')},who.cookie),403);
 }finally{mocked?.mock.restore();c.close();}
});

test('Marin Opus generation records unavailable usage honestly and requires the exact script for reviewer attachment',async()=>{
 const c=await context();let mocked:ReturnType<typeof mock.method>|undefined;try{
  await c.data(await c.request(c.base+'/ai-settings','PUT',c.settings(),c.admin));const who=await c.reviewer();await c.data(await c.request(c.base+'/ai-grants/'+who.grant,'PUT',{translate:false,narration:true,images:false},c.admin));
  const index=c.edition.course.module.pages.findIndex((page:any)=>page.guided?.segments?.length),document=structuredClone(c.edition.course.module.pages[index]),page=c.edition.pages[index],segment=document.guided!.segments![0];
  const path=source.module.pages.flatMap((page:any)=>page.guided?.segments||[]).find((item:any)=>item.audio)?.audio;
  const opus=await readFile(new URL('../../../newvines-learning/public'+path,import.meta.url));
  mocked=mock.method(globalThis,'fetch',async(input:any,init:any)=>{assert.equal(String(input),'https://api.openai.com/v1/audio/speech');const payload=JSON.parse(init.body);assert.equal(payload.voice,'marin');assert.equal(payload.response_format,'opus');assert.equal(payload.input,segment.text);return new Response(opus,{headers:{'Content-Type':'audio/ogg','x-request-id':'req_marin'}});});
  const generated=await c.data(await c.request('/api/v1/cms/modules/'+c.edition.id+'/pages/'+page.id+'/media/speech','POST',{expectedRevision:1,blockId:segment.block_id,script:segment.text},who.cookie),201);
  const row=c.control.sqlite.prepare('SELECT * FROM cms_ai_activity').get()!;assert.equal(row.usage_json,null);assert.equal(row.voice,'marin');assert.equal(row.output_bytes,opus.length);assert.equal(row.application_status,'generated');assert.equal(row.request_id,'req_marin');
  const save=(value:any)=>c.request('/api/v1/cms/pages/'+page.id+'/draft','PUT',{expectedRevision:1,page:value,allowWordingChanges:true,translationStatus:'draft',sourceRevision:1,reviewNote:''},who.cookie);
  segment.audio=generated.audio;segment.audio_source='ai';document.guided!.narration_mode='marin_opus';
  const changed=structuredClone(document);changed.guided!.segments![0].text+=' Changed After Recording';await c.data(await save(changed),403);
  await c.data(await save(document));assert.equal(c.control.sqlite.prepare('SELECT application_status FROM cms_ai_activity').get()!.application_status,'saved');
 }finally{mocked?.mock.restore();c.close();}
});

test('activity must be durably reserved before any paid request, and concurrent request limits are atomic',async()=>{
 const c=await context();let mocked:ReturnType<typeof mock.method>|undefined;try{
  await c.data(await c.request(c.base+'/ai-settings','PUT',c.settings(),c.admin));let calls=0;
  mocked=mock.method(globalThis,'fetch',async(_input:any,init:any)=>{calls++;return translated(init);});
  const prepare=c.env.CONTROL_DB.prepare;c.env.CONTROL_DB.prepare=(sql:string)=>{if(sql.startsWith('INSERT INTO cms_ai_activity'))throw Error('Injected activity write failure');return prepare(sql);};
  await c.data(await c.request('/api/v1/cms/pages/'+c.edition.pages[4].id+'/translate','POST',{expectedRevision:1},c.admin),503);assert.equal(calls,0);
  c.env.CONTROL_DB.prepare=prepare;mocked.mock.restore();
  let ready!:()=>void,release!:()=>void;const started=new Promise<void>(resolve=>ready=resolve),gate=new Promise<void>(resolve=>release=resolve);
  mocked=mock.method(globalThis,'fetch',async(_input:any,init:any)=>{if(++calls===2)ready();await gate;return translated(init);});
  const request=(index:number)=>c.request('/api/v1/cms/pages/'+c.edition.pages[index].id+'/translate','POST',{expectedRevision:1},c.admin);
  const first=request(4),second=request(5);await started;
  try{await c.data(await request(6),429);assert.equal(calls,2);}finally{release();}
  await c.data(await first);await c.data(await second);assert.equal(c.control.sqlite.prepare('SELECT count(*) AS n FROM cms_ai_activity').get()!.n,2);
 }finally{mocked?.mock.restore();c.close();}
});

test('a failure to finalize a timeout retains its pending activity and a no-blind-retry warning',async()=>{
 const c=await context();let mocked:ReturnType<typeof mock.method>|undefined;try{
  await c.data(await c.request(c.base+'/ai-settings','PUT',c.settings(),c.admin));const prepare=c.env.CONTROL_DB.prepare;
  c.env.CONTROL_DB.prepare=(sql:string)=>{if(sql.startsWith("UPDATE cms_ai_activity SET outcome='unknown'"))throw Error('Injected finalization failure');return prepare(sql);};
  let calls=0;mocked=mock.method(globalThis,'fetch',async()=>{calls++;throw Error('Lost connection');});
  const result=await c.data(await c.request('/api/v1/cms/pages/'+c.edition.pages[4].id+'/translate','POST',{expectedRevision:1},c.admin),502);
  assert.match(result.error,/may still be billed/);assert.match(result.error,/Activity:/);assert.equal(calls,1);assert.equal(c.control.sqlite.prepare('SELECT outcome FROM cms_ai_activity').get()!.outcome,'pending');
 }finally{mocked?.mock.restore();c.close();}
});
