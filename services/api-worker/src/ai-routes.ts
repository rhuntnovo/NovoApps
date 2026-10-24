import {Hono} from 'hono';
import {HTTPException} from 'hono/http-exception';
import {z} from 'zod';
import {v7} from 'uuid';
import {principal,control,audit} from './auth';
import {contentRepository} from './repository';
import {settingsStatus,readSettings,encryptCredential,capabilities,safeLabel,type AIEnv} from './ai';

export const aiRoutes=new Hono<{Bindings:AIEnv}>();
async function admin(env:AIEnv,request:Request){if(env.AUTH_REQUIRED!=='true')throw new HTTPException(403,{message:'Authenticated AI management is required.'});const who=await principal(env,request.headers);if(!who?.owner)throw new HTTPException(403,{message:'Super Admin access is required.'});return who;}
async function provider(env:AIEnv,id:string){z.string().uuid().parse(id);if(!(await contentRepository(env.CONTENT_DB).listProviders()).some(row=>row.id===id))throw new HTTPException(404,{message:'Provider not found.'});}
async function body(request:Request){const text=await request.text();if(text.length>16000)throw new HTTPException(413,{message:'AI settings request is too large.'});try{return JSON.parse(text);}catch{throw new HTTPException(400,{message:'Invalid JSON.'});}}
const settingsInput=z.object({revision:z.number().int().min(0),apiKey:z.string().trim().min(20).max(500).optional(),removeKey:z.boolean().default(false),projectId:z.string().trim().regex(/^(?:proj_[A-Za-z0-9_-]{1,120})?$/).default(''),model:z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,99}$/),features:z.object({translate:z.boolean(),narration:z.boolean(),images:z.boolean()}),dailyLimit:z.number().int().min(1).max(10000)});
aiRoutes.get('/modules/:id/ai-capabilities',async c=>c.json(await capabilities(c.env,c.req.raw,await contentRepository(c.env.CONTENT_DB).getModule(c.req.param('id')))));
aiRoutes.get('/providers/:id/ai-settings',async c=>{await admin(c.env,c.req.raw);await provider(c.env,c.req.param('id'));return c.json(await settingsStatus(c.env,c.req.param('id')));});
aiRoutes.put('/providers/:id/ai-settings',async c=>{
 const who=await admin(c.env,c.req.raw),id=c.req.param('id');await provider(c.env,id);const input=settingsInput.parse(await body(c.req.raw));
 if(input.apiKey&&input.removeKey)throw new HTTPException(400,{message:'Choose Replace Key or Remove Key.'});
 const current=await readSettings(c.env,id),credentialId=input.apiKey?v7():current?.credential_id||null;
 const secret=input.apiKey?await encryptCredential(c.env,id,credentialId!,input.apiKey):null;
 const values=[input.removeKey?null:secret?.encryptedKey||current?.encrypted_key||null,input.removeKey?null:secret?.nonce||current?.key_nonce||null,input.removeKey?null:secret?.version||current?.key_version||null,input.removeKey?null:credentialId,input.projectId,input.model,+input.features.translate,+input.features.narration,+input.features.images,input.dailyLimit,who.user.id,Date.now()];
 const db=control(c.env);let changed;
 if(input.revision===0)changed=await db.prepare(`INSERT INTO cms_ai_settings(provider_id,encrypted_key,key_nonce,key_version,credential_id,project_id,translation_model,translate_enabled,narration_enabled,images_enabled,daily_limit,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider_id) DO NOTHING RETURNING provider_id`).bind(id,...values).first();
 else changed=await db.prepare('UPDATE cms_ai_settings SET encrypted_key=?,key_nonce=?,key_version=?,credential_id=?,project_id=?,translation_model=?,translate_enabled=?,narration_enabled=?,images_enabled=?,daily_limit=?,updated_by=?,updated_at=?,revision=revision+1 WHERE provider_id=? AND revision=? RETURNING provider_id').bind(...values,id,input.revision).first();
 if(!changed)throw new HTTPException(409,{message:'AI settings changed in another window. Reopen settings before saving.'});
 await audit(c.env,who.user.id,input.apiKey?'ai.credential.replace':input.removeKey?'ai.credential.remove':'ai.settings.update',id,200);
 return c.json(await settingsStatus(c.env,id));
});
aiRoutes.get('/providers/:id/ai-grants',async c=>{
 await admin(c.env,c.req.raw);await provider(c.env,c.req.param('id'));
 return c.json((await control(c.env).prepare('SELECT g.id,g.course_id,g.locale,u.name,u.email,COALESCE(a.translate_enabled,0) AS translate_enabled,COALESCE(a.narration_enabled,0) AS narration_enabled,COALESCE(a.images_enabled,0) AS images_enabled FROM cms_grant g JOIN auth_user u ON u.id=g.user_id LEFT JOIN cms_ai_grant a ON a.grant_id=g.id WHERE g.provider_id=? ORDER BY u.name,g.locale,g.id').bind(c.req.param('id')).all()).results);
});
aiRoutes.put('/providers/:id/ai-grants/:grant',async c=>{
 const who=await admin(c.env,c.req.raw),id=c.req.param('id'),grant=z.string().uuid().parse(c.req.param('grant'));await provider(c.env,id);
 const input=z.object({translate:z.boolean(),narration:z.boolean(),images:z.boolean()}).parse(await body(c.req.raw));
 const saved=await control(c.env).prepare(`INSERT INTO cms_ai_grant(grant_id,translate_enabled,narration_enabled,images_enabled,updated_by,updated_at) SELECT id,?,?,?,?,? FROM cms_grant WHERE id=? AND provider_id=? ON CONFLICT(grant_id) DO UPDATE SET translate_enabled=excluded.translate_enabled,narration_enabled=excluded.narration_enabled,images_enabled=excluded.images_enabled,updated_by=excluded.updated_by,updated_at=excluded.updated_at RETURNING grant_id`).bind(+input.translate,+input.narration,+input.images,who.user.id,Date.now(),grant,id).first();
 if(!saved)throw new HTTPException(404,{message:'Active course grant not found. Refresh permissions.'});
 await audit(c.env,who.user.id,'ai.grant.update',grant,200);return c.json({saved:true});
});
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value);
const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;
export function activityTotals(rows:any[]){return {requests:rows.length,missingUsage:rows.filter(row=>number(row.usage?.input_tokens??row.usage?.prompt_tokens)===null||number(row.usage?.output_tokens??row.usage?.completion_tokens)===null).length,unknown:rows.filter(row=>['unknown','pending'].includes(row.outcome)).length,reconciled:rows.filter(row=>row.reconciled_at).length,inputTokens:rows.reduce((sum,row)=>sum+(number(row.usage?.input_tokens)??number(row.usage?.prompt_tokens)??0),0),outputTokens:rows.reduce((sum,row)=>sum+(number(row.usage?.output_tokens)??number(row.usage?.completion_tokens)??0),0)};}
const csvCell=(value:unknown)=>{let text=value===null||value===undefined?'':String(value);if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
export function activityCSV(rows:any[]){
 const columns=['Activity ID','Started At UTC','Finished At UTC','Provider ID','Actor','Actor ID','Primary Course ID','Module ID','Page ID','Block ID','Locale','Feature','Credential Reference','OpenAI Project ID','Endpoint','Requested Model','Returned Model','Voice','Quality','Image Size','Input Characters','Requested Images','Returned Images','Output Bytes','Outcome','Saved Result','HTTP Status','OpenAI Request ID','OpenAI Response ID','OpenAI Organization ID','Reported Input Tokens','Reported Output Tokens','Reported Cached Input Tokens','Reported Reasoning Tokens','Reported Text Input Tokens','Reported Image Input Tokens','Reported Audio Input Tokens','Reported Image Output Tokens','Reported Audio Output Tokens','Reported Usage JSON','Reconciled At UTC','Reconciliation Note'];
 const iso=(value:number|null)=>value?new Date(value).toISOString():'';
 return '\uFEFF'+[columns,...rows.map(row=>[row.id,iso(row.started_at),iso(row.finished_at),row.provider_id,row.actor_name,row.actor_id,row.course_id,row.module_id,row.page_id,row.block_id,row.locale,row.feature,row.credential_id,row.project_id,row.endpoint,row.requested_model,row.model,row.voice,row.quality,row.image_size,row.input_characters,row.requested_images,row.output_images,row.output_bytes,row.outcome,row.application_status,row.http_status,row.request_id,row.response_id,row.organization_id,row.usage?.input_tokens??row.usage?.prompt_tokens,row.usage?.output_tokens??row.usage?.completion_tokens,row.usage?.input_tokens_details?.cached_tokens??row.usage?.prompt_tokens_details?.cached_tokens,row.usage?.output_tokens_details?.reasoning_tokens??row.usage?.completion_tokens_details?.reasoning_tokens,row.usage?.input_tokens_details?.text_tokens,row.usage?.input_tokens_details?.image_tokens,row.usage?.input_tokens_details?.audio_tokens,row.usage?.output_tokens_details?.image_tokens,row.usage?.output_tokens_details?.audio_tokens,row.usage_json,iso(row.reconciled_at),row.reconciliation_note])].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
aiRoutes.get('/providers/:id/ai-activity',async c=>{
 await admin(c.env,c.req.raw);const providerId=c.req.param('id');await provider(c.env,providerId);
 const now=new Date(),from=date.parse(c.req.query('from')||now.toISOString().slice(0,7)+'-01'),to=date.parse(c.req.query('to')||now.toISOString().slice(0,10));
 if(from>to)throw new HTTPException(400,{message:'Start Date must be before End Date.'});
 const where=['provider_id=?','started_at>=?','started_at<?'],values:unknown[]=[providerId,Date.parse(from),Date.parse(to)+86400000];
 for(const [field,key,schema] of [['feature','feature',z.enum(['translate','narration','images'])],['outcome','outcome',z.enum(['pending','succeeded','rejected','unknown'])]] as const){const value=c.req.query(key);if(value){where.push(field+'=?');values.push(schema.parse(value));}}
 const review=c.req.query('reconciled');if(review){z.enum(['yes','no']).parse(review);where.push('reconciled_at IS '+(review==='yes'?'NOT ':'')+'NULL');}
 const rows=(await control(c.env).prepare('SELECT * FROM cms_ai_activity WHERE '+where.join(' AND ')+' ORDER BY started_at DESC,id DESC LIMIT 10001').bind(...values).all<any>()).results;
 if(rows.length>10000)throw new HTTPException(413,{message:'More than 10,000 matching requests. Narrow the date range or filters before exporting.'});
 const result=rows.map(row=>({...row,usage:row.usage_json?JSON.parse(row.usage_json):null}));
 if(c.req.query('format')==='csv'){c.header('Content-Type','text/csv; charset=utf-8');c.header('Content-Disposition','attachment; filename="ai-activity-'+from+'-'+to+'.csv"');return c.body(activityCSV(result));}
 return c.json({from,to,timezone:'UTC',rows:result,totals:activityTotals(result)});
});
aiRoutes.put('/providers/:id/ai-activity/:activity/reconciliation',async c=>{
 const who=await admin(c.env,c.req.raw),providerId=c.req.param('id');await provider(c.env,providerId);
 const id=z.string().uuid().parse(c.req.param('activity')),input=z.object({version:z.number().int().min(0),reconciled:z.boolean(),note:z.string().max(500).default('')}).parse(await body(c.req.raw));safeLabel(input.note);
 const db=control(c.env),event=v7(),now=Date.now();
 const active=await db.prepare("SELECT id FROM cms_ai_activity WHERE id=? AND provider_id=? AND outcome='pending' AND started_at>?").bind(id,providerId,now-10*60000).first();
 if(active)throw new HTTPException(409,{message:'This request is still running. Wait for its outcome before reconciling.'});
 await db.batch([
  db.prepare('INSERT INTO cms_ai_reconciliation_event(id,activity_id,actor_id,reconciled,note,created_at) SELECT ?,id,?,?,?,? FROM cms_ai_activity WHERE id=? AND provider_id=? AND reconciliation_version=?').bind(event,who.user.id,+input.reconciled,input.note,now,id,providerId,input.version),
  db.prepare('UPDATE cms_ai_activity SET reconciled_at=?,reconciled_by=?,reconciliation_note=?,reconciliation_version=reconciliation_version+1 WHERE id=? AND provider_id=? AND reconciliation_version=? AND EXISTS(SELECT 1 FROM cms_ai_reconciliation_event WHERE id=?)').bind(input.reconciled?now:null,who.user.id,input.note,id,providerId,input.version,event)
 ]);
 if(!await db.prepare('SELECT id FROM cms_ai_reconciliation_event WHERE id=?').bind(event).first())throw new HTTPException(409,{message:'Activity reconciliation changed. Refresh the history before saving.'});
 await audit(c.env,who.user.id,'ai.activity.reconcile',id,200);return c.json({saved:true});
});
