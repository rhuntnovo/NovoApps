import test from 'node:test';
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
 const env={CONTENT_DB:content.d1,CONTROL_DB:control.d1,LOCAL_AUTHORING:'true',AUTH_REQUIRED:'true',ACCOUNT_EMAIL_MODE:'preview',CMS_ORIGIN:'http://127.0.0.1:5174',PLATFORM_ORIGIN:'http://127.0.0.1:5176',AUTH_ORIGIN:'http://127.0.0.1:8787',CMS_MEDIA_SECRET:'test-bridge-secret-only-0000000000000000',BETTER_AUTH_SECRET:'test-secret-only-not-a-real-secret-0000000000000'};
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

test('verification previews are owner-only, token-free in lists, expiring and explicitly confirmed without signing in',async t=>{
 const c=await context();try{
  const owner=await c.setup();assert.equal((await c.data(await c.request('/api/v1/account/session','GET',undefined,owner),200)).user.emailVerified,false);
  await c.data(await c.request('/api/v1/account/email-previews'),401);
  const list=await previews(c,owner);assert.equal(list.length,1);assert.equal('url' in list[0],false);assert.equal('text' in list[0],false);
  const mail=await message(c,owner,'verification'),token=linkToken(mail,'verify');assert.ok(token);assert.equal(new URL(mail.url).search,'');assert.match(mail.text,/no email was sent/);
  assert.equal(c.control.sqlite.prepare('SELECT email_verified FROM auth_user').get()!.email_verified,0);
  const invalid=await c.data(await c.request('/api/v1/account/verify-email','POST',{token:'invalid-verification-token'}),400);assert.equal(JSON.stringify(invalid).includes(token),false);
  const verified=await c.request('/api/v1/account/verify-email','POST',{token});await c.data(verified,200);assert.equal(verified.headers.get('set-cookie'),null);
  assert.equal((await c.data(await c.request('/api/v1/account/session','GET',undefined,owner),200)).user.emailVerified,true);
  await c.data(await c.request('/api/v1/account/verify-email','POST',{token}),200); // Same-address verification is idempotent, never a login token.
  t.mock.timers.enable({apis:['Date'],now:Date.now()+3601000});
  await c.data(await c.request('/api/v1/account/verify-email','POST',{token}),400);assert.equal((await previews(c,owner)).length,0);
 }finally{t.mock.timers.reset();c.close();}
});

test('new invitation access requires verification; reviewers cannot read the development mailbox or gain extra roles',async()=>{
 const c=await context();try{
  const owner=await c.setup(),created=await invite(c,owner);
  assert.equal(created.delivery.mode,'preview');assert.equal((await message(c,owner,'invitation','reviewer@example.test')).url,created.url);
  await c.data(await c.request('/api/v1/account/register','POST',{name:'Reviewer',password,token:created.token}),201);const reviewer=await c.signIn('reviewer@example.test');
  await c.data(await c.request('/api/v1/account/accept','POST',{token:created.token},reviewer),403);assert.equal(c.control.sqlite.prepare('SELECT count(*) AS n FROM cms_grant').get()!.n,0);
  const verification=await message(c,owner,'verification','reviewer@example.test');
  for(const [path,method] of [['/email-previews','GET'],['/email-previews/'+verification.id+'/open','POST'],['/email-previews/clear','POST']])await c.data(await c.request('/api/v1/account'+path,method,method==='POST'?{}:undefined,reviewer),403);
  await c.data(await c.request('/api/v1/account/verify-email','POST',{token:linkToken(verification,'verify')}),200);
  await c.data(await c.request('/api/v1/account/accept','POST',{token:created.token},reviewer),200);
  const session=await c.data(await c.request('/api/v1/account/session','GET',undefined,reviewer),200);assert.equal(session.owner,false);assert.equal(session.grants.length,1);assert.equal(session.grants[0].locale,'es-ni');assert.equal(session.grants[0].role,'reviewer');
  await c.data(await c.request('/api/v1/account/invitations/'+created.id+'/resend','POST',{},owner),409);
 }finally{c.close();}
});

test('reset requests do not enumerate accounts, tokens are hashed, and a successful reset revokes sessions and other reset links',async()=>{
 const c=await context();try{
  const owner=await c.setup(),second=await c.signIn('owner@example.test');
  const known=await c.data(await c.request('/api/v1/account/forgot-password','POST',{email:'owner@example.test',redirectTo:'https://evil.test'}),200),mail=await message(c,owner,'password-reset'),token=linkToken(mail,'reset');
  const missing=await c.data(await c.request('/api/v1/account/forgot-password','POST',{email:'unknown@example.test'}),200);assert.deepEqual(missing,known);assert.equal((await previews(c,owner)).some(row=>row.to==='unknown@example.test'),false);
  assert.equal(new URL(mail.url).origin,c.env.PLATFORM_ORIGIN);assert.equal(new URL(mail.url).search,'');
  const verification=c.control.sqlite.prepare('SELECT * FROM auth_verification').get()!;assert.equal(JSON.stringify(verification).includes(token),false);assert.ok(Number(verification.expires_at)-Date.now()<=1800000);
  await c.data(await c.request('/api/v1/account/forgot-password','POST',{email:'owner@example.test'}),200);assert.equal(c.control.sqlite.prepare('SELECT count(*) AS n FROM auth_verification').get()!.n,2);
  const next='New-test-password-only-456!';await c.data(await c.request('/api/v1/account/reset-password','POST',{token,newPassword:next}),200);
  for(const cookie of [owner,second])await c.data(await c.request('/api/v1/account/session','GET',undefined,cookie),401);
  await c.data(await c.request('/api/auth/sign-in/email','POST',{email:'owner@example.test',password}),401);
  await c.data(await c.request('/api/auth/sign-in/email','POST',{email:'owner@example.test',password:next}),200);
  await c.data(await c.request('/api/v1/account/reset-password','POST',{token,newPassword:next}),400);assert.equal(c.control.sqlite.prepare('SELECT count(*) AS n FROM auth_verification').get()!.n,0);
  assert.equal(c.control.sqlite.prepare('SELECT email_verified FROM auth_user').get()!.email_verified,0);assert.equal(c.control.sqlite.prepare('SELECT count(*) AS n FROM platform_admin').get()!.n,1);
  const audit=JSON.stringify(c.control.sqlite.prepare('SELECT * FROM platform_audit').all());assert.equal(audit.includes(token),false);assert.equal(audit.includes(next),false);assert.equal(audit.includes(password),false);assert.match(audit,/account.password.reset/);
 }finally{c.close();}
});

