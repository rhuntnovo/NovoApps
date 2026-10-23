import { z } from 'zod';
import { pageSchema, type CoursePage, type PublishedCourse } from './index';

export const NVI_PROVIDER_ID = '019a0640-0000-7000-8000-000000000001';
const shortText = z.string().trim().min(1).max(200);
export const localeInput = z.object({
  language: z.string().trim().regex(/^[a-z]{2,3}(-[A-Za-z]{4})?$/, 'Use a language code, for example es'),
  region: z.string().trim().regex(/^(global|[A-Z]{2}|[0-9]{3})$/, 'Use global, a country code such as NI, or a numeric region')
});
export const providerInput = z.object({name:shortText,slug:z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)});
export const courseInput = localeInput.extend({providerId:z.string().uuid(),title:shortText,code:shortText,track:z.string().max(200).default('')});
export const moduleInput = z.object({courseId:z.string().uuid(),title:shortText,number:z.number().int().positive().max(999)});
export const newPageInput = z.object({title:shortText,afterPageId:z.string().uuid().optional(),expectedStructureRevision:z.number().int().positive().optional(),template:z.enum(['title','teaching','scripture','concepts','steps','question','exercise','prayer']).default('teaching')});
export const editionInput = localeInput;
export const headingsInput = z.object({courseTitle:shortText,moduleTitle:shortText,track:z.string().max(200)});
export type ModuleHeadings = z.infer<typeof headingsInput>;
export type Provider = {id:string;name:string;slug:string;defaultLocale:string};
export type PageSummary = {
  id:string;canonicalId:string;revision:number;wordingReviewRequired:boolean;
  sourcePageId:string|null;sourceRevision:number|null;sourceCurrentRevision:number|null;
  translationStatus:'untranslated'|'draft'|'reviewed'|null;needsUpdate:boolean;reviewNote:string;
};
export type AuthoringModule = {
  id:string;courseId:string;structureRevision:number;provider:Provider;sourceModuleId:string|null;course:PublishedCourse;
  metadataRevision:number;sourceCourse:PublishedCourse|null;pages:PageSummary[];missingSourcePages:number;
};
export function localeKey(language:string,region:string) { return language+'-'+region.toLowerCase(); }

// Stable field keys are the ONLY values sent for translation. IDs, media paths and
// executable presentation metadata never come back from the model.
export function pageText(page:CoursePage):Record<string,string> {
  const fields:Record<string,string>={title:page.title};
  if(typeof page.presentation?.source_note==='string')fields.sourceNote=page.presentation.source_note;
  for(const block of page.blocks) {
    fields['block:'+block.id]=block.text;
    if(block.image)fields['alt:'+block.id]=block.image.alt;
  }
  if(page.reflection)for(const key of ['title','prompt','time'] as const)
    if(page.reflection[key]!==undefined)fields['reflection.'+key]=page.reflection[key]!;
  if(page.guided) {
    fields.narration=page.guided.narration;
    for(const segment of page.guided.segments||[])fields['segment:'+segment.block_id]=segment.text;
    if(page.guided.facilitator)for(const key of ['title','prompt','time'] as const)
      if(page.guided.facilitator[key]!==undefined)fields['facilitator.'+key]=page.guided.facilitator[key]!;
  }
  return fields;
}
export function withoutAudio(page:CoursePage):CoursePage {
  const next=structuredClone(page);
  if(next.guided) {
    next.guided.narration_mode='browser_tts';
    next.guided.segments=next.guided.segments?.map(({audio:_audio,audio_source:_audioSource,...segment})=>segment);
    delete next.guided.audio_segments;
    delete next.guided.narration_segments;
  }
  return next;
}
export function applyTranslation(page:CoursePage,fields:Record<string,string>):CoursePage {
  const expected=pageText(page);
  if(Object.keys(fields).length!==Object.keys(expected).length ||
     Object.keys(expected).some(key=>typeof fields[key]!=='string'||(expected[key].trim()&&!fields[key].trim())))
    throw new Error('Translation fields do not match the source');
  const next=withoutAudio(page);
  next.title=fields.title;
  if(typeof next.presentation?.source_note==='string')next.presentation.source_note=fields.sourceNote;
  for(const block of next.blocks) {
    block.text=fields['block:'+block.id];
    if(block.image)block.image.alt=fields['alt:'+block.id];
  }
  if(next.reflection)for(const key of ['title','prompt','time'] as const)
    if(next.reflection[key]!==undefined)next.reflection[key]=fields['reflection.'+key];
  if(next.guided) {
    next.guided.narration=fields.narration;
    for(const segment of next.guided.segments||[])segment.text=fields['segment:'+segment.block_id];
    if(next.guided.facilitator)for(const key of ['title','prompt','time'] as const)
      if(next.guided.facilitator[key]!==undefined)next.guided.facilitator[key]=fields['facilitator.'+key];
  }
  return pageSchema.parse(next);
}
export function canonicalChanged(before:CoursePage,after:CoursePage):boolean {
  return before.title!==after.title || before.blocks.length!==after.blocks.length ||
    before.blocks.some(block=>{const other=after.blocks.find(item=>item.id===block.id);
      return !other||other.text!==block.text||other.type!==block.type;});
}
export function appendBlock(page:CoursePage,id:string,type:string,text:string):CoursePage {
  const next=structuredClone(page);
  next.blocks.push({id,type,text,localization_policy:'TRANSLATE'});
  if(type!=='title'&&next.guided?.segments?.length)
    next.guided.segments.push({block_id:id,text:text||'Add narration'});
  return next;
}

export function newAuthoringId():string {
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  let time=Date.now();
  for(let index=5;index>=0;index--){bytes[index]=time%256;time=Math.floor(time/256);}
  bytes[6]=(bytes[6]&15)|112;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
