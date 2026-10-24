import type {StorageEnvironment} from './r2-storage';
import {accountEmailMode,accountLink,deliverAccountEmail,listEmailPreviews,openEmailPreview,clearEmailPreviews,type AccountEmailEnvironment} from './account-email';
import {betterAuth} from 'better-auth';
import {drizzleAdapter} from '@better-auth/drizzle-adapter';
import {drizzle} from 'drizzle-orm/d1';
import {v7} from 'uuid';
import {Hono} from 'hono';
import {HTTPException} from 'hono/http-exception';
import {z} from 'zod';
import * as schema from '../../../database/control/schema';
import {contentRepository} from './repository';

export type AuthEnvironment={AUTH_REQUIRED?:string;CONTROL_DB?:D1Database;BETTER_AUTH_SECRET?:string;
 AUTH_ORIGIN?:string;CMS_ORIGIN?:string;PLATFORM_ORIGIN?:string;PREVIEW_ORIGIN?:string;LOCAL_AUTHORING?:string;CONTENT_DB:D1Database;CMS_MEDIA_SECRET?:string;CMS_MEDIA_URL?:string;AI_CREDENTIAL_MASTER_KEY?:string;AI_CREDENTIAL_KEY_ID?:string;AI_CREDENTIAL_PREVIOUS_MASTER_KEY?:string;AI_CREDENTIAL_PREVIOUS_KEY_ID?:string}&StorageEnvironment&AccountEmailEnvironment;
