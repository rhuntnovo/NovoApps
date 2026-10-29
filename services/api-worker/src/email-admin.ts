import {Hono} from 'hono';
import {HTTPException} from 'hono/http-exception';
import {principal,audit,type AuthEnvironment} from './auth';
import {emailSettingsStatus,saveEmailSettings,emailDB} from './email-storage';
import {processEmailOutbox} from './email-delivery';
import {deliverAccountEmail} from './account-email';
export const emailAdmin=new Hono<{Bindings:AuthEnvironment}>();
emailAdmin.use('*',async(c,next)=>{if(c.env.AUTH_REQUIRED!=='true')throw new HTTPException(404);const who=await principal(c.env,c.req.raw.headers);if(!who)throw new HTTPException(401,{message:'Sign in to continue.'});if(!who.owner)throw new HTTPException(403,{message:'Super Admin access is required.'});await next();});
emailAdmin.get('/settings',async c=>c.json(await emailSettingsStatus(c.env)));
emailAdmin.post('/settings',async c=>{
 const text=await c.req.text();if(text.length>8192)throw new HTTPException(413,{message:'Email settings request is too large.'});let input;try{input=JSON.parse(text);}catch{throw new HTTPException(400,{message:'Invalid JSON.'});}
 const who=(await principal(c.env,c.req.raw.headers))!,result=await saveEmailSettings(c.env,input,who.user.id);await audit(c.env,who.user.id,'email.settings.update','account-email',200);return c.json(result);
});
emailAdmin.get('/deliveries',async c=>{
 const status=await emailSettingsStatus(c.env);if(!status.schemaReady)return c.json({rows:[],schemaReady:false});
 return c.json({schemaReady:true,rows:(await emailDB(c.env).prepare('SELECT id,provider,purpose,recipient_email,created_at,expires_at,status,attempts,next_attempt_at,finished_at,provider_reference,http_status,error_code FROM platform_email_outbox ORDER BY created_at DESC,id DESC LIMIT 100').all()).results});
});
emailAdmin.post('/process',async c=>{await processEmailOutbox(c.env);return c.json({processed:true});});
const tests=new WeakMap<D1Database,number>();
emailAdmin.post('/test',async c=>{
 const db=emailDB(c.env),now=Date.now();if(now-(tests.get(db)||0)<30000)throw new HTTPException(429,{message:'Wait 30 seconds before another test email.'});tests.set(db,now);
 const who=(await principal(c.env,c.req.raw.headers))!;
 const result=await deliverAccountEmail(c.env,{to:who.user.email,purpose:'test',url:'',expiresAt:now+3600000});await audit(c.env,who.user.id,'email.test.request','account-email',202);return c.json(result,202);
});
