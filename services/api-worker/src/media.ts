import {r2Mode,publicationSettings,storePrepared,privateBucket,type StorageEnvironment} from './r2-storage';
import {publishR2} from './r2-publishing';
import {requestActor} from './authorization';
import {Hono} from 'hono';
import {z} from 'zod';
import {contentRepository,ContentError} from './repository';
import {aiConfiguration,type AIEnvironment} from './translation';
import {courseSchema,type AuthoringModule} from '@novoapps/content-model';

type Env={CONTENT_DB:D1Database;CMS_MEDIA_URL?:string;CMS_MEDIA_SECRET?:string}&AIEnvironment&StorageEnvironment;
const base=(env:Env)=>env.CMS_MEDIA_URL||'http://127.0.0.1:8789';
async function bridge(env:Env,path:string,body?:unknown){
 let result:Response;
 try{result=await fetch(base(env)+path,body===undefined?{headers:{'X-CMS-Bridge':env.CMS_MEDIA_SECRET||''}}:{method:'POST',headers:{'Content-Type':'application/json','X-CMS-Bridge':env.CMS_MEDIA_SECRET||''},body:JSON.stringify(body)});}
 catch{throw new ContentError(503,'Start the local CMS media service using npm run dev:cms.');}
 const data=await result.json() as any;
 if(!result.ok)throw new ContentError(400,data.error||'Media operation failed');
 return data;
}
async function body(request:Request,limit=38*1024*1024){const text=await request.text();if(text.length>limit)throw new ContentError(400,'Media input is too large');try{return JSON.parse(text);}catch{throw new ContentError(400,'Invalid media request');}}
const inputSchema=z.object({expectedRevision:z.number().int().positive(),blockId:z.string().min(1).max(150),
 script:z.string().max(4096).optional(),description:z.string().min(1).max(2000).optional(),
 prepared:z.boolean().optional(),smallData:z.string().max(6*1024*1024).optional(),source:z.enum(['human','ai']).optional(),
 textContext:z.string().max(20000).optional(),data:z.string().max(35*1024*1024).optional()});
