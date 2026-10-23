
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {courseSchema} from '@novoapps/content-model';

type Publication={url:string;manifestUrl:string};
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const part=(value:unknown)=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,150}$/.test(value))throw Error('Unsafe release identity');return value;};
function safePath(value:unknown){
 if(typeof value!=='string'||!value.length||value.startsWith('/')||!/^[A-Za-z0-9_./-]+$/.test(value)||value.split('/').some(p=>p==='..'||p===''))throw Error('Unsafe publication file path');
 if(value!=='course.json'&&!/^(audio|assets|icons)\//.test(value))throw Error('Unexpected publication file');
 return value;
}
async function download(url:string,request:typeof fetch){
 const response=await request(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Publication download failed: '+response.status);
 const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>30*1024*1024)throw Error('Publication file is too large');return bytes;
}
export async function stagePublications(publications:Publication[],publicDirectory:string,request:typeof fetch=fetch){
 const root=path.resolve(publicDirectory),catalogPath=path.join(root,'courses/catalog.json');
 let entries:any[]=[];try{entries=JSON.parse(await readFile(catalogPath,'utf8')).editions||[];}catch(error:any){if(error.code!=='ENOENT')throw error;}
 const newEntries:any[]=[];
 for(const publication of publications){
  const sourceUrl=new URL(publication.url),manifestUrl=new URL(publication.manifestUrl);
  if(sourceUrl.protocol!=='https:'||sourceUrl.username||sourceUrl.password||sourceUrl.search||sourceUrl.hash||!sourceUrl.pathname.endsWith('/course.json')||manifestUrl.href!==new URL('manifest.json',sourceUrl).href)throw Error('Use an immutable HTTPS course publication and its matching manifest');
  const manifestBytes=await download(manifestUrl.href,request),manifest=JSON.parse(new TextDecoder().decode(manifestBytes));
  const provider=part(manifest.provider),courseId=part(manifest.courseId),locale=part(manifest.locale),moduleId=part(manifest.moduleId),release=part(manifest.release);
  const folder=[provider,courseId,locale,'modules',moduleId,'releases',release].join('/')+'/';
  if(!sourceUrl.pathname.endsWith('/'+folder+'course.json'))throw Error('Publication path does not match its manifest');
  if(!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>1000)throw Error('Invalid publication manifest');
  const paths=new Set<string>(),files:{path:string;bytes:Uint8Array}[]=[];
  for(let start=0;start<manifest.files.length;start+=4){
   const downloaded=await Promise.all(manifest.files.slice(start,start+4).map(async(file:any)=>{
    const name=safePath(file.path);if(paths.has(name))throw Error('Duplicate manifest file');paths.add(name);
    if(!Number.isSafeInteger(file.bytes)||file.bytes<0||!(/^[0-9a-f]{64}$/).test(file.sha256))throw Error('Invalid file digest');
    const bytes=await download(new URL(name,sourceUrl).href,request);
    if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw Error('Published file checksum mismatch: '+name);
    return {path:name,bytes};
   }));files.push(...downloaded);
  }
  const courseFile=files.find(file=>file.path==='course.json');if(!courseFile)throw Error('Missing published course document');
  const course=courseSchema.parse(JSON.parse(new TextDecoder().decode(courseFile.bytes)));
  if(!course.provider||course.content_version!==release||course.module.id!==moduleId||course.language+'-'+course.country.toLowerCase()!==locale)throw Error('Course identity does not match the publication');
  const referencedMedia=new Set<string>();
  for(const page of course.module.pages){for(const block of page.blocks){if(block.image){referencedMedia.add(block.image.src);if(block.image.small_src)referencedMedia.add(block.image.small_src);}}
   for(const segment of page.guided?.segments||[])if(segment.audio)referencedMedia.add(segment.audio);}
  if(typeof course.provider.logo==='string')referencedMedia.add(course.provider.logo);
  for(const asset of referencedMedia)if(!paths.has(asset.replace(/^\//,'')))throw Error('Referenced media is missing from the publication: '+asset);
  const compact=(value:string,limit:number)=>value.length<=limit?value:value.slice(0,limit-13)+'-'+hash(new TextEncoder().encode(value)).slice(0,12);
  const relative='delivery/'+[compact(provider,20),compact(courseId,48),compact(locale,13),compact(moduleId,24),release].join('/')+'/',target=path.resolve(root,relative);
  if(!target.startsWith(root+path.sep))throw Error('Delivery path leaves public directory');
  // Keep source course/media bytes unchanged while flattening delivery assets for Windows/Git.
  const media:Record<string,string>={},deliveryFiles:any[]=[],destinations=new Map<string,string>();
  for(const file of files){
   const original=manifest.files.find((item:any)=>item.path===file.path);
   const local=file.path==='course.json'?'course.json':file.path.split('/')[0]+'/'+original.sha256.slice(0,24)+path.extname(file.path);
   if(destinations.has(local)&&destinations.get(local)!==original.sha256)throw Error('Delivery asset hash collision');
   destinations.set(local,original.sha256);
   if(file.path!=='course.json')media['/'+file.path]=local;
   const destination=path.join(target,local);
   if(destination.length>=250)throw Error('Delivery path is too long for Windows source tools');
   await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,file.bytes);
   deliveryFiles.push({...original,path:local,sourcePath:file.path});
  }
  await writeFile(path.join(target,'manifest.json'),JSON.stringify({...manifest,source:{url:sourceUrl.href,manifestUrl:manifestUrl.href,manifestSha256:hash(manifestBytes)},files:deliveryFiles},null,2));
  const entry={id:[provider,courseId,moduleId,locale].join('/'),providerId:course.provider.id,courseId:course.course_id,moduleId,
   language:course.language,country:course.country,label:course.language==='en'?'English':course.language==='es'?'Español'+(locale==='es-ni'?' (Nicaragua)':''):new Intl.DisplayNames(['en'],{type:'language'}).of(course.language)||course.language,
   path:'/'+relative+'course.json',contentVersion:release,publicationUrl:sourceUrl.href,media};
  entries=entries.filter(old=>!(old.providerId===entry.providerId&&old.courseId===entry.courseId&&old.moduleId===entry.moduleId&&old.language===entry.language&&old.country.toLowerCase()===entry.country.toLowerCase()));
  entries.push(entry);newEntries.push(entry);
 }
 entries.sort((a,b)=>(a.providerId+a.courseId+a.moduleId).localeCompare(b.providerId+b.courseId+b.moduleId)||(a.language==='en'?-1:b.language==='en'?1:a.language.localeCompare(b.language)));
 const catalog={schema_version:1,editions:entries};
 await mkdir(path.dirname(catalogPath),{recursive:true});const temporary=catalogPath+'.tmp';await writeFile(temporary,JSON.stringify(catalog,null,2)+'\n');await rename(temporary,catalogPath);
 return newEntries;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const file=process.argv[2];if(!file)throw Error('Usage: npm run stage:learning -- <publication-results.json>');
 const publications=JSON.parse(await readFile(file,'utf8'));
 const entries=await stagePublications(publications,fileURLToPath(new URL('../newvines-learning/public',import.meta.url)));
 console.log('Staged verified published editions: '+entries.map(entry=>entry.label).join(', '));
}
