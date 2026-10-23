/** Local, source-mapped PPTX -> CMS drafts. The inventory is made by extract-pptx.py. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { courseSchema, newAuthoringId, type PublishedCourse } from '@novoapps/content-model';

type Paragraph = { index:number; text:string; level:number; bullet:boolean };
type Shape = { id:string; placeholder:string|null; x:number; y:number; paragraphs:Paragraph[] };
export type Inventory = {format:string; filename:string; sha256:string; media:{part:string;sha256:string}[];
  slides:{number:number;hidden:boolean;shapes:Shape[];pictures:{part:string;external:boolean}[];notes:Shape[];unsupported:string[];connectors:number}[]};
// A reference is shape:paragraph, shape:first-last, or shape:paragraph@start:end.
// Offsets use Unicode code points, not UTF-16 indices. No replacement text is accepted.
type Section = {refs:string[];type?:string;format?:'paragraphs'|'continuous'|'heading'|'lines'|'table'|'keep-go'|'malaria'|'flow';icon?:string};
type SlidePlan = {title?:string[];sections?:Section[];template?:'teaching'|'scripture'|'concepts'|'steps'|'question'|'exercise';issues?:{type:string;note:string}[]};
export type ImportPlan = {name:string;sourceSha256:string;providerId:string;courseId:string;language:string;country:string;
  excludeText:string[];allowedPictures:string[];maxPageCharacters:number;maxPageBlocks:number;
  protectedModules:number[];modules:{number:number;slides:[number,number]}[];slides:Record<string,SlidePlan>};
type Registry = Record<string,string>;
export type Prepared = {format:string;sourceSha256:string;plan:ImportPlan;base:PublishedCourse;ids:Registry;courses:PublishedCourse[]};
const normalize=(text:string)=>text.replace(/\s+/gu,' ').trim();
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function assert(condition:unknown,message:string):asserts condition {if(!condition)throw Error(message);}

function refParts(reference:string,shapes:Shape[]) {
  const match=reference.match(/^(\d+):(\d+)(?:-(\d+))?(?:@(\d+):(\d+))?$/);
  assert(match,'Invalid source reference: '+reference);
  const shape=shapes.find(shape=>shape.id===match[1]);assert(shape,'Unknown source shape: '+reference);
  const first=Number(match[2]),last=Number(match[3]??first);
  assert(first<=last&&!(match[3]&&match[4]),'Invalid source range: '+reference);
  const parts=[];
  for(let index=first;index<=last;index++){
    const paragraph=shape.paragraphs.find(paragraph=>paragraph.index===index);assert(paragraph,'Unknown paragraph: '+reference);
    const chars=Array.from(paragraph.text),start=match[4]?Number(match[4]):0,end=match[5]?Number(match[5]):chars.length;
    assert(start>=0&&end>=start&&end<=chars.length,'Invalid text slice: '+reference);
    parts.push({key:shape.id+':'+index,start,end,text:chars.slice(start,end).join('')});
  }
  return parts;
}
function sourceText(refs:string[],shapes:Shape[]){return refs.flatMap(ref=>refParts(ref,shapes)).map(part=>part.text).join('\n');}
function renderedText(section:Section,shapes:Shape[]){
  const parts=section.refs.flatMap(ref=>refParts(ref,shapes)).map(part=>part.text);
  if(section.format==='keep-go'){
    return ['\tKEEP\tGO',...parts.slice(1).map(text=>{
      const [label,...values]=text.trimEnd().split('\t');
      return label.trim()+'\t'+(values.length>1?'\tx':'x\t');
    })].join('\n');
  }
  if(section.format==='malaria'){
    return ['\tMalaria\tNet',...parts.slice(1).map((text,index)=>{
      const columns=text.trim().split(/\t+/);assert(columns.length===2,'Expected cost and value');
      return columns[0].trim()+'\t'+(index===4?'\t':'')+columns[1].trim()+(index===4?'':'\t');
    })].join('\n');
  }
  if(section.format==='table')return parts.map(text=>text.trim().replace(/\r?\n/g,' ').replace(/\t+/g,'\t')).join('\n');
  if(section.format==='flow'){
    const groups:{shape:string;parts:string[]}[]=[];
    section.refs.forEach(reference=>{const shape=reference.split(':')[0];const texts=refParts(reference,shapes).map(part=>normalize(part.text));
      if(groups.at(-1)?.shape===shape)groups.at(-1)!.parts.push(...texts);else groups.push({shape,parts:texts});});
    return groups.map(group=>group.parts.join('\n')).join('\n\n');
  }
  if(section.format==='continuous')return normalize(parts.join(' '));
  if(section.format==='heading')return normalize(parts[0])+'\n\n'+normalize(parts.slice(1).join(' '));
  if(section.format==='lines')return parts.flatMap(part=>part.split('\n')).map(normalize).filter(Boolean).join('\n');
  return parts.map(normalize).filter(Boolean).join('\n\n');
}

export function prepare(inventory:Inventory,plan:ImportPlan,base:PublishedCourse,registry:Registry={}):Prepared {
  assert(inventory.format==='novoapps-pptx-inventory-1','Unsupported inventory');
  assert(inventory.sha256===plan.sourceSha256,'PowerPoint hash differs from the reviewed mapping');
  assert(base.course_id===plan.courseId&&base.language===plan.language&&base.country===plan.country,'Wrong base course/edition');
  assert(plan.maxPageCharacters>=250&&plan.maxPageBlocks>=1,'Invalid page limits');
  const ids={...registry},id=(key:string)=>ids[key]??(ids[key]=newAuthoringId());
  const {module:_module,...metadata}=base;
  const selected=new Set<number>(),courses:PublishedCourse[]=[];
  for(const modulePlan of plan.modules){
    assert(Number.isInteger(modulePlan.number)&&modulePlan.number>0&&!plan.protectedModules.includes(modulePlan.number),'A protected module cannot be imported');
    const [first,last]=modulePlan.slides;assert(first<=last,'Invalid module range');
    const pages:PublishedCourse['module']['pages']=[];
    let moduleTitle='';
    const moduleIssues:unknown[]=[];
    for(let number=first;number<=last;number++){
      assert(!selected.has(number),'Overlapping module ranges');selected.add(number);
      const slide=inventory.slides.find(slide=>slide.number===number);assert(slide,'Missing source slide '+number);
      assert(!slide.hidden,'Hidden slide requires explicit review: '+number);
      assert(slide.unsupported.length===0,'Unsupported slide objects require manual review: '+number);
      assert(!slide.notes.some(shape=>shape.placeholder==='body'&&shape.paragraphs.some(p=>p.text.trim())), 'Speaker notes require separate mapping: '+number);
      assert(slide.pictures.every(pic=>!pic.external&&plan.allowedPictures.includes(pic.part)), 'Unmapped source picture: '+number);
      const excluded=slide.shapes.filter(shape=>['dt','ftr','sldNum'].includes(shape.placeholder||'')||shape.paragraphs.every(p=>!p.text.trim()||plan.excludeText.includes(p.text)));
      const shapes=slide.shapes.filter(shape=>!excluded.includes(shape));
      const atoms=shapes.flatMap(shape=>shape.paragraphs.filter(p=>p.text.trim()).map(p=>({ref:shape.id+':'+p.index,text:p.text,shape})));
      const used=new Map<string,Set<number>>();
      function consume(refs:string[]){
        for(const reference of refs)for(const part of refParts(reference,shapes)){
          const positions=used.get(part.key)||new Set<number>();
          Array.from(part.text).forEach((char,index)=>{if(/\s/u.test(char))return;const offset=part.start+index;assert(!positions.has(offset),'Duplicate source text on slide '+number+': '+reference);positions.add(offset);});
          used.set(part.key,positions);
        }
      }
      function verify(){
        for(const atom of atoms)Array.from(atom.text).forEach((char,index)=>{if(!/\s/u.test(char))assert(used.get(atom.ref)?.has(index),'Unmapped source text on slide '+number+': '+atom.ref);});
      }
      const source={filename:inventory.filename,sha256:inventory.sha256,slide:number};
      if(number===first){
        const texts=atoms.map(atom=>atom.text).join('\n');
        const match=texts.match(/^\s*([\s\S]*?)\s*Module\s+(\d+):\s*([\s\S]*)$/);
        assert(match&&Number(match[2])===modulePlan.number,'Expected module divider on slide '+number);
        moduleTitle=normalize(match[3]);assert(moduleTitle,'Missing module title');
        // Cover title/body are whitespace-only reflow of the complete divider text.
        const title=normalize(match[1]),body='Module '+match[2]+': '+moduleTitle;
        assert(normalize(title+' '+body)===normalize(texts),'Cover wording changed');consume(atoms.map(atom=>atom.ref));verify();
        pages.push({id:id('page:'+number+':0'),source_slide:number,title,layout:'title',template:'title',
          source_import:{...source,refs:atoms.map(atom=>atom.ref)},
          blocks:[{id:id('block:'+number+':cover'),type:'paragraph',text:body,localization_policy:'TRANSLATE_ONLY'}]});
        continue;
      }
      const mapping=plan.slides[String(number)]||{};
      const sorted=atoms.slice().sort((a,b)=>a.shape.y-b.shape.y||a.shape.x-b.shape.x||a.shape.paragraphs.findIndex(p=>p.text===a.text)-b.shape.paragraphs.findIndex(p=>p.text===b.text));
      const titleRefs=mapping.title||[sorted[0].ref];const title=normalize(sourceText(titleRefs,shapes));consume(titleRefs);
      let sections=mapping.sections;
      if(!sections){
        const refs=atoms.filter(atom=>!titleRefs.includes(atom.ref)).map(atom=>atom.ref);
        sections=[];
        for(let index=0;index<refs.length;index++){
          const text=normalize(sourceText([refs[index]],shapes));
          if(/^(?:Proverbs|Genesis|Gen|Isaiah|1 Peter)\s+\d[\d: ,–-]*$/u.test(text)&&index+1<refs.length){
            sections.push({refs:[refs[index],refs[++index]],type:'scripture'});
          }else sections.push({refs:[refs[index]],type:/^(?:Proverbs|Isaiah|1 Peter)\s+\d/.test(text)?'scripture':/^Step\s+\d/i.test(text)?'step':/^Application:/.test(text)?'concept':'paragraph'});
        }
      }
      const blocks=sections.map((section,index)=>{
        consume(section.refs);const text=renderedText(section,shapes);
        assert(normalize(text)===normalize(sourceText(section.refs,shapes)), 'Wording changed on slide '+number+', section '+(index+1));
        assert(text.trim(),'Empty content block');
        return {id:id('block:'+number+':'+index),type:section.type||'paragraph',text,localization_policy:'TRANSLATE_ONLY',
          ...(section.icon?{icon:section.icon}:{}),source_import:{...source,refs:section.refs}};
      });verify();
      assert(blocks.length,'No body on slide '+number);
      // Keep a short category heading with its table/list. Balance continuation pages
      // so a single concluding sentence does not become an otherwise empty page.
      const units:typeof blocks[]=[];
      for(let index=0;index<blocks.length;index++){
        const unit=[blocks[index]];
        if(blocks[index].type==='concept'&&blocks[index].text.length<60&&blocks[index+1])unit.push(blocks[++index]);
        units.push(unit);
      }
      const groups:typeof units[]=[];let group:typeof units=[];let length=0,count=0;
      for(const unit of units){const size=unit.reduce((n,b)=>n+b.text.length,0);
        if(group.length&&(length+size>plan.maxPageCharacters||count+unit.length>plan.maxPageBlocks)){groups.push(group);group=[];length=0;count=0;}
        group.push(unit);length+=size;count+=unit.length;
      }
      if(group.length)groups.push(group);
      for(let index=groups.length-1;index>0;index--){
        const current=groups[index],previous=groups[index-1],candidate=previous.at(-1)!;
        if(current.flat().length===1&&previous.flat().length>2&&previous.length>1&&
          [...candidate,...current.flat()].reduce((n,b)=>n+b.text.length,0)<=plan.maxPageCharacters){current.unshift(previous.pop()!);}
      }
      const chunks=groups.map(group=>group.flat());
      chunks.forEach((chunk,index)=>pages.push({id:id('page:'+number+':'+index),source_slide:number,title,
        layout:mapping.template||'teaching',template:mapping.template||'teaching',
        presentation:{reveal_blocks:true},blocks:chunk,
        source_import:{...source,title_refs:titleRefs,part:index+1,parts:chunks.length,review_required:true}}));
      if(mapping.issues)moduleIssues.push(...mapping.issues.map(issue=>({...issue,source_slide:number,status:'needs_review'})));
    }
    const course=courseSchema.parse({...metadata,module:{id:id('module:'+modulePlan.number),number:modulePlan.number,title:moduleTitle,
      source_slide_range:first+'-'+last,source_import:{filename:inventory.filename,sha256:inventory.sha256,plan:plan.name,status:'draft',issues:moduleIssues},pages}});
    courses.push(course);
  }
  assert(courses.length>0&&new Set(courses.map(c=>c.module.number)).size===courses.length,'Duplicate/empty modules');
  return {format:'novoapps-pptx-prepared-1',sourceSha256:inventory.sha256,plan,base,ids,courses};
}

export function report(prepared:Prepared){
  const lines=['# PowerPoint Import Review','',`Source: ${prepared.plan.name}`,`SHA-256: ${prepared.sourceSha256}`,'',
    'Local drafts only. Repeated page headings are presentation aids. Source text is unchanged except whitespace reflow.',''];
  for(const course of prepared.courses){
    lines.push(`## Module ${course.module.number}: ${course.module.title}`,'',`Slides ${course.module.source_slide_range}; ${course.module.pages.length} pages.`,'', '| Page | Slide | Heading | Sections |','| --- | --- | --- | --- |');
    course.module.pages.forEach((page,index)=>lines.push(`| ${index+1} | ${page.source_slide} | ${page.title.replace(/\|/g,'\\|')} | ${page.blocks.length} |`));
    lines.push('');
    for(const issue of (course.module.source_import as {issues:{source_slide:number;note:string}[]}).issues)lines.push(`- Slide ${issue.source_slide}: ${issue.note}`);
    lines.push('');
  }
  return lines.join('\n');
}

export async function importDrafts(prepared:Prepared,inventory:Inventory,api:string,request:typeof fetch=fetch){
  const url=new URL(api);
  assert(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname==='/'&&!url.username&&!url.password&&!url.search&&!url.hash,'Only a loopback local CMS is allowed');
  assert(isDeepStrictEqual(prepare(inventory,prepared.plan,prepared.base,prepared.ids),prepared),'Prepared content differs from verified source; prepare again');
  const get=async(route:string)=>{const response=await request(new URL(route,url),{redirect:'error'});assert(response.ok,'Local CMS request failed: '+response.status);return response.json();};
  const health=await get('/health');assert(health.mode==='local-authoring','CMS is not in local-authoring mode');
  const modules=await get('/api/v1/cms/modules');
  const results=[];
  // Preflight the entire batch before making a write. Existing modules are never overwritten.
  for(const course of prepared.courses){
    const sameNumber=modules.find((item:any)=>item.providerId===prepared.plan.providerId&&item.course.course_id===course.course_id&&item.locale===course.language+'-'+course.country.toLowerCase()&&item.module.number===course.module.number);
    if(sameNumber){
      assert(sameNumber.canonicalId===course.module.id,'A different module already uses number '+course.module.number);
      const current=await get('/api/v1/cms/modules/'+sameNumber.id);
      assert(isDeepStrictEqual(current.course,course),'Existing module has edits; import will not replace them');
      results.push({number:course.module.number,moduleId:sameNumber.id,status:'already-imported'});
    }
  }
  for(const course of prepared.courses){
    if(results.some(result=>result.number===course.module.number))continue;
    const response=await request(new URL('/api/v1/cms/import',url),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({providerId:prepared.plan.providerId,reviewRequired:true,course})});
    const data=await response.json();assert(response.ok,'Import stopped at module '+course.module.number+': '+(data.error||response.status));
    const saved=await get('/api/v1/cms/modules/'+data.moduleId);
    assert(isDeepStrictEqual(saved.course,course)&&saved.pages.every((page:any)=>page.wordingReviewRequired),'Saved draft verification failed');
    results.push({number:course.module.number,moduleId:data.moduleId,status:'imported'});
  }
  return results.sort((a,b)=>a.number-b.number);
}

async function main(){
  const [command,...args]=process.argv.slice(2);const option=(name:string)=>{const index=args.indexOf('--'+name);assert(index>=0&&args[index+1],'Missing --'+name);return args[index+1];};
  const read=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
  const inventory=await read(option('source')) as Inventory;
  if(command==='prepare'){
    const out=path.resolve(option('out'));const plan=await read(option('plan'));const base=courseSchema.parse(await read(option('base')));
    let previous:Prepared|undefined;try{previous=await read(path.join(out,'prepared.json'));}catch(error:any){if(error.code!=='ENOENT')throw error;}
    if(previous)assert(previous.sourceSha256===inventory.sha256&&hash(previous.plan)===hash(plan),'Use a new output folder for a changed source/mapping');
    const prepared=prepare(inventory,plan,base,previous?.ids);
    await mkdir(out,{recursive:true});
    await writeFile(path.join(out,'prepared.json'),JSON.stringify(prepared,null,2)+'\n');
    await writeFile(path.join(out,'review.md'),report(prepared));
    for(const course of prepared.courses)await writeFile(path.join(out,`module-${course.module.number}.json`),JSON.stringify(course,null,2)+'\n');
    console.log(JSON.stringify(prepared.courses.map(course=>({number:course.module.number,title:course.module.title,pages:course.module.pages.length,sections:course.module.pages.reduce((n,p)=>n+p.blocks.length,0)})),null,2));
  }else if(command==='import'){
    assert(args.includes('--confirm-local-drafts'),'Pass --confirm-local-drafts after reviewing review.md and backing up local D1');
    const prepared=await read(option('prepared'));const results=await importDrafts(prepared,inventory,option('api'));
    await writeFile(path.join(path.dirname(option('prepared')),'import-results.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
  }else throw Error('Use prepare or import');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
