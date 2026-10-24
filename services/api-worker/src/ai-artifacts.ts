import {control,type AuthEnvironment,type Principal} from './auth';
import {capabilities,textHash} from './ai';
import type {AuthoringModule,CoursePage} from '@novoapps/content-model';
export type ReviewedArtifact={blockId:string;image?:any;audio?:string;script?:string};
export async function reviewerArtifacts(env:AuthEnvironment,request:Request,who:Principal,module:AuthoringModule,pageId:string,after:CoursePage):Promise<ReviewedArtifact[]>{
 const caps=await capabilities(env,request,module);
 const rows=(await control(env).prepare('SELECT block_id,metadata_json FROM cms_ai_artifact WHERE actor_id=? AND module_id=? AND page_id=?').bind(who.user.id,module.id,pageId).all<{block_id:string;metadata_json:string}>()).results;
 const allowed:ReviewedArtifact[]=[];
 for(const row of rows){const item=JSON.parse(row.metadata_json);
  if(caps.images&&item.image)allowed.push({blockId:row.block_id,image:item.image});
  const segment=after.guided?.segments?.find(segment=>segment.block_id===row.block_id);
  if(caps.narration&&item.audio&&segment&&await textHash(segment.text)===item.scriptHash)allowed.push({blockId:row.block_id,audio:item.audio,script:segment.text});
 }
 return allowed;
}
export async function markArtifactsSaved(env:AuthEnvironment,actor:string|undefined,pageId:string,page:CoursePage){
 if(env.AUTH_REQUIRED!=='true'||!actor)return;
 const rows=(await control(env).prepare('SELECT activity_id,block_id,metadata_json FROM cms_ai_artifact WHERE actor_id=? AND page_id=?').bind(actor,pageId).all<{activity_id:string;block_id:string;metadata_json:string}>()).results;
 for(const row of rows){const item=JSON.parse(row.metadata_json),image=page.blocks.find(block=>block.id===row.block_id)?.image,segment=page.guided?.segments?.find(segment=>segment.block_id===row.block_id);
  if(item.image&&image?.src===item.image.src||item.audio&&segment&&segment.audio===item.audio&&await textHash(segment.text)===item.scriptHash)await control(env).prepare("UPDATE cms_ai_activity SET application_status='saved' WHERE id=?").bind(row.activity_id).run();
 }
}
