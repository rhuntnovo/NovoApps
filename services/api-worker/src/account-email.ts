import {v7} from 'uuid';
import {HTTPException} from 'hono/http-exception';
import {readEmailSettings,type EmailEnvironment} from './email-storage';
import {queueAccountEmail} from './email-delivery';

export type AccountEmailEnvironment=EmailEnvironment;
export async function activeEmailMode(env:AccountEmailEnvironment){if(accountEmailMode(env)==='disabled')return 'disabled';const {settings}=await readEmailSettings(env);return settings.enabled&&settings.provider!=='preview'?settings.provider:'preview';}
type Purpose='invitation'|'verification'|'password-reset'|'test';
type Message={id:string;to:string;subject:string;text:string;url:string;purpose:Purpose;createdAt:number;expiresAt:number};
// A disposable development mail sink, never an unauthenticated mailbox or durable outbox.
// Its explicit owner-only read routes live in auth.ts. No messages/tokens are logged.
const inboxes=new WeakMap<D1Database,Map<string,Message>>();
const loopback=(value?:string)=>{try{return !!value&&['127.0.0.1','localhost'].includes(new URL(value).hostname);}catch{return false;}};
export function accountEmailMode(env:AccountEmailEnvironment):'preview'|'disabled'{
 if(!env.ACCOUNT_EMAIL_MODE||env.ACCOUNT_EMAIL_MODE==='disabled')return 'disabled';
 if(env.ACCOUNT_EMAIL_MODE!=='preview'||env.LOCAL_AUTHORING!=='true'||env.AUTH_REQUIRED!=='true'||!loopback(env.AUTH_ORIGIN)||!loopback(env.PLATFORM_ORIGIN)||!env.CONTROL_DB)
  throw new HTTPException(503,{message:'Local email previews require authenticated loopback authoring. External email delivery is not configured.'});
 return 'preview';
}
function inbox(env:AccountEmailEnvironment){
 if(accountEmailMode(env)!=='preview')throw new HTTPException(503,{message:'Account email previews are not enabled.'});
 let messages=inboxes.get(env.CONTROL_DB!);if(!messages){messages=new Map();inboxes.set(env.CONTROL_DB!,messages);}
 const now=Date.now();for(const [id,message] of messages)if(message.expiresAt<=now||message.createdAt<now-86400000)messages.delete(id);
 return messages;
}
export function accountLink(env:AccountEmailEnvironment,purpose:'invite'|'verify'|'reset',token:string){
 if(accountEmailMode(env)!=='preview')throw new HTTPException(503,{message:'Account email delivery is not configured.'});
 const url=new URL('/',env.PLATFORM_ORIGIN);url.hash=new URLSearchParams({[purpose]:token}).toString();return url.href;
}
export async function deliverAccountEmail(env:AccountEmailEnvironment,input:{to:string;purpose:Purpose;url:string;expiresAt:number;context?:string}){
 const mode=await activeEmailMode(env);if(mode==='disabled')throw new HTTPException(503,{message:'Account email workflows are not configured.'});
 const id=v7(),createdAt=Date.now();
 const subject={invitation:'Your NovoApps Course Review Invitation',verification:'Verify Your NovoApps Email Address','password-reset':'Reset Your NovoApps Password',test:'NovoApps Email Delivery Test'}[input.purpose];
 const instruction={invitation:'Open the invitation, sign in or create your invited account, verify your email, then accept review access.',verification:'Open this link and choose Verify Email. This does not sign you in or grant course access.','password-reset':'Open this link and choose a new password. Completing the reset signs out all existing sessions. If you did not request this, ignore this message.',test:'Your NovoApps email delivery settings accepted this test. No account or course access was changed.'}[input.purpose];
 const text=[mode==='preview'?'LOCAL EMAIL PREVIEW — no email was sent.':'',subject,input.context||'',instruction,input.url,'Link Expires: '+new Date(input.expiresAt).toISOString(),mode==='preview'?'This preview works only on this computer.':''].filter(Boolean).join('\n\n');
 if(mode!=='preview')return queueAccountEmail(env,{...input,subject,text},(await readEmailSettings(env)).settings);
 const messages=inbox(env);
 while(messages.size>=100)messages.delete(messages.keys().next().value!);
 messages.set(id,{id,to:input.to,subject,text,url:input.url,purpose:input.purpose,createdAt,expiresAt:input.expiresAt});
 return {mode:'preview' as const};
}
export function listEmailPreviews(env:AccountEmailEnvironment){return [...inbox(env).values()].reverse().map(({id,to,subject,purpose,createdAt,expiresAt})=>({id,to,subject,purpose,createdAt,expiresAt}));}
export function openEmailPreview(env:AccountEmailEnvironment,id:string){const message=inbox(env).get(id);if(!message)throw new HTTPException(404,{message:'Email preview expired or was cleared. Request a new link.'});return message;}
export function clearEmailPreviews(env:AccountEmailEnvironment){inbox(env).clear();}
