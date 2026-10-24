import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import ffmpeg from 'ffmpeg-static';
import sharp from 'sharp';

const repo=fileURLToPath(new URL('../../..',import.meta.url));
const state=path.resolve(process.env.CMS_MEDIA_STATE||path.join(repo,'services/api-worker/.wrangler/media'));
const legacy=path.join(repo,'newvines-learning/public');
const port=Number(process.env.CMS_MEDIA_PORT||8789);
const cmsOrigin=process.env.CMS_ORIGIN||'http://127.0.0.1:5174';
const origins=new Set([cmsOrigin]);for(const name of ['localhost','127.0.0.1']){const u=new URL(cmsOrigin);u.hostname=name;origins.add(u.origin);}
const mime={'.opus':'audio/ogg','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
const safePart=value=>String(value).normalize('NFKD').replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,150)||'item';
function safeFile(root,key){const target=path.resolve(root,key.replace(/^\/+/,''));if(!target.startsWith(root+path.sep)||key.includes('..')||key.includes('\\'))throw Error('Unsafe media path');return target;}
async function json(request){let size=0;const chunks=[];for await(const chunk of request){size+=chunk.length;if(size>40*1024*1024)throw Error('Upload exceeds 40 MB');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
async function put(key,data){const target=safeFile(state,key);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,data);return '/'+key;}
function context(input){
 if(!input||!['provider','course','locale','page','block'].every(key=>typeof input[key]==='string'&&input[key].length>0&&input[key].length<200))throw Error('Missing media ownership');
 return ['cms',input.provider,input.course,input.locale,input.page,input.block].map(safePart).join('/');
}
async function command(binary,args,timeout=120000){return new Promise((resolve,reject)=>{
 const child=spawn(binary,args,{cwd:repo,windowsHide:true,stdio:['ignore','pipe','pipe']});let stderr='';
 child.stderr.on('data',chunk=>{stderr+=chunk.toString().slice(0,2000);});
 const timer=setTimeout(()=>{child.kill();reject(Error('Media operation timed out'));},timeout);
 child.once('error',()=>{clearTimeout(timer);reject(Error('Media tool is unavailable'));});
 child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Media operation failed. Check the input file and local tool configuration.'));});
 });}
async function settings(){try{return JSON.parse(await readFile(path.join(state,'settings.json'),'utf8'));}catch{return {bucket:'novoapps-content',publicBaseUrl:''};}}
async function localMedia(key){try{return await readFile(safeFile(state,key));}catch{return readFile(safeFile(legacy,key));}}
async function uploadR2(bucket,key,file,type){
 if(process.env.CMS_PUBLISH_TEST_DIR){const target=safeFile(path.resolve(process.env.CMS_PUBLISH_TEST_DIR),bucket+'/'+key);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,await readFile(file));return;}
 const cli=path.join(repo,'node_modules/wrangler/bin/wrangler.js');
 await command(process.execPath,[cli,'r2','object','put',bucket+'/'+key,'--file',file,'--content-type',type,'--cache-control',(key==='robots.txt'||key.endsWith('/latest.json'))?'no-store':'public, max-age=31536000, immutable','--remote'],180000);
}
const publishing=new Set();
export async function handle(request,response){
 response.setHeader('X-Robots-Tag','noindex, nofollow, nosnippet, noimageindex');
 let publicationKey;
 const send=(status,data)=>{response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify(data));};
 try{
  const url=new URL(request.url,'http://127.0.0.1:'+port),host=(request.headers.host||'').split(':')[0];
  if(!['127.0.0.1','localhost'].includes(host))return send(403,{error:'Local media service only'});
  if(process.env.CMS_MEDIA_SECRET&&url.pathname!=='/health'&&url.pathname!=='/robots.txt'&&request.headers['x-cms-bridge']!==process.env.CMS_MEDIA_SECRET)return send(401,{error:'Use the authenticated CMS API.'});
  if(request.headers.origin&&!origins.has(request.headers.origin))return send(403,{error:'Origin not allowed'});
  if(request.method==='GET'&&(url.pathname.startsWith('/audio/cms/')||url.pathname.startsWith('/assets/cms/'))){
   const key=decodeURIComponent(url.pathname).replace(/^\//,'');const data=await readFile(safeFile(state,key));
   const headers={'Content-Type':mime[path.extname(key)]||'application/octet-stream','Cache-Control':'private, max-age=31536000, immutable','Accept-Ranges':'bytes'};
   const range=request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
   if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),data.length-1):data.length-1;if(start>end||start>=data.length){response.writeHead(416,{'Content-Range':'bytes */'+data.length});response.end();return;}
    response.writeHead(206,{...headers,'Content-Range':'bytes '+start+'-'+end+'/'+data.length,'Content-Length':end-start+1});response.end(data.subarray(start,end+1));return;}
   response.writeHead(200,{...headers,'Content-Length':data.length});response.end(data);return;
  }
  if(request.method==='GET'&&url.pathname==='/robots.txt'){response.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});response.end(await readFile(new URL('../public/robots.txt',import.meta.url)));return;}
  if(request.method==='GET'&&url.pathname==='/health')return send(200,{status:'ok',ffmpeg:!!ffmpeg,authenticatedBridge:!!process.env.CMS_MEDIA_SECRET});
  if(request.method==='GET'&&url.pathname==='/settings')return send(200,await settings());
  if(request.method!=='POST'||!request.headers['content-type']?.startsWith('application/json'))return send(415,{error:'Use JSON authoring requests'});
  const input=await json(request);
  if(url.pathname==='/settings'){
   if(!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(input.bucket))throw Error('Use a valid R2 bucket name');
   const base=new URL(input.publicBaseUrl);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw Error('Use the HTTPS public content URL');
   await mkdir(state,{recursive:true});const result={bucket:input.bucket,publicBaseUrl:base.href.replace(/\/$/,'')};await writeFile(path.join(state,'settings.json'),JSON.stringify(result));return send(200,result);
  }
  if(url.pathname==='/audio'){
   const prefix=context(input.context),id=randomUUID(),bytes=Buffer.from(input.data||'','base64');
   if(bytes.length<50||bytes.length>25*1024*1024)throw Error('Choose a recording under 25 MB');
   const staging=path.join(state,'staging',id);await mkdir(staging,{recursive:true});
   const source=path.join(staging,'input'),target=path.join(staging,'output.opus');await writeFile(source,bytes);
   await command(ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-protocol_whitelist','file,pipe','-i',source,'-vn','-t','600','-ac','1','-ar','48000','-c:a','libopus','-b:a','32k','-application','voip',target]);
   const audio=await put('audio/'+prefix+'/'+id+'.opus',await readFile(target));
   return send(201,{audio,mimeType:'audio/ogg',sha256:createHash('sha256').update(await readFile(target)).digest('hex')});
  }
  if(url.pathname==='/image'){
   const prefix=context(input.context),id=randomUUID(),bytes=Buffer.from(input.data||'','base64');
   if(bytes.length<20||bytes.length>20*1024*1024)throw Error('Choose an image under 20 MB');
   const image=sharp(bytes,{limitInputPixels:40000000,animated:false}).rotate();
   const main=await image.clone().resize({width:768,withoutEnlargement:true}).webp({quality:80}).toBuffer({resolveWithObject:true});
   const small=await image.clone().resize({width:384,withoutEnlargement:true}).webp({quality:78}).toBuffer();
   const src=await put('assets/'+prefix+'/'+id+'.webp',main.data),small_src=await put('assets/'+prefix+'/'+id+'-384.webp',small);
   return send(201,{image:{src,small_src,width:main.info.width,height:main.info.height,alt:String(input.description||'').slice(0,2000),localization_policy:'LOCALIZE_IMAGE'}});
  }
  if(url.pathname==='/publish'){
   const config=await settings();if(!config.publicBaseUrl)throw Error('Configure the R2 bucket and public content URL first');
   if(input.confirm!==true||!input.course||!Array.isArray(input.media))throw Error('Publication confirmation is required');
   const prefix=[safePart(input.provider),safePart(input.courseId),safePart(input.locale)].join('/');
   publicationKey=prefix+'/modules/'+safePart(input.moduleId);if(publishing.has(publicationKey)){publicationKey=undefined;return send(409,{error:'This module is already being published. Wait for it to finish.'});}publishing.add(publicationKey);
   const release=randomUUID(),releaseKey=prefix+'/modules/'+safePart(input.moduleId)+'/releases/'+release;
   const staging=path.join(state,'publications',release);await mkdir(staging,{recursive:true});
   const manifest={release,createdAt:new Date().toISOString(),provider:input.provider,courseId:input.courseId,locale:input.locale,moduleId:input.moduleId,approval:input.approval,files:[]};
   const objects=[];
   for(const media of [...new Set(input.media)]){
    if(typeof media!=='string'||!/^\/(assets|audio|icons)\//.test(media))throw Error('Invalid publication media path');
    const key=media.replace(/^\//,'');const data=await localMedia(key),file=safeFile(staging,key);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,data);
    const type=mime[path.extname(key)]||'application/octet-stream';objects.push({key:releaseKey+'/'+key,file,type});
    manifest.files.push({path:key,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
   }
   const course={...input.course,asset_base_url:config.publicBaseUrl+'/'+releaseKey+'/',content_version:release};
   const courseFile=path.join(staging,'course.json'),courseData=JSON.stringify(course);await writeFile(courseFile,courseData);manifest.files.push({path:'course.json',bytes:Buffer.byteLength(courseData),sha256:createHash('sha256').update(courseData).digest('hex')});objects.push({key:releaseKey+'/course.json',file:courseFile,type:'application/json'});
   const manifestFile=path.join(staging,'manifest.json');await writeFile(manifestFile,JSON.stringify(manifest));objects.push({key:releaseKey+'/manifest.json',file:manifestFile,type:'application/json'});
   // Resolve all course files before the first cloud write.
   // R2 does not interpret Static Assets _headers files; robots.txt belongs at the host root.
   const robotsFile=path.join(staging,'robots.txt');await writeFile(robotsFile,await readFile(new URL('../public/robots.txt',import.meta.url)));
   await uploadR2(config.bucket,'robots.txt',robotsFile,'text/plain; charset=utf-8');
   for(const object of objects)await uploadR2(config.bucket,object.key,object.file,object.type);
   const latest={release,url:config.publicBaseUrl+'/'+releaseKey+'/course.json',manifestUrl:config.publicBaseUrl+'/'+releaseKey+'/manifest.json'};
   const latestFile=path.join(staging,'latest.json');await writeFile(latestFile,JSON.stringify(latest));
   await uploadR2(config.bucket,prefix+'/modules/'+safePart(input.moduleId)+'/latest.json',latestFile,'application/json');
   return send(201,{...latest,folder:prefix,bucket:config.bucket,files:objects.length+2});
  }
  return send(404,{error:'Unknown media operation'});
 }catch(error){const missing=error?.code==='ENOENT';send(missing?404:400,{error:missing?'Media file not found':error.message||'Media operation failed'});}finally{if(publicationKey)publishing.delete(publicationKey);}
}
if(process.env.NODE_ENV!=='test')http.createServer((req,res)=>void handle(req,res)).listen(port,'127.0.0.1',()=>console.log('Local CMS media service ready on '+port));
