import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {app} from '../src/index';
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
 const env={AI_CREDENTIAL_MASTER_KEY:'44'.repeat(32),AI_CREDENTIAL_KEY_ID:'test-email-v1',CONTENT_DB:content.d1,CONTROL_DB:control.d1,LOCAL_AUTHORING:'true',AUTH_REQUIRED:'true',ACCOUNT_EMAIL_MODE:'preview',CMS_ORIGIN:'http://127.0.0.1:5174',PLATFORM_ORIGIN:'http://127.0.0.1:5176',AUTH_ORIGIN:'http://127.0.0.1:8787',CMS_MEDIA_SECRET:'test-bridge-secret-only-0000000000000000',BETTER_AUTH_SECRET:'test-secret-only-not-a-real-secret-0000000000000'};
 async function request(path:string,method='GET',body?:any,cookie='',extra:Record<string,string>={}){return app.fetch(new Request(env.AUTH_ORIGIN+path,{method,headers:{Origin:env.PLATFORM_ORIGIN,...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)}),env);}
 const data=async(response:Response,status:number)=>{assert.equal(response.status,status,await response.clone().text());return response.json() as Promise<any>;};
 const signIn=async(email:string)=>{const response=await request('/api/auth/sign-in/email','POST',{email,password});assert.equal(response.status,200,await response.clone().text());assert.deepEqual(await response.clone().json(),{ok:true});assert.equal(response.headers.get('Access-Control-Allow-Origin'),env.PLATFORM_ORIGIN);assert.equal(response.headers.get('Access-Control-Allow-Credentials'),'true');const set=response.headers.getSetCookie();assert.ok(set.some(cookie=>cookie.includes('HttpOnly')&&cookie.includes('SameSite=Lax')));return set.map(cookie=>cookie.split(';')[0]).join('; ');};
 const setup=async()=>{await data(await request('/api/v1/account/setup','POST',{name:'Test Owner',email:'owner@example.test',password}),201);return signIn('owner@example.test');};
 const close=()=>{content.sqlite.close();control.sqlite.close();};
 return {env,content,control,request,data,signIn,setup,close};
}
async function previews(c:any,owner:string){return (await c.data(await c.request('/api/v1/account/email-previews','GET',undefined,owner),200)).messages as any[];}
async function message(c:any,owner:string,purpose:string,to='owner@example.test'){
 const item=(await previews(c,owner)).find(row=>row.purpose===purpose&&row.to===to);assert.ok(item,'Expected an email preview');
 return c.data(await c.request('/api/v1/account/email-previews/'+item.id+'/open','POST',{},owner),200);
}
const linkToken=(mail:any,kind:string)=>new URLSearchParams(new URL(mail.url).hash.slice(1)).get(kind)!;
async function invite(c:any,owner:string){
 const imported=await c.data(await c.request('/api/v1/cms/import','POST',source,owner),201),primary=await c.data(await c.request('/api/v1/cms/modules/'+imported.moduleId,'GET',undefined,owner),200);
 await c.data(await c.request('/api/v1/cms/modules/'+primary.id+'/editions','POST',{language:'es',region:'NI'},owner),201);
 const created=await c.data(await c.request('/api/v1/account/invitations','POST',{email:'reviewer@example.test',providerId:primary.provider.id,courseId:primary.courseId,locale:'es-ni'},owner),201);
 return {...created,token:linkToken(created,'invite')};
}

const mailgunKey='fake-mailgun-domain-sending-key-for-tests';
const cloudflareToken='fake-cloudflare-email-sending-token-for-tests';
const base='/api/v1/email-admin';
const config=(overrides:any={})=>({revision:0,provider:'mailgun',enabled:true,fromEmail:'auth@sandbox.example',fromName:'NovoApps',replyTo:'support@example.test',mailgunDomain:'sandbox.example',mailgunRegion:'us',cloudflareAccountId:'',dailyLimit:100,mailgunKey,...overrides});
async function settings(c:any,owner:string,overrides:any={}){return c.data(await c.request(base+'/settings','POST',config(overrides),owner),200);}
const stored=(c:any)=>c.control.sqlite.prepare('SELECT * FROM platform_email_outbox ORDER BY created_at DESC,id DESC LIMIT 1').get() as any;