export type Grant={id:string;provider_id:string;course_id:string;locale:string;role:'reviewer'};
export type Principal={user:{id:string;name:string;email:string;emailVerified:boolean};owner:boolean;grants:Grant[]};
export const control=(env:AuthEnvironment)=>{if(!env.CONTROL_DB)throw new HTTPException(503,{message:'Control database is not configured.'});return env.CONTROL_DB;};
export function identity(env:AuthEnvironment){
 if(!env.BETTER_AUTH_SECRET||env.BETTER_AUTH_SECRET.length<32||(env.CMS_STORAGE!=='r2'&&(!env.CMS_MEDIA_SECRET||env.CMS_MEDIA_SECRET.length<32))||!env.AUTH_ORIGIN||!env.PLATFORM_ORIGIN||!env.CMS_ORIGIN)
  throw new HTTPException(503,{message:'Authentication configuration is incomplete.'});
 const emailEnabled=accountEmailMode(env)==='preview';
 return betterAuth({appName:'NovoApps',baseURL:env.AUTH_ORIGIN,basePath:'/api/auth',secret:env.BETTER_AUTH_SECRET,
  database:drizzleAdapter(drizzle(control(env),{schema}),{provider:'sqlite',schema,transaction:false}),
  trustedOrigins:[env.PLATFORM_ORIGIN,env.CMS_ORIGIN],
  // Keep the proven local sign-in path for existing accounts. Hosted verification
  // enforcement is a separate deployment prerequisite; new invitation acceptance
  // below requires verification whenever email workflows are enabled.
  emailAndPassword:{enabled:true,minPasswordLength:12,maxPasswordLength:128,autoSignIn:false,
   ...(emailEnabled?{resetPasswordTokenExpiresIn:1800,revokeSessionsOnPasswordReset:true,
    sendResetPassword:async({user,token}:{user:{email:string};token:string})=>{deliverAccountEmail(env,{to:user.email,purpose:'password-reset',url:accountLink(env,'reset',token),expiresAt:Date.now()+1800000});},
    onPasswordReset:async({user}:{user:{id:string}})=>{await control(env).prepare('DELETE FROM auth_verification WHERE value=?').bind(user.id).run();await audit(env,user.id,'account.password.reset',user.id,200);}
   }:{})},
  ...(emailEnabled?{verification:{storeIdentifier:'hashed' as const},emailVerification:{sendOnSignUp:true,sendOnSignIn:false,expiresIn:3600,autoSignInAfterVerification:false,
   sendVerificationEmail:async({user,token}:{user:{email:string};token:string})=>{deliverAccountEmail(env,{to:user.email,purpose:'verification',url:accountLink(env,'verify',token),expiresAt:Date.now()+3600000});},
   afterEmailVerification:async(user:{id:string})=>{await audit(env,user.id,'account.email.verify',user.id,200);}
  }}:{}),
  session:{expiresIn:60*60*24*7,updateAge:60*60*24,cookieCache:{enabled:false}},
  advanced:{database:{generateId:()=>v7()},cookiePrefix:'novoapps',useSecureCookies:!env.AUTH_ORIGIN.startsWith('http://127.0.0.1:'),
   defaultCookieAttributes:{httpOnly:true,sameSite:'lax',path:'/'}},
  rateLimit:{enabled:true,window:60,max:20,storage:'memory',customRules:{'/sign-in/email':{window:60,max:20}}},logger:{disabled:true}
 });
}
export async function principal(env:AuthEnvironment,headers:Headers):Promise<Principal|null>{
 const auth=identity(env),result=await auth.api.getSession({headers,query:{disableCookieCache:true}});
 if(!result)return null;
 const db=control(env),owner=!!await db.prepare('SELECT user_id FROM platform_admin WHERE user_id=?').bind(result.user.id).first();
 const grants=(await db.prepare('SELECT id,provider_id,course_id,locale,role FROM cms_grant WHERE user_id=?').bind(result.user.id).all<Grant>()).results;
 return {user:{id:result.user.id,name:result.user.name,email:result.user.email,emailVerified:result.user.emailVerified},owner,grants};
}
export async function audit(env:AuthEnvironment,actor:string|null,action:string,target:string,status:number|null=null){
 const id=v7();await control(env).prepare('INSERT INTO platform_audit(id,actor_id,action,target,created_at,status) VALUES(?,?,?,?,?,?)').bind(id,actor,action,target,Date.now(),status).run();return id;
}
const email=z.string().trim().email().max(254).transform(value=>value.toLowerCase());
const credentials=z.object({name:z.string().trim().min(1).max(100),email,password:z.string().min(12).max(128)});
const tokenInput=z.object({token:z.string().regex(/^[a-f0-9]{64}$/)});
async function json(request:Request){const raw=await request.text();if(raw.length>8192)throw new HTTPException(413,{message:'Account request too large.'});try{return JSON.parse(raw);}catch{throw new HTTPException(400,{message:'Invalid JSON.'});}}
const tokenHash=async(token:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
type Invitation={id:string;email:string;provider_id:string;course_id:string;locale:string;expires_at:number};
async function invitation(env:AuthEnvironment,token:string){
 const row=await control(env).prepare('SELECT id,email,provider_id,course_id,locale,expires_at FROM cms_invitation WHERE token_hash=? AND revoked_at IS NULL AND consumed_at IS NULL AND expires_at>?').bind(await tokenHash(token),Date.now()).first<Invitation>();
 if(!row)throw new HTTPException(400,{message:'This invitation is invalid, expired or already used.'});return row;
}
async function owner(env:AuthEnvironment,headers:Headers){const who=await principal(env,headers);if(!who)throw new HTTPException(401,{message:'Sign in to continue.'});if(!who.owner)throw new HTTPException(403,{message:'Only the owner can manage invitations.'});return who;}
// A bounded local limiter also covers the guarded custom signup endpoints. Hosted
// rollout requires distributed rate limiting; this is not a production guarantee.
const limiters=new WeakMap<D1Database,Map<string,{at:number;count:number}>>();
export const accountRoutes=new Hono<{Bindings:AuthEnvironment}>();
accountRoutes.use('*',async(c,next)=>{
 if(c.env.AUTH_REQUIRED!=='true')return c.json({error:'Authentication pilot is not enabled.'},404);
 // Fail closed even for setup/status if the binding/secret has not been supplied.
 identity(c.env);
 if(c.req.method==='POST'){
  const key=c.req.path.replace('/api/v1/account','').replace(/\/invitations\/[^/]+\/(revoke|resend)$/, '/invitations/$1').replace(/\/email-previews\/[^/]+\/open$/, '/email-previews/open');
  if(!['/setup','/invitation','/register','/accept','/invitations','/invitations/revoke','/invitations/resend','/send-verification','/verify-email','/forgot-password','/reset-password','/email-previews/open','/email-previews/clear'].includes(key))return c.json({error:'Unknown account operation.'},404);
  let attempts=limiters.get(control(c.env));if(!attempts){attempts=new Map();limiters.set(control(c.env),attempts);}
  const now=Date.now(),previous=attempts.get(key),entry=previous&&now-previous.at<60000?previous:{at:now,count:0};
  if(++entry.count>20)return c.json({error:'Too many attempts. Try again in a minute.'},429);attempts.set(key,entry);
 }
 await next();
});
accountRoutes.get('/status',async c=>{
 const setup=await control(c.env).prepare("SELECT completed FROM platform_setup WHERE id='owner'").first<{completed:number}>();
 return c.json({setupRequired:!setup?.completed,datasetLabel:c.env.CMS_DATASET_LABEL,emailMode:accountEmailMode(c.env)});
});
accountRoutes.get('/session',async c=>{const who=await principal(c.env,c.req.raw.headers);return who?c.json({mode:'authenticated',datasetLabel:c.env.CMS_DATASET_LABEL,...who}):c.json({error:'Sign in to continue.'},401);});
accountRoutes.post('/setup',async c=>{
 if(c.env.LOCAL_AUTHORING!=='true'||!['127.0.0.1','localhost'].includes(new URL(c.req.url).hostname))throw new HTTPException(403,{message:'Owner setup is local only.'});
 const input=credentials.parse(await json(c.req.raw)),db=control(c.env);
 await db.prepare("INSERT OR IGNORE INTO platform_setup(id,email,completed) VALUES('owner',?,0)").bind(input.email).run();
 const claim=await db.prepare("SELECT email,completed FROM platform_setup WHERE id='owner'").first<{email:string;completed:number}>();
 if(!claim||claim.completed||claim.email!==input.email)throw new HTTPException(409,{message:'Owner setup has already been claimed.'});
 let result;
 try{result=await identity(c.env).api.signUpEmail({body:input});}catch{throw new HTTPException(409,{message:'Owner account could not be created. If setup was interrupted, follow the local recovery instructions.'});}
 await db.batch([
  db.prepare('INSERT INTO platform_admin(user_id) VALUES(?)').bind(result.user.id),
  // A password proves control of this local account, not delivery to this email address.
  db.prepare("UPDATE platform_setup SET completed=1 WHERE id='owner' AND email=?").bind(input.email)
 ]);
 await audit(c.env,result.user.id,'owner.setup',result.user.id,201);return c.json({created:true},201);
});
accountRoutes.post('/invitation',async c=>{
 const {token}=tokenInput.parse(await json(c.req.raw)),row=await invitation(c.env,token);
 return c.json({email:row.email,locale:row.locale,expiresAt:row.expires_at});
});
accountRoutes.post('/register',async c=>{
 const input=credentials.omit({email:true}).extend(tokenInput.shape).parse(await json(c.req.raw));
 const row=await invitation(c.env,input.token);
 try{await identity(c.env).api.signUpEmail({body:{name:input.name,email:row.email,password:input.password}});}
 catch{throw new HTTPException(409,{message:'Account could not be created. If you already have an account, sign in and accept this invitation.'});}
 // Registering alone grants no content access. Acceptance checks a fresh session.
 return c.json({created:true},201);
});
accountRoutes.post('/accept',async c=>{
 const who=await principal(c.env,c.req.raw.headers);if(!who)throw new HTTPException(401,{message:'Sign in before accepting the invitation.'});
 const {token}=tokenInput.parse(await json(c.req.raw)),row=await invitation(c.env,token),db=control(c.env);
 if(who.user.email.toLowerCase()!==row.email)throw new HTTPException(403,{message:'Sign in with the email address invited by the owner.'});
 if(accountEmailMode(c.env)==='preview'&&!who.user.emailVerified)throw new HTTPException(403,{message:'Verify your email address before accepting review access.'});
 const now=Date.now(),grantId=v7();
 try{await db.batch([
  db.prepare("INSERT INTO cms_grant(id,user_id,provider_id,course_id,locale,role,invitation_id) SELECT ?,?,provider_id,course_id,locale,role,id FROM cms_invitation WHERE id=? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>?").bind(grantId,who.user.id,row.id,now),
  db.prepare('UPDATE cms_invitation SET consumed_by=?,consumed_at=? WHERE id=? AND consumed_at IS NULL AND EXISTS(SELECT 1 FROM cms_grant WHERE id=?)').bind(who.user.id,now,row.id,grantId)
 ]);}catch{throw new HTTPException(409,{message:'Invitation is no longer available. Refresh your account to check access.'});}
 if(!await db.prepare('SELECT id FROM cms_grant WHERE id=?').bind(grantId).first())throw new HTTPException(409,{message:'Invitation is no longer available.'});
 await audit(c.env,who.user.id,'invitation.accept',row.id,200);return c.json({accepted:true});
});
accountRoutes.get('/invitations',async c=>{
 await owner(c.env,c.req.raw.headers);
 return c.json((await control(c.env).prepare('SELECT id,email,provider_id,course_id,locale,role,created_at,expires_at,consumed_at,revoked_at FROM cms_invitation ORDER BY created_at DESC').all()).results);
});
accountRoutes.post('/invitations',async c=>{
 const who=await owner(c.env,c.req.raw.headers),input=z.object({email,providerId:z.string().uuid(),courseId:z.string().uuid(),locale:z.string().min(2).max(40)}).parse(await json(c.req.raw));
 const courses=await contentRepository(c.env.CONTENT_DB).listCourses();
 if(!courses.some(course=>course.sourceCourseId===input.courseId&&course.providerId===input.providerId&&course.locale===input.locale))
  throw new HTTPException(400,{message:'Choose an existing translated edition and its primary course.'});
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),id=v7(),now=Date.now(),expires=now+7*86400000;
 await control(c.env).prepare("INSERT INTO cms_invitation(id,email,token_hash,provider_id,course_id,locale,role,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,'reviewer',?,?,?)").bind(id,input.email,await tokenHash(token),input.providerId,input.courseId,input.locale,who.user.id,now,expires).run();
 await audit(c.env,who.user.id,'invitation.create',id,201);
 const url=c.env.PLATFORM_ORIGIN+'/#invite='+token;
 const delivery=accountEmailMode(c.env)==='preview'?deliverAccountEmail(c.env,{to:input.email,purpose:'invitation',url,expiresAt:expires,context:'Review Access: '+courses.find(course=>course.sourceCourseId===input.courseId&&course.providerId===input.providerId&&course.locale===input.locale)!.metadata.title+' · '+input.locale}):{mode:'disabled'};
 return c.json({id,url,expiresAt:expires,delivery},201);
});
accountRoutes.post('/invitations/:id/revoke',async c=>{
 const who=await owner(c.env,c.req.raw.headers),id=z.string().uuid().parse(c.req.param('id')),db=control(c.env);
 await db.batch([db.prepare('UPDATE cms_invitation SET revoked_at=? WHERE id=?').bind(Date.now(),id),db.prepare('DELETE FROM cms_grant WHERE invitation_id=?').bind(id)]);
 await audit(c.env,who.user.id,'invitation.revoke',id,200);return c.json({revoked:true});
});
// Explicit POST confirmation keeps token-bearing links out of API URLs/access logs.
// Do not expose Better Auth's native reset/verify routes or user-selected redirects.
const emailRequest=z.object({email});
const emailToken=z.object({token:z.string().min(20).max(2048)});
const genericEmail={requested:true,message:'If this address has an eligible account, a link will be available. Check your email or ask the local Super Admin to open Email Previews.'};
function requireEmail(env:AuthEnvironment){if(accountEmailMode(env)!=='preview')throw new HTTPException(503,{message:'Account email workflows are not configured.'});}
accountRoutes.post('/send-verification',async c=>{
 requireEmail(c.env);const input=emailRequest.parse(await json(c.req.raw));
 await identity(c.env).api.sendVerificationEmail({body:{email:input.email}});
 return c.json(genericEmail);
});
accountRoutes.post('/verify-email',async c=>{
 requireEmail(c.env);const input=emailToken.parse(await json(c.req.raw));
 try{await identity(c.env).api.verifyEmail({query:{token:input.token}});}
 catch{throw new HTTPException(400,{message:'This verification link is invalid or expired. Request a new link.'});}
 return c.json({verified:true});
});
accountRoutes.post('/forgot-password',async c=>{
 requireEmail(c.env);const input=emailRequest.parse(await json(c.req.raw));
 await identity(c.env).api.requestPasswordReset({body:{email:input.email}});
 return c.json(genericEmail);
});
accountRoutes.post('/reset-password',async c=>{
 requireEmail(c.env);const input=emailToken.extend({newPassword:z.string().min(12).max(128)}).parse(await json(c.req.raw));
 try{await identity(c.env).api.resetPassword({body:input});}
 catch{throw new HTTPException(400,{message:'Password reset could not be completed. The link may be invalid, expired or already used. Request a new reset link if needed.'});}
 return c.json({reset:true});
});
accountRoutes.post('/invitations/:id/resend',async c=>{
 requireEmail(c.env);const who=await owner(c.env,c.req.raw.headers),id=z.string().uuid().parse(c.req.param('id'));
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),expires=Date.now()+7*86400000;
 const row=await control(c.env).prepare('UPDATE cms_invitation SET token_hash=?,expires_at=? WHERE id=? AND consumed_at IS NULL AND revoked_at IS NULL RETURNING email,locale').bind(await tokenHash(token),expires,id).first<{email:string;locale:string}>();
 if(!row)throw new HTTPException(409,{message:'Only an unaccepted, unrevoked invitation can be resent.'});
 deliverAccountEmail(c.env,{to:row.email,purpose:'invitation',url:accountLink(c.env,'invite',token),expiresAt:expires,context:'Review Language: '+row.locale});
 await audit(c.env,who.user.id,'invitation.resend',id,200);return c.json({resent:true,delivery:{mode:'preview'}});
});
accountRoutes.get('/email-previews',async c=>{await owner(c.env,c.req.raw.headers);return c.json({mode:accountEmailMode(c.env),messages:listEmailPreviews(c.env)});});
accountRoutes.post('/email-previews/:id/open',async c=>{await owner(c.env,c.req.raw.headers);return c.json(openEmailPreview(c.env,z.string().uuid().parse(c.req.param('id'))));});
accountRoutes.post('/email-previews/clear',async c=>{await owner(c.env,c.req.raw.headers);clearEmailPreviews(c.env);return c.json({cleared:true});});

// Public routing deliberately exposes only these Better Auth operations. Native
// sign-up/reset/change-email routes cannot bypass the guarded invitation workflow.
export async function authHandler(env:AuthEnvironment,request:Request){
 const path=new URL(request.url).pathname;
 if(request.method!=='POST'||!['/api/auth/sign-in/email','/api/auth/sign-out'].includes(path))return Response.json({error:'This account operation is unavailable in the local pilot.'},{status:404});
 if(Number(request.headers.get('content-length')||0)>8192)return Response.json({error:'Account request too large.'},{status:413});
 const raw=await request.text();if(raw.length>8192)return Response.json({error:'Account request too large.'},{status:413});
 const result=await identity(env).handler(new Request(request,{body:raw}));
 // Keep session tokens in HttpOnly cookies; do not return Better Auth's raw token.
 return new Response(JSON.stringify(result.ok?{ok:true}:{error:'Sign-in failed. Check your email/password or try again shortly.'}),{status:result.status,headers:result.headers});
}
