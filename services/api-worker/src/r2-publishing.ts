import {v7} from 'uuid';
import {HTTPException} from 'hono/http-exception';
import {privateBucket,publicBucket,publicationSettings,mediaKey,sha256,checkMediaOwnership,type StorageEnvironment} from './r2-storage';
type Package={provider:string;courseId:string;moduleId:string;locale:string;course:any;media:string[];approval:any};
const immutable='public, max-age=31536000, immutable';
const part=(value:string)=>{if(!/^[a-zA-Z0-9_-]{1,150}$/.test(value))throw new HTTPException(400,{message:'Invalid publication identity.'});return value;};
// R2's immutable release is complete before latest.json changes. D1 leases span
// Worker instances; conditional R2 writes also prevent stale pointer replacement.
export async function publishR2(env:StorageEnvironment,moduleId:string,actor:string,input:Package,recheck:()=>Promise<void>){
 const config=publicationSettings(env),draft=privateBucket(env),target=publicBucket(env),id=v7(),now=Date.now();
 const prefix=[input.provider,input.courseId,input.locale].map(part).join('/')+'/modules/'+part(input.moduleId),pointerKey=prefix+'/latest.json',releaseKey=prefix+'/releases/'+id;
 const lock=await env.CONTENT_DB.prepare('INSERT INTO cms_publication_leases(module_id,release_id,expires_at) VALUES(?,?,?) ON CONFLICT(module_id) DO UPDATE SET release_id=excluded.release_id,expires_at=excluded.expires_at WHERE cms_publication_leases.expires_at<? RETURNING release_id')
  .bind(moduleId,id,now+15*60000,now).first<{release_id:string}>();
 if(lock?.release_id!==id)throw new HTTPException(409,{message:'This module is already being published. Wait for it to finish.'});
 let recorded=false,activated=false,activatedResult:{auditPending:boolean}|undefined;
 try{
  await env.CONTENT_DB.prepare("INSERT INTO cms_publications(id,module_id,status,snapshot_json,created_by,created_at,pointer_key) VALUES(?,?,'preparing',?,?,?,?)").bind(id,moduleId,JSON.stringify(input.approval),actor,now,pointerKey).run();recorded=true;
  const previous=await target.head(pointerKey),objects=[];
  const putImmutable=async(key:string,value:Parameters<R2Bucket['put']>[1],options:R2PutOptions)=>{const result=await target.put(key,value,{...options,onlyIf:{etagDoesNotMatch:'*'}});if(!result)throw new HTTPException(409,{message:'An immutable release object already exists. Retry with a new release.'});return result;};
  // Resolve/check every private object before the first public write.
  for(const path of [...new Set(input.media)]){
   const key=mediaKey(path),head=await draft.head(key);if(!head)throw new HTTPException(409,{message:'A saved media file is missing from private storage. Upload/import it before publishing.'});
   const primaryCourseId=input.courseId.slice(-36);
   checkMediaOwnership(path,head.customMetadata,{providerId:input.course.provider.id,courseId:primaryCourseId,providerSlug:input.provider});
   objects.push({path,key,head});
  }
  await recheck();
  const files:{path:string;bytes:number;sha256:string}[]=[];
  for(const item of objects){
   const object=await draft.get(item.key);if(!object||object.etag!==item.head.etag)throw new HTTPException(409,{message:'Private media changed during publishing. Retry after saving.'});
   // One file is buffered at a time, with a bounded upload size; no full-course buffer.
   if(object.size>25*1024*1024)throw new HTTPException(413,{message:'Publication media is too large.'});
   const bytes=new Uint8Array(await object.arrayBuffer()),hash=await sha256(bytes);
   if(item.head.customMetadata?.sha256&&item.head.customMetadata.sha256!==hash)throw new HTTPException(409,{message:'Private media checksum does not match.'});
   await putImmutable(releaseKey+item.path,bytes,{onlyIf:{etagDoesNotMatch:'*'},sha256:hash,httpMetadata:{contentType:object.httpMetadata?.contentType||'application/octet-stream',cacheControl:immutable}});
   files.push({path:item.path.slice(1),bytes:bytes.length,sha256:hash});
  }
  const course={...input.course,asset_base_url:config.publicBaseUrl+'/'+releaseKey+'/',content_version:id};
  const courseBytes=new TextEncoder().encode(JSON.stringify(course));
  await putImmutable(releaseKey+'/course.json',courseBytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',cacheControl:immutable}});
  files.push({path:'course.json',bytes:courseBytes.length,sha256:await sha256(courseBytes)});
  const manifest={release:id,createdAt:new Date(now).toISOString(),provider:input.provider,courseId:input.courseId,locale:input.locale,moduleId:input.moduleId,approval:input.approval,files};
  await putImmutable(releaseKey+'/manifest.json',JSON.stringify(manifest),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',cacheControl:immutable}});
  await recheck();
  const lease=await env.CONTENT_DB.prepare('SELECT release_id FROM cms_publication_leases WHERE module_id=? AND expires_at>?').bind(moduleId,Date.now()).first<{release_id:string}>();
  if(lease?.release_id!==id)throw new HTTPException(409,{message:'Publication lease expired. The previous release remains active.'});
  const latest={release:id,url:config.publicBaseUrl+'/'+releaseKey+'/course.json',manifestUrl:config.publicBaseUrl+'/'+releaseKey+'/manifest.json'};
  // Keep crawler exclusions at the actual public bucket root.
  await target.put('robots.txt','User-agent: *\nDisallow: /\n',{httpMetadata:{contentType:'text/plain; charset=utf-8',cacheControl:'no-store'}});
  const pointer=await target.put(pointerKey,JSON.stringify(latest),{onlyIf:previous?{etagMatches:previous.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',cacheControl:'no-store'}});
  if(!pointer)throw new HTTPException(409,{message:'The published pointer changed. The newer release was retained.'});
  activated=true;
  let auditPending=false;
  try{await env.CONTENT_DB.prepare("UPDATE cms_publications SET status='published',completed_at=? WHERE id=?").bind(Date.now(),id).run();}catch{auditPending=true;}
  const result={auditPending,...latest,folder:prefix.slice(0,prefix.indexOf('/modules/')),bucket:config.bucket,files:files.length+3};activatedResult=result;return result;
 }catch(error){
  // A crash after R2 activation is reconciled from latest.json; never claim a live
  // complete release failed or roll its pointer back after a D1 bookkeeping error.
  if(recorded&&!activated)await env.CONTENT_DB.prepare("UPDATE cms_publications SET status='failed',completed_at=?,error='Publication did not activate' WHERE id=?").bind(Date.now(),id).run();
  throw error;
 }finally{
  try{await env.CONTENT_DB.prepare('DELETE FROM cms_publication_leases WHERE module_id=? AND release_id=?').bind(moduleId,id).run();}
  catch{if(activatedResult)activatedResult.auditPending=true;} // Lease expires safely; retain the original failure or completed release.
 }
}
