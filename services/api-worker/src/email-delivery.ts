import {v7} from 'uuid';
import {HTTPException} from 'hono/http-exception';
import {emailDB,readEmailSettings,sealEmailSecret,openEmailSecret,externalReady,type EmailEnvironment,type EmailSettings} from './email-storage';
export type EmailMessage={to:string;purpose:'invitation'|'verification'|'password-reset'|'test';subject:string;text:string;url:string;expiresAt:number};
type Outbox={id:string;provider:string;settings_revision:number;purpose:string;recipient_email:string;created_at:number;expires_at:number;payload:string|null;status:string;attempts:number;next_attempt_at:number};
type Result={status:'accepted'|'retry'|'rejected'|'unknown';code:string;http?:number;reference?:string};
const hash=async(text:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
const hex=(bytes:Uint8Array)=>Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
const reference=(value:unknown,secret:string)=>typeof value==='string'&&/^[A-Za-z0-9@._<>:+-]{1,200}$/.test(value)&&!value.includes(secret)?value:undefined;
export async function queueAccountEmail(env:EmailEnvironment,message:EmailMessage,settings:EmailSettings){
 if(!settings.enabled||!externalReady(settings))throw new HTTPException(503,{message:'External email delivery is not ready.'});
 const id=v7(),now=Date.now(),payload=await sealEmailSecret(env,'outbox:'+id,JSON.stringify(message)),midnight=new Date(now);midnight.setUTCHours(0,0,0,0);
 const saved=await emailDB(env).prepare(`INSERT INTO platform_email_outbox(id,provider,settings_revision,purpose,recipient_email,created_at,expires_at,payload,next_attempt_at) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM platform_email_outbox WHERE created_at>=?)<? AND NOT EXISTS(SELECT 1 FROM platform_email_outbox WHERE recipient_email=? AND purpose=? AND created_at>? AND status NOT IN ('cancelled','expired'))`).bind(id,settings.provider,settings.revision,message.purpose,message.to,now,message.expiresAt,payload,now,midnight.getTime(),settings.daily_limit,message.to,message.purpose,now-30000).run();
 if(saved.meta.changes!==1)throw new HTTPException(429,{message:'Email request limit reached. Wait before requesting another link, or ask the Super Admin to check Email Delivery.'});
 return {mode:settings.provider,queued:true,id};
}
async function tokenStillValid(env:EmailEnvironment,message:EmailMessage){
 if(message.purpose==='test')return true;
 const params=new URLSearchParams(new URL(message.url).hash.slice(1)),db=emailDB(env),now=Date.now();
 if(message.purpose==='invitation'){const token=params.get('invite');if(!token)return false;return !!await db.prepare('SELECT id FROM cms_invitation WHERE token_hash=? AND email=? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>?').bind(hex(await hash(token)),message.to,now).first();}
 if(message.purpose==='verification')return !!await db.prepare('SELECT id FROM auth_user WHERE email=? AND email_verified=0').bind(message.to).first();
 const token=params.get('reset');if(!token)return false;const identifier=btoa(String.fromCharCode(...await hash('reset-password:'+token))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 return !!await db.prepare('SELECT id FROM auth_verification WHERE identifier=? AND expires_at>?').bind(identifier,now).first();
}
// Fixed endpoints only; provider adapters never follow redirects or forward a key
// to a client-selected host. Workers supports manual, not error, redirect mode.
// Reject every redirect below; never follow its Location with credentials.
// Add new providers here with their own validated config.
export async function sendProviderEmail(env:EmailEnvironment,settings:EmailSettings,message:EmailMessage):Promise<Result>{
 let response:Response,secret:string;
 try{
  if(settings.provider==='mailgun'){
   secret=await openEmailSecret(env,'credential:mailgun',settings.mailgun_secret!);
   const form=new FormData();form.set('from',settings.from_name+' <'+settings.from_email+'>');form.set('to',message.to);form.set('subject',message.subject);form.set('text',message.text);if(settings.reply_to)form.set('h:Reply-To',settings.reply_to);
   for(const field of ['o:tracking','o:tracking-opens','o:tracking-clicks'])form.set(field,'no');
   response=await fetch((settings.mailgun_region==='eu'?'https://api.eu.mailgun.net':'https://api.mailgun.net')+'/v3/'+encodeURIComponent(settings.mailgun_domain)+'/messages',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{Authorization:'Basic '+btoa('api:'+secret)},body:form});
  }else if(settings.provider==='cloudflare'){
   secret=await openEmailSecret(env,'credential:cloudflare',settings.cloudflare_secret!);
   response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+settings.cloudflare_account_id+'/email/sending/send',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({to:message.to,from:{email:settings.from_email,name:settings.from_name},subject:message.subject,text:message.text,...(settings.reply_to?{replyTo:settings.reply_to}:{})})});
  }else return {status:'rejected',code:'unsupported_provider'};
 }catch(error){if(error instanceof HTTPException)return {status:'rejected',code:'credential_unavailable'};return {status:'unknown',code:'network_or_timeout'};}
 if(response.status>=300&&response.status<400)return {status:'rejected',code:'provider_redirect',http:response.status};
 if(response.status===429)return {status:'retry',code:'provider_rate_limit',http:429};
 if(response.status>=500)return {status:'unknown',code:'provider_server_error',http:response.status};
 if(!response.ok)return {status:'rejected',code:response.status===401||response.status===403?'provider_credentials_or_domain':'provider_rejected',http:response.status};
 try{
  const data=await response.json() as any;
  if(settings.provider==='mailgun')return data.id?{status:'accepted',code:'accepted',http:response.status,reference:reference(data.id,secret)}:{status:'unknown',code:'unexpected_provider_response',http:response.status};
  if(data.success===true){const result=data.result||{};if(result.permanent_bounces?.includes(message.to))return {status:'rejected',code:'permanent_bounce',http:response.status};if(result.delivered?.includes(message.to)||result.queued?.includes(message.to))return {status:'accepted',code:'accepted',http:response.status,reference:reference(response.headers.get('cf-ray'),secret)};}
  return {status:'unknown',code:'unexpected_provider_response',http:response.status};
 }catch{return {status:'unknown',code:'unreadable_provider_response',http:response.status};}
}
const working=new WeakSet<D1Database>();
export async function processEmailOutbox(env:EmailEnvironment){
 if(env.ACCOUNT_EMAIL_MODE!=='preview'||env.AUTH_REQUIRED!=='true'||!env.CONTROL_DB||working.has(env.CONTROL_DB))return;
 working.add(env.CONTROL_DB);
 try{
  const {settings,schemaReady}=await readEmailSettings(env);if(!schemaReady)return;
  const db=emailDB(env),now=Date.now();
  await db.prepare("UPDATE platform_email_outbox SET status='unknown',payload=NULL,finished_at=?,error_code='interrupted_send' WHERE status='sending' AND lease_until<?").bind(now,now).run();
  await db.prepare("UPDATE platform_email_outbox SET status='expired',payload=NULL,finished_at=?,error_code='link_expired' WHERE status IN ('queued','retry') AND expires_at<=?").bind(now,now).run();
  await db.prepare("UPDATE platform_email_outbox SET status='cancelled',payload=NULL,finished_at=?,error_code='configuration_changed' WHERE status IN ('queued','retry') AND (settings_revision<>? OR ?=0)").bind(now,settings.revision,settings.enabled).run();
  if(!settings.enabled||!externalReady(settings))return;
  for(let count=0;count<3;count++){
   const row=await db.prepare("UPDATE platform_email_outbox SET status='sending',attempts=attempts+1,lease_until=? WHERE id=(SELECT id FROM platform_email_outbox WHERE status IN ('queued','retry') AND next_attempt_at<=? AND expires_at>? AND settings_revision=? ORDER BY created_at,id LIMIT 1) AND status IN ('queued','retry') RETURNING *").bind(Date.now()+60000,Date.now(),Date.now(),settings.revision).first<Outbox>();
   if(!row)break;
   let result:Result|undefined;
   try{
    const message=JSON.parse(await openEmailSecret(env,'outbox:'+row.id,row.payload!)) as EmailMessage;
    const latest=(await readEmailSettings(env)).settings;
    if(!latest.enabled||latest.revision!==row.settings_revision||!await tokenStillValid(env,message)){
     await db.prepare("UPDATE platform_email_outbox SET status='cancelled',payload=NULL,finished_at=?,error_code='link_or_configuration_changed' WHERE id=? AND status='sending'").bind(Date.now(),row.id).run();continue;
    }
    result=await sendProviderEmail(env,settings,message);
   }catch{result={status:'rejected',code:'stored_message_unavailable'};}
   const retry=result.status==='retry'&&row.attempts<3&&row.expires_at>Date.now()+60000*row.attempts;
   await db.prepare("UPDATE platform_email_outbox SET status=?,payload=CASE WHEN ?=1 THEN payload ELSE NULL END,next_attempt_at=?,finished_at=?,provider_reference=?,http_status=?,error_code=?,lease_until=NULL WHERE id=? AND status='sending'").bind(retry?'retry':result.status==='retry'?'rejected':result.status,+retry,Date.now()+60000*row.attempts,retry?null:Date.now(),result.reference||null,result.http||null,result.code,row.id).run();
  }
 }finally{working.delete(env.CONTROL_DB);}
}