test('platform email settings are Super Admin-only, encrypted, write-only and revisioned; disabled providers remain previews',async()=>{
 const c=await context();try{
  const owner=await c.setup(),initial=await c.data(await c.request(base+'/settings','GET',undefined,owner),200);assert.equal(initial.activeMode,'preview');assert.equal(initial.providers.length,3);
  const invitation=await invite(c,owner);await c.data(await c.request('/api/v1/account/register','POST',{name:'Reviewer',password,token:invitation.token}),201);const reviewer=await c.signIn('reviewer@example.test');
  for(const [path,method] of [['/settings','GET'],['/settings','POST'],['/deliveries','GET'],['/process','POST'],['/test','POST']]){await c.data(await c.request(base+path,method,method==='POST'?config():undefined,reviewer),403);await c.data(await c.request(base+path,method,method==='POST'?config():undefined),401);}
  const saved=await settings(c,owner);assert.equal(saved.mailgunConfigured,true);assert.equal(saved.activeMode,'mailgun');assert.equal(JSON.stringify(saved).includes(mailgunKey),false);
  const row=c.control.sqlite.prepare('SELECT * FROM platform_email_settings').get()!;assert.equal(String(row.mailgun_secret).includes(mailgunKey),false);
  await c.data(await c.request(base+'/settings','POST',config({mailgunDomain:'https://evil.test/path',revision:1}),owner),400);assert.deepEqual(c.control.sqlite.prepare('SELECT * FROM platform_email_settings').get(),row);
  await c.data(await c.request(base+'/settings','POST',config(),owner),409);
  const cf=await settings(c,owner,{revision:1,provider:'cloudflare',enabled:false,mailgunKey:undefined,cloudflareAccountId:'a'.repeat(32),cloudflareToken});assert.equal(cf.activeMode,'preview');assert.equal(cf.mailgunConfigured,true);assert.equal(cf.cloudflareConfigured,true);assert.equal(JSON.stringify(cf).includes(cloudflareToken),false);
  await c.data(await c.request(base+'/settings','POST',config({revision:2,removeMailgunKey:true,mailgunKey:undefined}),owner),400);
  assert.equal(c.control.sqlite.prepare('SELECT revision FROM platform_email_settings').get()!.revision,2);
 }finally{c.close();}
});

