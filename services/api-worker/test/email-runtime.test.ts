import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

// Use the runtime/bundler shipped with our declared Wrangler dependency. Node's
// fetch mocks alone cannot detect unsupported workerd Request options.
const wranglerRequire=createRequire(import.meta.resolve('wrangler'));
const {build}=wranglerRequire('esbuild');
const {Miniflare,convertV4MiniflareOptions,Response:RuntimeResponse}=wranglerRequire('miniflare');

test('real Workers runtime submits both email adapters and refuses redirects without forwarding credentials',async()=>{
 const bundle=await build({stdin:{resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts',contents:`
  import {sendProviderEmail} from './email-delivery';
  import {sealEmailSecret,defaultSettings} from './email-storage';
  export default {async fetch(request){
   const params=new URL(request.url).searchParams,provider=params.get('provider'),region=params.get('region');
   const env={AI_CREDENTIAL_MASTER_KEY:'44'.repeat(32),AI_CREDENTIAL_KEY_ID:'runtime-test'};
   const secret=await sealEmailSecret(env,'credential:'+provider,'fake-email-runtime-test-key');
   const settings={...defaultSettings,provider,mailgun_region:region,from_email:'auth@sandbox.example',mailgun_domain:'sandbox.example',cloudflare_account_id:'a'.repeat(32),[provider==='mailgun'?'mailgun_secret':'cloudflare_secret']:secret};
   return Response.json(await sendProviderEmail(env,settings,{to:'owner@example.test',purpose:'test',subject:'Runtime Test',text:'Disposable test only',url:'',expiresAt:Date.now()+60000}));
  }};
 `},bundle:true,format:'esm',platform:'browser',write:false,logLevel:'silent'});
 let active:{provider:string;region:string;status:number},calls=0;
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-20',compatibilityFlags:['nodejs_compat'],outboundService:async(request:any)=>{
  calls++;
  assert.equal(request.method,'POST');
  if(active.provider==='mailgun'){
   assert.equal(request.url,'https://'+(active.region==='eu'?'api.eu.mailgun.net':'api.mailgun.net')+'/v3/sandbox.example/messages');
   assert.equal(request.headers.get('authorization'),'Basic '+btoa('api:fake-email-runtime-test-key'));
   const form=await request.formData();assert.equal(form.get('to'),'owner@example.test');assert.equal(form.get('o:tracking'),'no');
  }else{
   assert.equal(request.url,'https://api.cloudflare.com/client/v4/accounts/'+'a'.repeat(32)+'/email/sending/send');
   assert.equal(request.headers.get('authorization'),'Bearer fake-email-runtime-test-key');
   assert.equal((await request.json()).to,'owner@example.test');
  }
  if(active.status!==200)return new RuntimeResponse(null,{status:active.status,headers:{Location:'https://must-never-receive-credentials.example/redirect'}});
  return RuntimeResponse.json(active.provider==='mailgun'?{id:'runtime-test@example.test'}:{success:true,result:{queued:['owner@example.test']}});
 }}));
 try{
  for(const [provider,region] of [['mailgun','us'],['mailgun','eu'],['cloudflare','us']])for(const status of [200,302,307]){
   active={provider,region,status};const before=calls;
   const result=await (await runtime.dispatchFetch('http://localhost/?'+new URLSearchParams({provider,region}))).json();
   assert.equal(calls,before+1,'Exactly one fixed-host submission; redirects must never be followed');
   assert.deepEqual(result,status===200?{status:'accepted',code:'accepted',http:200,...(provider==='mailgun'?{reference:'runtime-test@example.test'}:{})}:{status:'rejected',code:'provider_redirect',http:status});
  }
 }finally{await runtime.dispose();}
});
