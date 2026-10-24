import {v7} from 'uuid';
import {HTTPException} from 'hono/http-exception';
import {principal,control,type AuthEnvironment,type Principal} from './auth';
import {contentRepository} from './repository';
import {aiConfiguration} from './translation';
import type {AuthoringModule} from '@novoapps/content-model';

export type Feature='translate'|'narration'|'images';
export type AISecrets={AI_CREDENTIAL_MASTER_KEY?:string;AI_CREDENTIAL_KEY_ID?:string;AI_CREDENTIAL_PREVIOUS_MASTER_KEY?:string;AI_CREDENTIAL_PREVIOUS_KEY_ID?:string};
export type AIEnv=AuthEnvironment&AISecrets&{OPENAI_API_KEY?:string;OPENAI_TRANSLATION_MODEL?:string};
type Settings={provider_id:string;encrypted_key:string|null;key_nonce:string|null;key_version:string|null;credential_id:string|null;project_id:string;translation_model:string;translate_enabled:number;narration_enabled:number;images_enabled:number;daily_limit:number;revision:number;updated_at:number};
export const features:Feature[]=['translate','narration','images'];
const fail=(status:400|403|409|429|502|503,message:string):never=>{throw new HTTPException(status,{message});};
const base64=(data:Uint8Array)=>btoa(String.fromCharCode(...data));
const unbase64=(data:string)=>Uint8Array.from(atob(data),x=>x.charCodeAt(0));
export const textHash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
export function safeLabel(value:string){if(/sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}/.test(value))fail(400,'Enter a project identifier or note, never an API key in this field.');return value;}
export function storageReady(env:AIEnv){return /^[a-fA-F0-9]{64}$/.test(env.AI_CREDENTIAL_MASTER_KEY||'');}
async function encryptionKey(env:AIEnv,version:string){
 const current=env.AI_CREDENTIAL_KEY_ID||'v1',value=version===current?env.AI_CREDENTIAL_MASTER_KEY:version===env.AI_CREDENTIAL_PREVIOUS_KEY_ID?env.AI_CREDENTIAL_PREVIOUS_MASTER_KEY:undefined;
 if(!value||!/^[a-fA-F0-9]{64}$/.test(value))fail(503,'The AI credential encryption key is not configured for this environment. Preserve the existing secret; do not replace it to recover saved credentials.');
 return crypto.subtle.importKey('raw',Uint8Array.from(value!.match(/../g)!,n=>parseInt(n,16)),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function encryptCredential(env:AIEnv,providerId:string,credentialId:string,value:string){
 const version=env.AI_CREDENTIAL_KEY_ID||'v1',nonce=crypto.getRandomValues(new Uint8Array(12));
 const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:new TextEncoder().encode(providerId+':'+credentialId+':'+version)},await encryptionKey(env,version),new TextEncoder().encode(value));
 return {encryptedKey:base64(new Uint8Array(bytes)),nonce:base64(nonce),version};
}
export async function decryptCredential(env:AIEnv,row:Settings){
 if(!row.encrypted_key||!row.key_nonce||!row.credential_id||!row.key_version)fail(503,'No provider API key is configured. Ask a Super Admin to open AI Settings.');
 const key=await encryptionKey(env,row.key_version!);
 try{return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(row.key_nonce!),additionalData:new TextEncoder().encode(row.provider_id+':'+row.credential_id+':'+row.key_version)},key,unbase64(row.encrypted_key!) as Uint8Array<ArrayBuffer>));}
 catch{fail(503,'The saved AI credential cannot be decrypted. Preserve the database and original encryption secret; contact the Super Admin.');}
}
export const readSettings=(env:AIEnv,providerId:string)=>control(env).prepare('SELECT * FROM cms_ai_settings WHERE provider_id=?').bind(providerId).first<Settings>();
export async function settingsStatus(env:AIEnv,providerId:string){const row=await readSettings(env,providerId);return {configured:!!row?.encrypted_key,storageReady:storageReady(env),model:row?.translation_model||'gpt-5-mini',source:'encrypted-provider',revision:row?.revision||0,projectId:row?.project_id||'',features:{translate:row?.translate_enabled!==0,narration:row?.narration_enabled!==0,images:row?.images_enabled!==0},dailyLimit:row?.daily_limit||100,updatedAt:row?.updated_at||null};}
export async function primaryCourse(env:AIEnv,module:AuthoringModule){return module.sourceModuleId?(await contentRepository(env.CONTENT_DB).getModule(module.sourceModuleId)).courseId:module.courseId;}
export async function capabilities(env:AIEnv,request:Request,module:AuthoringModule){
 if(env.AUTH_REQUIRED!=='true')return {configured:!!aiConfiguration(env).apiKey,translate:true,narration:true,images:true};
 const who=await principal(env,request.headers);if(!who)fail(403,'Sign in to use AI generation.');
 const settings=await readSettings(env,module.provider.id),course=await primaryCourse(env,module),locale=module.course.language+'-'+module.course.country.toLowerCase();
 const grants=(await control(env).prepare('SELECT a.* FROM cms_ai_grant a JOIN cms_grant g ON g.id=a.grant_id WHERE g.user_id=? AND g.provider_id=? AND g.course_id=? AND g.locale=?').bind(who!.user.id,module.provider.id,course,locale).all<Record<string,number>>()).results;
 return {configured:!!settings?.encrypted_key,...Object.fromEntries(features.map(feature=>[feature,!!settings?.encrypted_key&&settings[feature+'_enabled' as keyof Settings]===1&&(who!.owner||!!module.sourceModuleId&&grants.some(grant=>grant[feature+'_enabled']===1))]))} as {configured:boolean;translate:boolean;narration:boolean;images:boolean};
}
export async function requireFeature(env:AIEnv,request:Request,module:AuthoringModule,feature:Feature){const allowed=await capabilities(env,request,module);if(!allowed[feature])fail(403,'AI '+feature+' is disabled or is not granted for this provider, course and language.');}
export async function translationModel(env:AIEnv,module:AuthoringModule){return env.AUTH_REQUIRED==='true'?(await readSettings(env,module.provider.id))?.translation_model||'gpt-5-mini':aiConfiguration(env).model;}
type Detail={pageId?:string;blockId?:string};
// Retain only known numeric usage fields. Do not persist arbitrary response JSON.
export function reportedUsage(value:unknown):Record<string,unknown>|null{
 if(!value||typeof value!=='object')return null;const source=value as Record<string,unknown>,result:Record<string,unknown>={};
 for(const field of ['input_tokens','output_tokens','total_tokens','prompt_tokens','completion_tokens'])if(typeof source[field]==='number'&&Number.isSafeInteger(source[field])&&(source[field] as number)>=0)result[field]=source[field];
 for(const field of ['input_tokens_details','output_tokens_details','prompt_tokens_details','completion_tokens_details'])if(source[field]&&typeof source[field]==='object'){
  const details:Record<string,number>={};for(const name of ['cached_tokens','reasoning_tokens','text_tokens','image_tokens','audio_tokens']){const value=(source[field] as Record<string,unknown>)[name];if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)details[name]=value;}if(Object.keys(details).length)result[field]=details;
 }
 return Object.keys(result).length?result:null;
}
const identifier=(value:unknown)=>typeof value==='string'&&/^[a-zA-Z0-9_.:-]{1,180}$/.test(value)&&!value.startsWith('sk-')?value:null;
export async function aiOperation(env:AIEnv,request:Request,module:AuthoringModule,feature:Feature,detail:Detail={}){
 const authenticated=env.AUTH_REQUIRED==='true';
 const who=authenticated?await principal(env,request.headers):null;
 if(authenticated)await requireFeature(env,request,module,feature);
 const row=authenticated?await readSettings(env,module.provider.id):null;
 const key=authenticated?await decryptCredential(env,row!):aiConfiguration(env).apiKey;
 if(!key)fail(503,'Open AI Settings, paste your OpenAI key, and click Save Settings first.');
 let id:string|undefined,called=false;
 const tracked:typeof fetch=async(input,init)=>{
  if(called)fail(409,'An AI operation cannot submit a second paid request. Start a separate explicit generation.');called=true;
  if(authenticated)await requireFeature(env,request,module,feature);
  const url=String(input);if(!['https://api.openai.com/v1/responses','https://api.openai.com/v1/audio/speech','https://api.openai.com/v1/images/generations'].includes(url))fail(400,'Unsupported AI endpoint.');
  const payload=JSON.parse(String(init?.body||'{}')),now=Date.now();id=v7();
  const model=identifier(payload.model);if(!model)fail(400,'Invalid AI model.');
  const headers=new Headers(init?.headers);headers.set('Authorization','Bearer '+key);headers.set('X-Client-Request-Id',id);if(row?.project_id)headers.set('OpenAI-Project',row.project_id);
  if(authenticated){
   // One atomic insert reserves a request before spending. All outcomes count.
   const day=Math.floor(now/86400000)*86400000;
   let reserved:unknown;try{reserved=await control(env).prepare(`INSERT INTO cms_ai_activity(id,provider_id,credential_id,project_id,actor_id,actor_name,course_id,module_id,page_id,block_id,locale,feature,endpoint,requested_model,voice,quality,image_size,input_characters,requested_images,started_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM cms_ai_activity WHERE provider_id=? AND started_at>=?)<? AND (SELECT COUNT(*) FROM cms_ai_activity WHERE provider_id=? AND outcome='pending' AND started_at>?)<2 RETURNING id`)
    .bind(id,module.provider.id,row!.credential_id,row!.project_id,who!.user.id,who!.user.name,await primaryCourse(env,module),module.id,detail.pageId||null,detail.blockId||null,module.course.language+'-'+module.course.country.toLowerCase(),feature,url.split('/v1/')[1],model,identifier(payload.voice),identifier(payload.quality),identifier(payload.size),typeof payload.input==='string'?Array.from(payload.input).length:typeof payload.prompt==='string'?Array.from(payload.prompt).length:0,typeof payload.n==='number'?payload.n:null,now,module.provider.id,day,row!.daily_limit,module.provider.id,now-10*60000).first();}
   catch{fail(503,'AI Activity could not be recorded. No OpenAI request was sent. Retry after storage is available.');}
   if(!reserved)fail(429,'Provider AI request limit reached, or two requests are already running. Wait or ask the Super Admin to review the limit.');
  }
  let response:Response;
  try{response=await fetch(input,{...init,headers});}
  catch{
   if(authenticated)try{await control(env).prepare("UPDATE cms_ai_activity SET outcome='unknown',error_code='network_or_timeout',finished_at=? WHERE id=?").bind(Date.now(),id).run();}catch{} // The durable pending row still warns of uncertain spending.
   fail(502,'The OpenAI request timed out or lost its connection. It may still be billed. Check AI Activity before retrying. Activity: '+id);
  }
  if(authenticated){
   let data:any,unreadable=false;
   if(response!.ok&&feature!=='narration')try{data=await response!.clone().json();}catch{unreadable=true;}
   const usage=reportedUsage(data?.usage),images=feature==='images'&&Array.isArray(data?.data)?data.data.length:null;
   try{await control(env).prepare('UPDATE cms_ai_activity SET outcome=?,http_status=?,request_id=?,response_id=?,organization_id=?,model=?,usage_json=?,output_images=?,error_code=?,finished_at=? WHERE id=?')
    .bind(response!.ok?'succeeded':'rejected',response!.status,identifier(response!.headers.get('x-request-id')),identifier(data?.id),identifier(response!.headers.get('openai-organization')),identifier(data?.model)||model,usage?JSON.stringify(usage):null,images,unreadable?'unreadable_response':response!.ok?null:'upstream_rejected',Date.now(),id).run();}
   catch{fail(503,'OpenAI responded, but the activity record could not be finalized. Do not retry blindly. Activity: '+id);}
  }
  return response!;
 };
 return {config:{apiKey:key!,model:await translationModel(env,module)},request:tracked,get id(){return authenticated?id:undefined;},
  async finish(status:'generated'|'saved'|'not_applied',bytes?:number){if(authenticated&&id)await control(env).prepare('UPDATE cms_ai_activity SET application_status=?,output_bytes=COALESCE(?,output_bytes) WHERE id=?').bind(status,bytes??null,id).run();},
  async recheck(){if(authenticated)await requireFeature(env,request,module,feature);}
 };
}
export async function rememberArtifact(env:AIEnv,activityId:string|undefined,actor:string|undefined,moduleId:string,pageId:string,blockId:string,metadata:unknown){if(env.AUTH_REQUIRED==='true'&&activityId&&actor)await control(env).prepare('INSERT INTO cms_ai_artifact(id,activity_id,actor_id,module_id,page_id,block_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(v7(),activityId,actor,moduleId,pageId,blockId,JSON.stringify(metadata),Date.now()).run();}
