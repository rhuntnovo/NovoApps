import type {Course} from './types';
export type Edition={id:string;providerId:string;courseId:string;moduleId:string;language:string;country:string;label:string;path:string;contentVersion:string;publicationUrl?:string;media?:Record<string,string>};
export function parseCatalog(value:unknown):Edition[]{
  const document=value as {schema_version?:number;editions?:Edition[]};
  if(document?.schema_version!==1||!Array.isArray(document.editions)||!document.editions.length)throw Error('Invalid course library.');
  const ids=new Set<string>();
  for(const entry of document.editions){
    if(!entry||['id','providerId','courseId','moduleId','language','country','label','path','contentVersion'].some(key=>typeof entry[key as keyof Edition]!=='string'||!entry[key as keyof Edition])||ids.has(entry.id))throw Error('Invalid course edition.');
    let decoded:string;try{decoded=decodeURIComponent(entry.path);}catch{throw Error('Invalid course path.');}
    if(!/^\/(courses|delivery)\//.test(decoded)||decoded.includes('\\')||decoded.split('/').includes('..')||/[?#\u0000]/.test(decoded)||!decoded.endsWith('.json'))throw Error('Invalid course path.');
    ids.add(entry.id);
    if(entry.media)for(const [original,local] of Object.entries(entry.media)){
      if(!/^\/(assets|audio|icons)\//.test(original)||typeof local!=='string'||!/^(assets|audio|icons)\/[a-f0-9]{24}\.[a-z0-9]+$/.test(local))throw Error('Invalid delivery media map.');
    }
  }
  return document.editions;
}
export function resolveDeliveryCourse(document:Course,entry:Edition):Course{
  if(!entry.path.startsWith('/delivery/'))return document;
  const base=entry.path.slice(0,entry.path.lastIndexOf('/')+1);
  if(!entry.media)return {...document,asset_base_url:base};
  const resolve=(value:string)=>{const local=entry.media![value];if(!local)throw Error('A published media reference is missing.');return base+local;};
  return {...document,asset_base_url:undefined,
    provider:document.provider?{...document.provider,...(typeof document.provider.logo==='string'?{logo:resolve(document.provider.logo)}:{})}:undefined,
    module:{...document.module,pages:document.module.pages.map(page=>({...page,
      blocks:page.blocks.map(block=>block.image?{...block,image:{...block.image,src:resolve(block.image.src),small_src:block.image.small_src?resolve(block.image.small_src):undefined}}:block),
      guided:page.guided?{...page.guided,segments:page.guided.segments?.map(segment=>segment.audio?{...segment,audio:resolve(segment.audio)}:segment)}:undefined
    }))}};
}
export function editionFromUrl(search:string){const params=new URLSearchParams(search);return params.get('edition')||params.get('lang');}
export function chooseEdition(entries:Edition[],requested:string|null,saved:string|null){
  const find=(value:string|null)=>entries.find(entry=>entry.id===value||`${entry.language}-${entry.country.toLowerCase()}`===value?.toLowerCase()||entry.language===value?.toLowerCase());
  return find(requested)||find(saved)||entries.find(entry=>entry.language==='en')||entries[0];
}
export function rememberEdition(id:string){
  try{localStorage.setItem('novoapps.learning.edition',id);}catch{}
  const url=new URL(location.href);url.searchParams.set('edition',id);url.searchParams.delete('lang');history.replaceState(null,'',url.pathname+url.search+url.hash);
}
