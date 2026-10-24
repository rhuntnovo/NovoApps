import {accountRoutes,authHandler,principal,type AuthEnvironment} from './auth';
import {authorize,draftMedia,requestActor} from './authorization';
import {mediaRoutes} from './media';
import {aiRoutes} from './ai-routes';
import {aiOperation,storageReady} from './ai';
import {markArtifactsSaved} from './ai-artifacts';
import { pages } from '../../../database/content/schema';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { courseSchema, savePageSchema, providerInput,courseInput,moduleInput,newPageInput,editionInput,
  headingsInput,pageText,applyTranslation,type ModuleHeadings } from '@novoapps/content-model';
import { ContentError, contentRepository } from './repository';
import { aiConfiguration,aiStatus,configureAI,translateFields,type AIEnvironment } from './translation';
type Bindings={CONTENT_DB:D1Database;LOCAL_AUTHORING?:string;CMS_ORIGIN?:string}&AIEnvironment&AuthEnvironment;
export const app=new Hono<{Bindings:Bindings}>();
app.onError((error,c)=>{
  if(error instanceof ContentError)return c.json({error:error.message},error.status);
  if(error instanceof HTTPException)return c.json({error:error.message},error.status);
  if(error instanceof z.ZodError)return c.json({error:'Invalid content',issues:error.issues.map(issue=>issue.message)},400);
  console.error('CMS request failed',{route:c.req.path});
  return c.json({error:'The CMS could not complete this request.'},500);
});
app.use('*',async(c,next)=>{
  c.header('X-Robots-Tag','noindex, nofollow, nosnippet, noimageindex');
  const host=new URL(c.req.url).hostname;
  if(c.env.LOCAL_AUTHORING!=='true'||!['127.0.0.1','localhost'].includes(host))
    return c.json({error:'Local authoring only. Authenticated deployment is not configured.'},403);
  if(c.env.CMS_STORAGE==='r2'&&c.env.AUTH_REQUIRED!=='true')return c.json({error:'R2 authoring requires authentication.'},503);
  const origin=c.req.header('Origin');
  const allowedOrigins=new Set([c.env.CMS_ORIGIN,...(c.env.AUTH_REQUIRED==='true'?[c.env.PLATFORM_ORIGIN,c.env.PREVIEW_ORIGIN]:[])]);
  if(c.env.CMS_ORIGIN){const configured=new URL(c.env.CMS_ORIGIN);
    if(['127.0.0.1','localhost'].includes(configured.hostname))for(const name of ['127.0.0.1','localhost']){const alias=new URL(configured);alias.hostname=name;allowedOrigins.add(alias.origin);}}
  if(origin&&!allowedOrigins.has(origin))return c.json({error:'Origin not allowed'},403);
  if(c.env.AUTH_REQUIRED==='true'){
    if(c.req.header('Sec-Fetch-Site')==='cross-site')return c.json({error:'Cross-site requests are not allowed.'},403);
    if(!['GET','HEAD','OPTIONS'].includes(c.req.method)&&(!origin||![c.env.CMS_ORIGIN,c.env.PLATFORM_ORIGIN].includes(origin)))return c.json({error:'A trusted browser origin is required.'},403);
    if(origin)c.header('Access-Control-Allow-Credentials','true');
  }
  c.header('Cache-Control','no-store');
  if(origin){c.header('Access-Control-Allow-Origin',origin);c.header('Vary','Origin');}
  if(c.req.method==='OPTIONS'){
    c.header('Access-Control-Allow-Methods','GET, POST, PUT, OPTIONS');
    c.header('Access-Control-Allow-Headers','Content-Type');return c.body(null,204);
  }
  // A browser mutation must be an application/json request. This prevents form
  // posts from an unrelated local page while retaining the CLI importer.
  if(!['GET','HEAD'].includes(c.req.method)&&!c.req.header('Content-Type')?.startsWith('application/json'))
    return c.json({error:'Use application/json'},415);
  await next();
  // Raw streamed/auth responses also need the prepared security/CORS headers.
  c.header('X-Robots-Tag','noindex, nofollow, nosnippet, noimageindex');
  c.header('Cache-Control','no-store');
  if(origin){c.header('Access-Control-Allow-Origin',origin);c.header('Vary','Origin');
    if(c.env.AUTH_REQUIRED==='true')c.header('Access-Control-Allow-Credentials','true');}
});
async function jsonBody(request:Request){
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>1000000)throw new HTTPException(413,{message:'Course input is too large'});
  try{return JSON.parse(raw);}catch{throw new HTTPException(400,{message:'Invalid JSON'});}
}
app.route('/api/v1/account',accountRoutes);
app.all('/api/auth/*',async c=>c.env.AUTH_REQUIRED==='true'?authHandler(c.env,c.req.raw):c.json({error:'Authentication pilot is not enabled.'},404));
app.get('/api/v1/access',async c=>{
 if(c.env.AUTH_REQUIRED!=='true')return c.json({mode:'local',owner:true,grants:[]});
 const who=await principal(c.env,c.req.raw.headers);return who?c.json({mode:'authenticated',datasetLabel:c.env.CMS_DATASET_LABEL,...who}):c.json({error:'Sign in to continue.'},401);
});
app.get('/assets/cms/*',draftMedia);
app.get('/audio/cms/*',draftMedia);
app.use('/api/v1/cms/*',authorize);
const revisionInput=z.object({expectedRevision:z.number().int().positive()});
app.route('/api/v1/cms',mediaRoutes);
app.route('/api/v1/cms',aiRoutes);
app.put('/api/v1/cms/modules/:id/page-order',async c=>{const input=z.object({expectedStructureRevision:z.number().int().positive(),pageIds:z.array(z.string().uuid()).min(1)}).parse(await jsonBody(c.req.raw));return c.json(await contentRepository(c.env.CONTENT_DB,requestActor.get(c.req.raw)).reorderPages(c.req.param('id'),input.expectedStructureRevision,input.pageIds));});
app.post('/api/v1/cms/modules/:id/pages/:pageId/delete',async c=>{const input=z.object({expectedStructureRevision:z.number().int().positive()}).parse(await jsonBody(c.req.raw));return c.json(await contentRepository(c.env.CONTENT_DB,requestActor.get(c.req.raw)).deletePage(c.req.param('id'),c.req.param('pageId'),input.expectedStructureRevision));});
app.get('/robots.txt',c=>c.text('User-agent: *\nDisallow: /\n'));
app.get('/health',c=>c.json({status:'ok',mode:c.env.AUTH_REQUIRED==='true'?'local-authenticated':'local-authoring',aiCredentialStorage:c.env.AUTH_REQUIRED==='true'?(storageReady(c.env)?'ready':'unconfigured'):'local-session'}));
app.get('/api/v1/cms/providers',async c=>c.json(await contentRepository(c.env.CONTENT_DB,requestActor.get(c.req.raw)).listProviders()));
app.post('/api/v1/cms/providers',async c=>c.json(await contentRepository(c.env.CONTENT_DB,requestActor.get(c.req.raw)).createProvider(providerInput.parse(await jsonBody(c.req.raw))),201));
app.get('/api/v1/cms/courses',async c=>c.json(await contentRepository(c.env.CONTENT_DB,requestActor.get(c.req.raw)).listCourses()));
app.post('/api/v1/cms/courses',async c=>c.json(await contentRepository(c.env.CONTENT_DB,requestActor.get(c.req.raw)).createCourse(courseInput.parse(await jsonBody(c.req.raw))),201));
app.get('/api/v1/cms/modules',async c=>c.json(await contentRepository(c.env.CONTENT_DB,requestActor.get(c.req.raw)).listModules()));
app.post('/api/v1/cms/modules',async c=>c.json(await contentRepository(c.env.CONTENT_DB,requestActor.get(c.req.raw)).createModule(moduleInput.parse(await jsonBody(c.req.raw))),201));
app.post('/api/v1/cms/import',async c=>{
  const input=await jsonBody(c.req.raw);
  const envelope=z.object({providerId:z.string().uuid(),course:courseSchema,reviewRequired:z.boolean().default(false)}).safeParse(input);
  // Legacy body supported only for the existing New Vines bootstrap script.
  return c.json(await contentRepository(c.env.CONTENT_DB,requestActor.get(c.req.raw)).importCourse(
    envelope.success?envelope.data.course:courseSchema.parse(input),envelope.success?envelope.data.providerId:undefined,
    undefined,envelope.success?envelope.data.reviewRequired:false),201);
});
app.get('/api/v1/cms/modules/:id',async c=>c.json(await contentRepository(c.env.CONTENT_DB,requestActor.get(c.req.raw)).getModule(c.req.param('id'))));
app.post('/api/v1/cms/modules/:id/pages',async c=>c.json(await contentRepository(c.env.CONTENT_DB,requestActor.get(c.req.raw)).createPage(c.req.param('id'),newPageInput.parse(await jsonBody(c.req.raw))),201));
app.post('/api/v1/cms/modules/:id/editions',async c=>c.json(await contentRepository(c.env.CONTENT_DB,requestActor.get(c.req.raw)).createEdition(c.req.param('id'),editionInput.parse(await jsonBody(c.req.raw))),201));
app.post('/api/v1/cms/modules/:id/sync-source',async c=>c.json(await contentRepository(c.env.CONTENT_DB,requestActor.get(c.req.raw)).syncEdition(c.req.param('id'))));
app.put('/api/v1/cms/modules/:id/headings',async c=>{
  const input=revisionInput.extend({headings:headingsInput}).parse(await jsonBody(c.req.raw));
  return c.json(await contentRepository(c.env.CONTENT_DB,requestActor.get(c.req.raw)).saveHeadings(c.req.param('id'),input.expectedRevision,input.headings));
});
app.put('/api/v1/cms/pages/:id/draft',async c=>{
  const input=savePageSchema.extend({sourceRevision:z.number().int().positive().optional()}).parse(await jsonBody(c.req.raw));
  const result=await contentRepository(c.env.CONTENT_DB,requestActor.get(c.req.raw)).savePage(c.req.param('id'),input.expectedRevision,input.page,input.allowWordingChanges,input);
  await markArtifactsSaved(c.env,requestActor.get(c.req.raw),c.req.param('id'),input.page);return c.json(result);
});
app.get('/api/v1/cms/translation-settings',c=>c.env.AUTH_REQUIRED==='true'?c.json({error:'Choose a provider in AI Settings.'},400):c.json(aiStatus(c.env)));
app.put('/api/v1/cms/translation-settings',async c=>{
  if(c.env.AUTH_REQUIRED==='true')return c.json({error:'Use provider-specific AI Settings.'},400);
  const input=z.object({apiKey:z.string().trim().min(20).max(500).optional(),
    model:z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,99}$/).optional(),forget:z.boolean().optional()}).parse(await jsonBody(c.req.raw));
  configureAI(input,c.env);return c.json(aiStatus(c.env));
});
app.post('/api/v1/cms/pages/:id/translate',async c=>{
  const input=revisionInput.extend({overwrite:z.boolean().default(false)}).parse(await jsonBody(c.req.raw));
  const repository=contentRepository(c.env.CONTENT_DB,requestActor.get(c.req.raw));
  const summaries=await repository.listModules();
  // UUID page -> owning module, not a user-supplied source document.


  const pageRow=await drizzle(c.env.CONTENT_DB).select().from(pages).where(eq(pages.id,c.req.param('id'))).get();
  if(!pageRow||!summaries.some(module=>module.id===pageRow.moduleId))throw new ContentError(404,'Page not found');
  const target=await repository.getModule(pageRow.moduleId);
  const summary=target.pages.find(page=>page.id===pageRow.id)!;
  if(!target.sourceModuleId||!target.sourceCourse)throw new ContentError(400,'Create a language/region edition first.');
  if(summary.revision!==input.expectedRevision)throw new ContentError(409,'The draft changed. Reload before generating.');
  if(summary.translationStatus!=='untranslated'&&!input.overwrite)throw new ContentError(409,'This page already has translation edits. Explicit replacement is required.');
  let source=target.sourceCourse.module.pages.find(page=>page.id===summary.canonicalId);
  if(!source)throw new ContentError(409,'Source page not found. Synchronize this edition.');
  const issue=target.sourceCourse.source_issues.find(item=>item.source_slide===source!.source_slide);
  if(issue)source={...source,presentation:{...source.presentation,source_note:issue.note}};
  const operation=await aiOperation(c.env,c.req.raw,target,'translate',{pageId:summary.id});
  const fields=await translateFields(pageText(source),target.course.language,target.course.country,operation.config,operation.request);
  await operation.recheck();
  const page=applyTranslation(source,fields);
  const result=await repository.savePage(summary.id,input.expectedRevision,page,true,{
    translationStatus:'draft',sourceRevision:summary.sourceCurrentRevision!,reviewNote:summary.reviewNote});
  await operation.finish('saved');return c.json(result);
});
app.post('/api/v1/cms/modules/:id/translate-headings',async c=>{
  const input=revisionInput.parse(await jsonBody(c.req.raw));
  const repository=contentRepository(c.env.CONTENT_DB,requestActor.get(c.req.raw)),target=await repository.getModule(c.req.param('id'));
  if(!target.sourceCourse)throw new ContentError(400,'Create an edition first.');
  if(target.metadataRevision!==input.expectedRevision)throw new ContentError(409,'Module headings changed. Reload first.');
  const operation=await aiOperation(c.env,c.req.raw,target,'translate');
  const fields=await translateFields({courseTitle:target.sourceCourse.title,moduleTitle:target.sourceCourse.module.title,track:target.sourceCourse.track},
    target.course.language,target.course.country,operation.config,operation.request);
  await operation.recheck();const result=await repository.saveHeadings(target.id,input.expectedRevision,headingsInput.parse(fields) as ModuleHeadings);
  await operation.finish('saved');return c.json(result);
});
app.get('/api/v1/cms/modules/:id/export',async c=>{
  const draft=await contentRepository(c.env.CONTENT_DB,requestActor.get(c.req.raw)).getModule(c.req.param('id'));
  c.header('Content-Disposition','attachment; filename="'+draft.course.module.id+'.'+draft.course.language+'-'+draft.course.country.toLowerCase()+'.draft.json"');
  // This remains a draft export, including unreviewed editions; never a publication.
  return c.json(draft.course);
});
export default app;