test('expired resets do not change passwords and rejected passwords leave a live link usable',async()=>{
 const c=await context();try{
  const owner=await c.setup();await c.data(await c.request('/api/v1/account/forgot-password','POST',{email:'owner@example.test'}),200);let token=linkToken(await message(c,owner,'password-reset'),'reset');
  c.control.sqlite.exec('UPDATE auth_verification SET expires_at=0');
  await c.data(await c.request('/api/v1/account/reset-password','POST',{token,newPassword:'Another-test-password-123!'}),400);await c.signIn('owner@example.test');
  await c.data(await c.request('/api/v1/account/forgot-password','POST',{email:'owner@example.test'}),200);token=linkToken(await message(c,owner,'password-reset'),'reset');
  await c.data(await c.request('/api/v1/account/reset-password','POST',{token,newPassword:'short'}),400);
  await c.data(await c.request('/api/v1/account/reset-password','POST',{token,newPassword:'Another-test-password-123!'}),200);
 }finally{c.close();}
});

test('concurrent reset submissions consume a link once and never create a session',async()=>{
 const c=await context();try{
  const owner=await c.setup();await c.data(await c.request('/api/v1/account/forgot-password','POST',{email:'owner@example.test'}),200);const token=linkToken(await message(c,owner,'password-reset'),'reset');
  const results=await Promise.all([c.request('/api/v1/account/reset-password','POST',{token,newPassword:'Concurrent-test-password-123!'}),c.request('/api/v1/account/reset-password','POST',{token,newPassword:'Concurrent-test-password-123!'})]);
  assert.deepEqual(results.map(response=>response.status).sort(),[200,400]);assert.ok(results.every(response=>response.headers.get('set-cookie')===null));
  await c.data(await c.request('/api/v1/account/session','GET',undefined,owner),401);
 }finally{c.close();}
});

test('resending rotates the invitation secret without adding access or reviving revoked invitations',async()=>{
 const c=await context();try{
  const owner=await c.setup(),created=await invite(c,owner);await c.data(await c.request('/api/v1/account/invitations/'+created.id+'/resend','POST',{},owner),200);
  const token=linkToken(await message(c,owner,'invitation','reviewer@example.test'),'invite');assert.notEqual(token,created.token);
  await c.data(await c.request('/api/v1/account/invitation','POST',{token:created.token}),400);await c.data(await c.request('/api/v1/account/invitation','POST',{token}),200);
  assert.equal(c.control.sqlite.prepare('SELECT count(*) AS n FROM cms_grant').get()!.n,0);
  await c.data(await c.request('/api/v1/account/invitations/'+created.id+'/revoke','POST',{},owner),200);
  await c.data(await c.request('/api/v1/account/invitations/'+created.id+'/resend','POST',{},owner),409);await c.data(await c.request('/api/v1/account/invitation','POST',{token}),400);
  const listed=JSON.stringify(await c.data(await c.request('/api/v1/account/invitations','GET',undefined,owner),200));assert.equal(listed.includes(token),false);
  await c.data(await c.request('/api/v1/account/email-previews/clear','POST',{},owner),200);assert.equal((await previews(c,owner)).length,0);
 }finally{c.close();}
});

test('email endpoints retain origin, local-only and native-route boundaries, and throttling gives uniform responses',async()=>{
 const c=await context();try{
  const owner=await c.setup();
  for(const path of ['/api/auth/request-password-reset','/api/auth/reset-password','/api/auth/send-verification-email','/api/auth/verify-email'])await c.data(await c.request(path,'POST',{}),404);
  await c.data(await c.request('/api/v1/account/forgot-password','POST',{email:'owner@example.test'},'',{Origin:'https://evil.test'}),403);
  for(const env of [{...c.env,ACCOUNT_EMAIL_MODE:'external'},{...c.env,PLATFORM_ORIGIN:'https://example.test'},{...c.env,LOCAL_AUTHORING:'false'}])assert.ok([403,503].includes((await app.fetch(new Request(c.env.AUTH_ORIGIN+'/api/v1/account/status'),env)).status));
  await c.data(await c.request('/api/v1/account/email-previews/clear','POST',{},owner),200);
  for(let i=0;i<20;i++)await c.data(await c.request('/api/v1/account/forgot-password','POST',{email:'unknown@example.test'}),200);
  await c.data(await c.request('/api/v1/account/forgot-password','POST',{email:'owner@example.test'}),429);assert.equal((await previews(c,owner)).length,0);
 }finally{c.close();}
});
