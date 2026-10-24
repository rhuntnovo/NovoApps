import {v7} from 'uuid';
import {HTTPException} from 'hono/http-exception';
export type StorageEnvironment={CMS_STORAGE?:string;CMS_DATASET_LABEL?:string;DRAFT_MEDIA?:R2Bucket;PUBLISHED_CONTENT?:R2Bucket;
 PUBLIC_CONTENT_BASE_URL?:string;PUBLIC_CONTENT_BUCKET?:string;CONTENT_DB:D1Database};
export type AssetOwner={providerId:string;courseId:string;moduleId:string;pageId:string;blockId:string;locale:string};
export const r2Mode=(env:StorageEnvironment)=>env.CMS_STORAGE==='r2';
export function privateBucket(env:StorageEnvironment){if(!env.DRAFT_MEDIA)throw new HTTPException(503,{message:'Private media storage is not configured.'});return env.DRAFT_MEDIA;}
export function publicBucket(env:StorageEnvironment){if(!env.PUBLISHED_CONTENT)throw new HTTPException(503,{message:'Published content storage is not configured.'});return env.PUBLISHED_CONTENT;}
export function publicationSettings(env:StorageEnvironment){
 const value=env.PUBLIC_CONTENT_BASE_URL;if(!value)throw new HTTPException(503,{message:'Public content URL is not configured.'});
 const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new HTTPException(503,{message:'Use the public content bucket HTTPS origin.'});
 return {bucket:env.PUBLIC_CONTENT_BUCKET||'novoapps-content',publicBaseUrl:url.origin,backend:'r2' as const,managed:true};
}
export function mediaKey(path:string){
 if(!/^\/(assets|audio|icons)\/[a-zA-Z0-9_./-]+$/.test(path)||path.includes('//')||path.split('/').some(part=>part==='.'||part==='..')||path.length>1500)
  throw new HTTPException(400,{message:'Invalid media path.'});return 'media'+path;
}
export const sha256=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>)),byte=>byte.toString(16).padStart(2,'0')).join('');
export function decodeData(data:string,max=8*1024*1024){
 if(data.length>Math.ceil(max*4/3)+4||!data||data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw new HTTPException(400,{message:'Invalid or oversized media data.'});
 let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(data),value=>value.charCodeAt(0));}catch{throw new HTTPException(400,{message:'Invalid media data.'});}
 if(bytes.length>max||bytes.length<20)throw new HTTPException(400,{message:'Media file is empty or too large.'});return bytes;
}
const ascii=(bytes:Uint8Array,start:number,count:number)=>String.fromCharCode(...bytes.subarray(start,start+count));
// Read dimensions from encoded bytes, not the browser's untrusted width/height fields.
export function imageInfo(bytes:Uint8Array){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let width=0,height=0,type='',extension='';
 if(bytes.length>=30&&ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,4)==='WEBP'){
  type='image/webp';extension='webp';
  if(ascii(bytes,12,4)==='VP8X'){width=1+bytes[24]+bytes[25]*256+bytes[26]*65536;height=1+bytes[27]+bytes[28]*256+bytes[29]*65536;}
  else if(ascii(bytes,12,4)==='VP8 '&&ascii(bytes,23,3)==='\x9d\x01\x2a'){width=view.getUint16(26,true)&16383;height=view.getUint16(28,true)&16383;}
  else if(ascii(bytes,12,4)==='VP8L'&&bytes[20]===47){const bits=view.getUint32(21,true);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;}
 }else if(bytes.length>=33&&ascii(bytes,1,3)==='PNG'&&ascii(bytes,12,4)==='IHDR'){
  type='image/png';extension='png';width=view.getUint32(16);height=view.getUint32(20);
 }
 if(!width||!height||width>1536||height>4096||width*height>4000000)throw new HTTPException(400,{message:'Prepare a WebP or PNG image at most 1536 pixels wide before uploading.'});
 return {width,height,type,extension};
}
function opus(bytes:Uint8Array){
 if(bytes.length<47||ascii(bytes,0,4)!=='OggS'||bytes[4]!==0||!ascii(bytes,0,Math.min(bytes.length,512)).includes('OpusHead'))
  throw new HTTPException(400,{message:'Convert this recording to Ogg/Opus before uploading.'});
}
function segment(value:string){if(!/^[a-zA-Z0-9_-]{1,150}$/.test(value))throw new HTTPException(400,{message:'Invalid media ownership.'});return value;}
async function store(env:StorageEnvironment,owner:AssetOwner,actor:string,bytes:Uint8Array,path:string,type:string,source:string){
 const hash=await sha256(bytes),key=mediaKey(path),id=v7();
 const saved=await privateBucket(env).put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'},sha256:hash,
  httpMetadata:{contentType:type,cacheControl:'no-store'},customMetadata:{providerId:owner.providerId,courseId:owner.courseId,moduleId:owner.moduleId,sha256:hash}});
 if(!saved)throw new HTTPException(409,{message:'Media filename collision. Please retry.'});
 await env.CONTENT_DB.prepare('INSERT INTO cms_media_assets(id,module_id,provider_id,course_id,locale,page_id,block_id,path,storage_key,content_type,bytes,sha256,source,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .bind(id,owner.moduleId,owner.providerId,owner.courseId,owner.locale,owner.pageId,owner.blockId,path,key,type,bytes.length,hash,source,actor,Date.now()).run();
 return {sha256:hash};
}
export async function storePrepared(env:StorageEnvironment,owner:AssetOwner,actor:string,input:{data:string;smallData?:string;description?:string;source?:string},audio:boolean){
 const id=v7(),prefix=[owner.providerId,owner.courseId,owner.locale,owner.pageId,owner.blockId].map(segment).join('/');
 const bytes=decodeData(input.data),source=input.source==='ai'?'ai':'human';
 if(audio){opus(bytes);const path='/audio/cms/'+prefix+'/'+id+'.opus';const result=await store(env,owner,actor,bytes,path,'audio/ogg',source);return {audio:path,mimeType:'audio/ogg',...result};}
 const info=imageInfo(bytes),path='/assets/cms/'+prefix+'/'+id+'.'+info.extension;
 let small:Uint8Array|undefined,smallInfo:ReturnType<typeof imageInfo>|undefined;
 if(input.smallData){small=decodeData(input.smallData,4*1024*1024);smallInfo=imageInfo(small);if(smallInfo.width>384)throw new HTTPException(400,{message:'The small image must be at most 384 pixels wide.'});}
 const result=await store(env,owner,actor,bytes,path,info.type,source);
 const smallPath=smallInfo?'/assets/cms/'+prefix+'/'+id+'-384.'+smallInfo.extension:undefined;
 if(small&&smallInfo&&smallPath)await store(env,owner,actor,small,smallPath,smallInfo.type,source);
 return {image:{src:path,...(smallPath?{small_src:smallPath}:{}),width:info.width,height:info.height,alt:input.description||'',localization_policy:'LOCALIZE_IMAGE'},...result};
}
export function checkMediaOwnership(path:string,metadata:Record<string,string>|undefined,expected:{providerId:string;courseId:string;providerSlug?:string}){
 if(metadata?.providerId){if(metadata.providerId!==expected.providerId||metadata.courseId!==expected.courseId)throw new HTTPException(403,{message:'Media belongs to a different course.'});}
 else if(/^\/(assets|audio)\/cms\//.test(path)){
  // Imported filesystem media retains its old immutable provider/course path.
  const parts=path.split('/'),provider=parts[3],course=parts[4];
  if(!course||provider!==expected.providerId&&provider!==expected.providerSlug||course!==expected.courseId&&!course.endsWith('-'+expected.courseId))throw new HTTPException(403,{message:'Media belongs to a different course.'});
 }
}
export async function readPrivate(env:StorageEnvironment,path:string,range:string|undefined,expected?:{providerId:string;courseId:string;providerSlug?:string}){
 const bucket=privateBucket(env),key=mediaKey(path),head=await bucket.head(key);
 if(!head)throw new HTTPException(404,{message:'Media file not found.'});
 if(expected)checkMediaOwnership(path,head.customMetadata,expected);
 let requested:{offset:number;length:number}|undefined;
 if(range){const match=range.match(/^bytes=(\d+)-(\d*)$/);if(!match)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+head.size,'Cache-Control':'no-store'}});
  const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),head.size-1):head.size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=head.size)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+head.size,'Cache-Control':'no-store'}});
  requested={offset:start,length:end-start+1};
 }
 const object=await bucket.get(key,requested?{range:requested}:undefined);if(!object)throw new HTTPException(404,{message:'Media file not found.'});
 const headers=new Headers();object.writeHttpMetadata(headers);headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Accept-Ranges','bytes');headers.set('ETag',object.httpEtag);
 headers.set('Content-Length',String(requested?.length??object.size));
 if(requested)headers.set('Content-Range',`bytes ${requested.offset}-${requested.offset+requested.length-1}/${object.size}`);
 return new Response(object.body,{status:requested?206:200,headers});
}
