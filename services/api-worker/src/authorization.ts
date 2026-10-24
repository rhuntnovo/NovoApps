import {r2Mode,readPrivate} from './r2-storage';
import {requireFeature,capabilities} from './ai';
import {reviewerArtifacts,type ReviewedArtifact} from './ai-artifacts';
import type {Context,Next} from 'hono';
import {HTTPException} from 'hono/http-exception';
import {contentRepository} from './repository';
import {pageSchema,type CoursePage} from '@novoapps/content-model';
import {principal,audit,control,type AuthEnvironment,type Principal} from './auth';

export const requestActor=new WeakMap<Request,string>();
const deny=()=>{throw new HTTPException(403,{message:'Your account does not have permission for this content or operation.'});};
export const canRead=(who:Principal,row:{providerId:string|null;id:string;sourceCourseId:string|null;locale:string})=>who.owner||who.grants.some(grant=>grant.provider_id===row.providerId&&grant.course_id===(row.sourceCourseId||row.id)&&(!row.sourceCourseId||grant.locale===row.locale));
export const canWrite=(who:Principal,row:{providerId:string|null;id:string;sourceCourseId:string|null;locale:string})=>who.owner||!!row.sourceCourseId&&who.grants.some(grant=>grant.provider_id===row.providerId&&grant.course_id===row.sourceCourseId&&grant.locale===row.locale);
const canonical=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
// Allow text review, not arbitrary JSON replacement. Preserve IDs, order, layouts,
// media ownership and unknown schema extensions. A changed script detaches audio.
export function reviewerPage(before:CoursePage,after:CoursePage,artifacts:ReviewedArtifact[]=[]){
 const expected=structuredClone(before);expected.title=after.title;
 if(typeof expected.presentation?.source_note==='string')expected.presentation.source_note=after.presentation?.source_note;
 for(const block of expected.blocks){const next=after.blocks.find(item=>item.id===block.id);if(!next)return false;block.text=next.text;const generated=artifacts.find(item=>item.blockId===block.id&&item.image&&next.image&&item.image.src===next.image.src);if(generated)block.image={...generated.image,alt:next.image!.alt};else if(block.image&&next.image)block.image.alt=next.image.alt;}
 const prompt=(a:any,b:any)=>{if(a&&b)for(const key of ['title','prompt','time'])if(key in a||key==='time'&&typeof b[key]==='string')a[key]=b[key];};
 prompt(expected.reflection,after.reflection);
 if(expected.guided&&after.guided){expected.guided.narration=after.guided.narration;prompt(expected.guided.facilitator,after.guided.facilitator);
  for(const segment of expected.guided.segments||[]){const next=after.guided.segments?.find(item=>item.block_id===segment.block_id);if(!next)return false;
   if(segment.text!==next.text||next.audio===undefined&&next.audio_source===undefined){segment.text=next.text;delete segment.audio;delete segment.audio_source;}
   const generated=artifacts.find(item=>item.blockId===segment.block_id&&!!item.audio&&item.audio===next.audio&&item.script===next.text);if(generated){segment.audio=generated.audio;segment.audio_source='ai';}
  }
  if(after.guided.narration_mode==='marin_opus'&&artifacts.some(item=>item.audio&&after.guided?.segments?.some(segment=>segment.audio===item.audio)))expected.guided.narration_mode='marin_opus';
 }
 return canonical(expected)===canonical(after);
}
export async function authorize(c:Context<{Bindings:AuthEnvironment}>,next:Next){
 if(c.env.AUTH_REQUIRED!=='true')return next();
 const who=await principal(c.env,c.req.raw.headers);if(!who)return c.json({error:'Your session ended. Sign in again; keep this tab open to preserve unsaved work.'},401);
 requestActor.set(c.req.raw,who.user.id);
 const path=c.req.path.replace('/api/v1/cms',''),method=c.req.method,repo=contentRepository(c.env.CONTENT_DB);
 const courseRows=await repo.listCourses(),readable=courseRows.filter(row=>canRead(who,row));
 const list=method==='GET'&&['/providers','/courses','/modules'].includes(path);
 let moduleId=path.match(/^\/modules\/([^/]+)/)?.[1];
 const pageId=path.match(/^\/pages\/([^/]+)/)?.[1];
 if(pageId){const page=await c.env.CONTENT_DB.prepare('SELECT module_id FROM cms_pages WHERE id=?').bind(pageId).first<{module_id:string}>();if(!page)deny();moduleId=page!.module_id;}
 let module;
 if(moduleId){module=await repo.getModule(moduleId);if(!readable.some(row=>row.id===module!.courseId))deny();}
 if(!who.owner){
  if(method==='GET'){
   if(!list&&!/^\/modules\/[^/]+(?:\/(?:export|ai-capabilities))?$/.test(path)&&path!=='/media-capabilities')deny();
   if(path==='/media-capabilities'&&!await control(c.env).prepare('SELECT a.grant_id FROM cms_ai_grant a JOIN cms_grant g ON g.id=a.grant_id WHERE g.user_id=? AND (a.images_enabled=1 OR a.narration_enabled=1)').bind(who.user.id).first())deny();
  }else if(method==='PUT'&&/^\/pages\/[^/]+\/draft$/.test(path)&&module){
   const row=courseRows.find(row=>row.id===module!.courseId);if(!row||!canWrite(who,row))deny();
   const input=await c.req.raw.clone().json() as any,after=pageSchema.parse(input.page);
   const summary=module.pages.find(page=>page.id===pageId),before=module.course.module.pages.find(page=>page.id===summary?.canonicalId);
   const artifacts=await reviewerArtifacts(c.env,c.req.raw,who,module,pageId!,after);
   if(!before||!reviewerPage(before,after,artifacts)||input.allowStructureChanges||(input.removedBlockIds?.length))deny();
  }else if(method==='POST'&&module&&(/^\/pages\/[^/]+\/translate$/.test(path)||/^\/modules\/[^/]+\/translate-headings$/.test(path)||/^\/modules\/[^/]+\/pages\/[^/]+\/media\/(speech|image-generate|image-upload)$/.test(path))){
   const row=courseRows.find(row=>row.id===module!.courseId);if(!row||!canWrite(who,row))deny();
   await requireFeature(c.env,c.req.raw,module,path.endsWith('/speech')?'narration':path.includes('/media/')?'images':'translate');
  }else deny();
 }
 // Unknown endpoints must never inherit an implicit write permission for reviewers.
 let auditId:string|undefined;
 if(!['GET','HEAD'].includes(method))auditId=await audit(c.env,who.user.id,'cms.'+method.toLowerCase(),path);
 await next();
 if(auditId)await control(c.env).prepare('UPDATE platform_audit SET status=? WHERE id=?').bind(c.res.status,auditId).run();
 if(list&&!who.owner&&c.res.ok){
  const rows=await c.res.json() as any[];
  const filtered=path==='/courses'?rows.filter(row=>readable.some(course=>course.id===row.id)):
   path==='/modules'?rows.filter(row=>readable.some(course=>course.id===row.courseId)):
   rows.filter(row=>who.grants.some(grant=>grant.provider_id===row.id));
  c.res=new Response(JSON.stringify(filtered),{status:c.res.status,headers:c.res.headers});
 }
}