async function ownership(env:Env,moduleId:string,pageId:string,input:z.infer<typeof inputSchema>){
 const repo=contentRepository(env.CONTENT_DB),module=await repo.getModule(moduleId),page=module.pages.find(page=>page.id===pageId);
 if(!page)throw new ContentError(404,'Page not found');
 if(page.revision!==input.expectedRevision)throw new ContentError(409,'The saved page changed. Reload before creating media.');
 const document=module.course.module.pages.find(item=>item.id===page.canonicalId)!;
 if(!document.blocks.some(block=>block.id===input.blockId))throw new ContentError(400,'Save this block before creating media.');
 const primary=module.sourceModuleId?await repo.getModule(module.sourceModuleId):module;
 return {module,page,document,assetOwner:{providerId:module.provider.id,courseId:primary.courseId,moduleId:module.id,pageId:page.id,blockId:input.blockId,locale:module.course.language+'-'+module.course.country.toLowerCase()},context:{provider:module.provider.slug,course:module.course.course_id.slice(0,70)+'-'+primary.courseId,
  locale:module.course.language+'-'+module.course.country.toLowerCase(),page:page.id+'-'+page.canonicalId.slice(0,60),block:input.blockId}};
}
async function aiRequest(env:Env,url:string,payload:unknown){
 const {apiKey}=aiConfiguration(env);if(!apiKey)throw new ContentError(503,'No OpenAI key is saved in this API session. Open AI Settings, paste your key, and click Save Settings. Restarting the local API clears session keys.');
 let response:Response;
 try{response=await fetch('https://api.openai.com/v1/'+url,{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
 body:JSON.stringify(payload),signal:AbortSignal.timeout(180000)});}catch{throw new ContentError(502,'OpenAI generation timed out. Existing media was retained.');}
 if(!response.ok)throw new ContentError(502,response.status===401?'OpenAI did not accept the configured key.':response.status===429?'OpenAI quota or rate limit reached.':'OpenAI could not generate this media. Existing media was retained.');
 return response;
}
function encode(bytes:Uint8Array){let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);}
export const mediaRoutes=new Hono<{Bindings:Env}>();
mediaRoutes.get('/media-capabilities',c=>c.json({backend:r2Mode(c.env)?'r2':'filesystem',processing:r2Mode(c.env)?'browser':'local-helper'}));
mediaRoutes.get('/media-tools/:name',async c=>{
 if(!r2Mode(c.env))throw new ContentError(404,'Browser conversion is not enabled.');
 const name=c.req.param('name');if(!['ffmpeg-core.js','ffmpeg-core.wasm'].includes(name))throw new ContentError(404,'Tool not found.');
 const object=await privateBucket(c.env).get('tools/ffmpeg/0.12.10/'+name);if(!object)throw new ContentError(503,'Import the private CMS conversion tools before recording.');
 return c.newResponse(object.body,{headers:{'Content-Type':name.endsWith('.wasm')?'application/wasm':'application/javascript','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
});
mediaRoutes.get('/storage-settings',async c=>c.json(r2Mode(c.env)?publicationSettings(c.env):await bridge(c.env,'/settings')));
mediaRoutes.put('/storage-settings',async c=>{
 const input=z.object({bucket:z.string().min(3).max(63),publicBaseUrl:z.string().url()}).parse(await body(c.req.raw));
 if(r2Mode(c.env)){const config=publicationSettings(c.env);if(input.bucket!==config.bucket||input.publicBaseUrl.replace(/\/$/,'')!==config.publicBaseUrl)throw new ContentError(400,'Cloud publication destinations are managed in the Worker configuration.');return c.json(config);}
 return c.json(await bridge(c.env,'/settings',input));
});
mediaRoutes.post('/modules/:moduleId/pages/:pageId/media/:kind',async c=>{
 const input=inputSchema.parse(await body(c.req.raw,r2Mode(c.env)?18*1024*1024:38*1024*1024)),kind=c.req.param('kind');
 if(!['recording','speech','image-upload','image-generate'].includes(kind))throw new ContentError(404,'Unknown media operation');
 if((kind==='image-upload'||kind==='image-generate')&&!input.description?.trim())throw new ContentError(400,'Enter an image description first.');
 const owner=await ownership(c.env,c.req.param('moduleId'),c.req.param('pageId'),input);
 let data=input.data;
 if(kind==='speech'){
  if(!input.script?.trim())throw new ContentError(400,'Enter narration text first.');
  const response=await aiRequest(c.env,'audio/speech',{model:'gpt-4o-mini-tts',voice:'marin',input:input.script,response_format:'opus',
   instructions:'Read this educational narration clearly and naturally in '+owner.module.course.language+' for '+owner.module.course.country+'. Do not add any words.'});
  data=encode(new Uint8Array(await response.arrayBuffer()));
 }
 if(kind==='image-generate'){
  const block=owner.document.blocks.find(item=>item.id===input.blockId)!;
  const response=await aiRequest(c.env,'images/generations',{model:'gpt-image-2',n:1,size:'1536x1024',quality:'medium',output_format:'webp',
   prompt:'Create a context-appropriate educational illustration for this course. Country/region: '+owner.module.course.country+'. Language: '+owner.module.course.language+
    '. Teaching context: '+(input.textContext||block.text)+'. Requested image: '+input.description+'. No captions, lettering, watermarks or logos. Retain the meaning of the text; avoid adding claims.'});
  const output=await response.json() as {data?:{b64_json?:string}[]};data=output.data?.[0]?.b64_json;
  if(r2Mode(c.env)){if(!data)throw new ContentError(502,'No image was generated.');await ownership(c.env,c.req.param('moduleId'),c.req.param('pageId'),input);return c.json({generatedImage:{data,mimeType:'image/webp'},requiresPreparation:true},201);}
 }
 if(!data)throw new ContentError(400,'No media was supplied.');
 // Recheck after lengthy generation; never attach stale output to a newer saved page.
 await ownership(c.env,c.req.param('moduleId'),c.req.param('pageId'),input);
 const audio=kind==='recording'||kind==='speech';
 let result;
 if(r2Mode(c.env)){
  const actor=requestActor.get(c.req.raw);if(!actor)throw new ContentError(503,'Authenticated media author is required.');
  if(kind!=='speech'&&!input.prepared)throw new ContentError(400,'Prepare media in the CMS browser before uploading.');
  result=await storePrepared(c.env,owner.assetOwner,actor,{...input,data,source:kind==='speech'?'ai':input.source},audio);
 }else result=await bridge(c.env,audio?'/audio':'/image',{context:owner.context,data,description:input.description});
 return c.json({...result,source:kind==='speech'||kind==='image-generate'||input.source==='ai'?'ai':'human',voice:kind==='speech'?'marin':undefined},201);
});
function mediaPaths(module:AuthoringModule){
 const paths=new Set<string>();
 for(const page of module.course.module.pages){for(const block of page.blocks){if(block.image){paths.add(block.image.src);if(block.image.small_src)paths.add(block.image.small_src);}}
  for(const segment of page.guided?.segments||[])if(segment.audio)paths.add(segment.audio);}
 if(module.provider.slug==='new-vines')paths.add('/assets/NVI-logo-clear.png');
 return [...paths];
}
mediaRoutes.post('/modules/:id/publish',async c=>{
 const input=z.object({confirm:z.literal(true),approvePrimaryWording:z.boolean(),structureRevision:z.number().int().positive(),
  metadataRevision:z.number().int().positive(),pages:z.record(z.string(),z.number().int().positive())}).parse(await body(c.req.raw));
 const module=await contentRepository(c.env.CONTENT_DB).getModule(c.req.param('id'));
 if(module.structureRevision!==input.structureRevision||module.metadataRevision!==input.metadataRevision||
  Object.keys(input.pages).length!==module.pages.length||module.pages.some(page=>input.pages[page.id]!==page.revision))
  throw new ContentError(409,'Saved content changed. Review the latest module before publishing.');
 if(module.sourceModuleId&&module.pages.some(page=>page.translationStatus!=='reviewed'||page.needsUpdate))
  throw new ContentError(400,'Review every translated page against the current primary language before publishing.');
 if(!module.sourceModuleId&&module.pages.some(page=>page.wordingReviewRequired)&&!input.approvePrimaryWording)
  throw new ContentError(400,'Explicit approval of saved primary-language wording changes is required.');
 const primary=module.sourceModuleId?await contentRepository(c.env.CONTENT_DB).getModule(module.sourceModuleId):module;
 const course=courseSchema.parse({...module.course,provider:{id:module.provider.id,name:module.provider.name,
  ...(module.provider.slug==='new-vines'?{logo:'/assets/NVI-logo-clear.png'}:{})}});
 const publication={confirm:true,provider:module.provider.slug,
  courseId:module.course.course_id.slice(0,70)+'-'+primary.courseId,moduleId:module.course.module.id,
  locale:module.course.language+'-'+module.course.country.toLowerCase(),course,media:mediaPaths(module),
  approval:{...input,at:new Date().toISOString(),mode:requestActor.has(c.req.raw)?'authenticated-owner':'local-author',actorId:requestActor.get(c.req.raw)}};
 if(r2Mode(c.env)){
  const actor=requestActor.get(c.req.raw);if(!actor)throw new ContentError(503,'Authenticated publisher is required.');
  const recheck=async()=>{const latest=await contentRepository(c.env.CONTENT_DB).getModule(module.id);
   if(latest.structureRevision!==input.structureRevision||latest.metadataRevision!==input.metadataRevision||latest.pages.length!==module.pages.length||latest.pages.some(page=>input.pages[page.id]!==page.revision||latest.sourceModuleId&&page.needsUpdate))throw new ContentError(409,'Content or its primary source changed during publishing. Review the latest version.');};
  return c.json(await publishR2(c.env,module.id,actor,publication,recheck),201);
 }
 return c.json(await bridge(c.env,'/publish',publication),201);
});