test('Mailgun US and EU delivery reserves ciphertext first, disables tracking and never exposes bearer links in history',async()=>{
 for(const region of ['us','eu']){const c=await context();let stub:ReturnType<typeof mock.method>|undefined;try{
  const owner=await c.setup();await settings(c,owner,{mailgunRegion:region});let calls=0;
  stub=mock.method(globalThis,'fetch',async(url:any,init:any)=>{calls++;assert.equal(String(url),'https://'+(region==='eu'?'api.eu.mailgun.net':'api.mailgun.net')+'/v3/sandbox.example/messages');assert.equal(init.headers.Authorization,'Basic '+btoa('api:'+mailgunKey));assert.equal(init.redirect,'error');assert.equal(init.body.get('to'),'owner@example.test');assert.equal(init.body.get('o:tracking-clicks'),'no');assert.equal(init.body.get('o:tracking-opens'),'no');assert.match(init.body.get('text'),/#verify=/);assert.doesNotMatch(init.body.get('text'),/LOCAL EMAIL PREVIEW/);return Response.json({id:'<mail-test@sandbox.example>',message:'Queued'});});
  await c.data(await c.request('/api/v1/account/send-verification','POST',{email:'owner@example.test'}),200);assert.equal(calls,0);const queued=stored(c);assert.equal(queued.status,'queued');assert.equal(queued.payload.includes('#verify='),false);assert.equal(queued.payload.includes('owner@example.test'),false);
  await c.data(await c.request(base+'/process','POST',{},owner),200);assert.equal(calls,1);const sent=stored(c);assert.equal(sent.status,'accepted');assert.equal(sent.payload,null);assert.equal(sent.attempts,1);
  const history=await c.data(await c.request(base+'/deliveries','GET',undefined,owner),200);assert.equal(history.rows[0].provider_reference,'<mail-test@sandbox.example>');assert.equal('payload' in history.rows[0],false);assert.equal(JSON.stringify(history).includes('#verify='),false);assert.equal(JSON.stringify(history).includes(mailgunKey),false);
  await c.data(await c.request(base+'/process','POST',{},owner),200);assert.equal(calls,1);
 }finally{stub?.mock.restore();c.close();}}
});

test('Cloudflare Email Sending uses its official account REST endpoint and reports accepted recipient status',async()=>{
 const c=await context();let stub:ReturnType<typeof mock.method>|undefined;try{
  const owner=await c.setup();await settings(c,owner,{provider:'cloudflare',mailgunKey:undefined,cloudflareAccountId:'a'.repeat(32),cloudflareToken});
  stub=mock.method(globalThis,'fetch',async(url:any,init:any)=>{assert.equal(String(url),'https://api.cloudflare.com/client/v4/accounts/'+'a'.repeat(32)+'/email/sending/send');assert.equal(init.headers.Authorization,'Bearer '+cloudflareToken);assert.equal(init.redirect,'error');const body=JSON.parse(init.body);assert.deepEqual(body.from,{email:'auth@sandbox.example',name:'NovoApps'});assert.equal(body.to,'owner@example.test');assert.equal(body.replyTo,'support@example.test');return Response.json({success:true,result:{delivered:[],queued:['owner@example.test'],permanent_bounces:[]}});});
  await c.data(await c.request(base+'/test','POST',{},owner),202);await c.data(await c.request(base+'/process','POST',{},owner),200);assert.equal(stored(c).status,'accepted');assert.equal(stored(c).payload,null);
 }finally{stub?.mock.restore();c.close();}
});

test('only explicit provider rate-limit rejections retry; lost responses and server errors remain uncertain without failover',async()=>{
 for(const scenario of ['rate','network','server','credentials']){const c=await context();let stub:ReturnType<typeof mock.method>|undefined;try{
  const owner=await c.setup();await settings(c,owner);let calls=0;
  stub=mock.method(globalThis,'fetch',async(url:any)=>{calls++;assert.match(String(url),/^https:\/\/api\.mailgun\.net\//);if(scenario==='rate'&&calls===1)return new Response('Never store this raw response '+mailgunKey,{status:429});if(scenario==='network')throw Error('Never store this error '+mailgunKey);if(scenario==='server')return new Response('Never store '+mailgunKey,{status:503});if(scenario==='credentials')return new Response('Never store '+mailgunKey,{status:403});return Response.json({id:'mail-accepted@example.test'});});
  await c.data(await c.request(base+'/test','POST',{},owner),202);await c.data(await c.request(base+'/process','POST',{},owner),200);
  if(scenario==='rate'){assert.equal(stored(c).status,'retry');assert.ok(stored(c).payload);c.control.sqlite.exec('UPDATE platform_email_outbox SET next_attempt_at=0');await c.data(await c.request(base+'/process','POST',{},owner),200);assert.equal(stored(c).status,'accepted');assert.equal(calls,2);}
  else{assert.equal(stored(c).status,scenario==='credentials'?'rejected':'unknown');assert.equal(stored(c).payload,null);await c.data(await c.request(base+'/process','POST',{},owner),200);assert.equal(calls,1);}
  assert.equal(JSON.stringify(stored(c)).includes(mailgunKey),false);
 }finally{stub?.mock.restore();c.close();}}
});

test('revoked invitations, expired reset tokens and changed settings cancel queued messages before provider I/O',async()=>{
 for(const reason of ['invitation','reset','configuration','expiry']){const c=await context();let stub:ReturnType<typeof mock.method>|undefined;try{
  const owner=await c.setup();await settings(c,owner);let calls=0;stub=mock.method(globalThis,'fetch',async()=>{calls++;throw Error('Must not send stale mail');});
  if(reason==='invitation'){const created=await invite(c,owner);await c.data(await c.request('/api/v1/account/invitations/'+created.id+'/revoke','POST',{},owner),200);}
  else if(reason==='reset'){await c.data(await c.request('/api/v1/account/forgot-password','POST',{email:'owner@example.test'}),200);c.control.sqlite.exec('UPDATE auth_verification SET expires_at=0');}
  else{await c.data(await c.request(base+'/test','POST',{},owner),202);if(reason==='configuration')await settings(c,owner,{revision:1,enabled:false,mailgunKey:undefined});else c.control.sqlite.exec('UPDATE platform_email_outbox SET expires_at=0');}
  await c.data(await c.request(base+'/process','POST',{},owner),200);assert.equal(calls,0);assert.equal(stored(c).status,reason==='expiry'?'expired':'cancelled');assert.equal(stored(c).payload,null);
 }finally{stub?.mock.restore();c.close();}}
});

test('concurrent dispatch claims once, interrupted sends are not replayed, and atomic daily limits prevent extra queue reservations',async()=>{
 const c=await context();let stub:ReturnType<typeof mock.method>|undefined;try{
  const owner=await c.setup();await settings(c,owner,{dailyLimit:1});let calls=0,ready!:()=>void,release!:()=>void;const started=new Promise<void>(resolve=>ready=resolve),gate=new Promise<void>(resolve=>release=resolve);
  stub=mock.method(globalThis,'fetch',async()=>{calls++;ready();await gate;return Response.json({id:'single-send@example.test'});});
  await c.data(await c.request(base+'/test','POST',{},owner),202);
  const first=c.request(base+'/process','POST',{},owner);await started;const second=c.request(base+'/process','POST',{},owner);release();await c.data(await first,200);await c.data(await second,200);assert.equal(calls,1);
  const known=await c.data(await c.request('/api/v1/account/forgot-password','POST',{email:'owner@example.test'}),200),missing=await c.data(await c.request('/api/v1/account/forgot-password','POST',{email:'missing@example.test'}),200);assert.deepEqual(known,missing);assert.equal(c.control.sqlite.prepare('SELECT count(*) AS n FROM platform_email_outbox').get()!.n,1);
  c.control.sqlite.exec("UPDATE platform_email_outbox SET status='sending',lease_until=0");await c.data(await c.request(base+'/process','POST',{},owner),200);assert.equal(stored(c).status,'unknown');assert.equal(calls,1);
 }finally{stub?.mock.restore();c.close();}
});

test('schema readiness fallback preserves old sign-in before migration and an unavailable master key never exposes stored credentials',async()=>{
 const c=await context();try{
  const owner=await c.setup();await settings(c,owner);const before=c.control.sqlite.prepare('SELECT * FROM platform_email_settings').get();c.env.AI_CREDENTIAL_MASTER_KEY='';
  await c.data(await c.request(base+'/settings','POST',config({revision:1,mailgunKey:'replacement-fake-test-key'}),owner),503);assert.deepEqual(c.control.sqlite.prepare('SELECT * FROM platform_email_settings').get(),before);
  c.control.sqlite.exec('DROP TABLE platform_email_settings');const status=await c.data(await c.request('/api/v1/account/status'),200);assert.equal(status.emailMode,'preview');await c.signIn('owner@example.test');const ui=await c.data(await c.request(base+'/settings','GET',undefined,owner),200);assert.equal(ui.schemaReady,false);
 }finally{c.close();}
});