export async function draftMedia(c:Context<{Bindings:AuthEnvironment}>){
 if(c.env.AUTH_REQUIRED!=='true')throw new HTTPException(404);
 const who=await principal(c.env,c.req.raw.headers);if(!who)throw new HTTPException(401);
 // Authenticate a concrete saved media reference, never a client-supplied owner path.
 const repo=contentRepository(c.env.CONTENT_DB),courses=await repo.listCourses(),modules=await repo.listModules(),path=c.req.path;
 let allowed=false,expected:{providerId:string;courseId:string;providerSlug:string}|undefined;
 for(const summary of modules){if(!courses.some(row=>row.id===summary.courseId&&canRead(who,row)))continue;
  const module=await repo.getModule(summary.id);
  if(module.course.module.pages.some(page=>page.blocks.some(block=>block.image?.src===path||block.image?.small_src===path)||page.guided?.segments?.some(segment=>segment.audio===path))){allowed=true;expected={providerId:module.provider.id,providerSlug:module.provider.slug,courseId:courses.find(row=>row.id===module.courseId)?.sourceCourseId||module.courseId};break;}
 }
 // Owners may preview newly uploaded, not-yet-attached files; the bridge secret
 // still prevents bypassing sign-in through the local media helper.
 if(!allowed&&!who.owner){
  const rows=(await control(c.env).prepare('SELECT module_id,metadata_json FROM cms_ai_artifact WHERE actor_id=?').bind(who.user.id).all<{module_id:string;metadata_json:string}>()).results;
  for(const row of rows){const asset=JSON.parse(row.metadata_json);if(asset.audio!==path&&asset.image?.src!==path&&asset.image?.small_src!==path)continue;const module=await repo.getModule(row.module_id),course=courses.find(course=>course.id===module.courseId);if(!course||!canWrite(who,course))continue;const caps=await capabilities(c.env,c.req.raw,module);if(asset.audio?caps.narration:caps.images){allowed=true;expected={providerId:module.provider.id,providerSlug:module.provider.slug,courseId:course.sourceCourseId||course.id};break;}}
  if(!allowed)deny();
 }
 if(r2Mode(c.env))return readPrivate(c.env,path,c.req.header('Range'),who.owner?undefined:expected);
 const response=await fetch((c.env.CMS_MEDIA_URL||'http://127.0.0.1:8789')+path,{headers:{'X-CMS-Bridge':c.env.CMS_MEDIA_SECRET||'',...(c.req.header('Range')?{Range:c.req.header('Range')!}:{})}});
 const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('X-Robots-Tag','noindex, nofollow');
 return new Response(response.body,{status:response.status,headers});
}
