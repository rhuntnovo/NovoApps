import type {CoursePage,Course} from '../types';
import { labels } from '../labels';

const body=(page:CoursePage)=>page.blocks.map((b,n)=>{
  const lines=(b.text||'').split('\n');
  return n===0 && lines[0]===page.title ? lines.slice(1).join('\n') : b.text;
}).filter(Boolean) as string[];

export const BibleIcon=()=> (
  <svg class="bible-icon" viewBox="0 0 64 64" role="img" aria-label="Bible">
    <path d="M10 10h18c5 0 8 3 8 8v36c-2-4-6-6-11-6H10z"/><path d="M54 10H36v44c2-4 6-6 11-6h7z"/>
    <path class="icon-line" d="M20 19h8M24 15v12"/>
  </svg>
);
export const PrayerIcon=()=> (
  <svg class="prayer-icon" viewBox="0 0 64 64" role="img" aria-label="Prayer">
    <path d="M31 9c-4 8-5 16-3 24l-8 13c-2 4 0 9 4 10 3 1 6 0 8-3l5-8 4 8c2 3 5 4 8 3 4-1 6-6 4-10L45 33c2-8 1-16-3-24"/><path class="icon-line" d="M32 15h9M36.5 10.5v9"/>
  </svg>
);
export const VisualIcon=({kind}:{kind:string})=>{
 const paths:Record<string,any>={
  tangible:<><circle cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="11"/><circle cx="32" cy="32" r="3"/><path d="M47 17l-15 15"/></>,
  measurable:<><path d="M12 42l30-30 10 10-30 30H12z"/><path d="M23 35l6 6M30 28l6 6M37 21l6 6"/></>,
  deadline:<><rect x="11" y="15" width="42" height="38" rx="7"/><path d="M20 10v10M44 10v10M11 26h42"/><circle cx="32" cy="39" r="7"/><path d="M32 35v5l3 2"/></>,
  needs:<><path d="M11 31l21-18 21 18"/><path d="M16 28v25h32V28M27 53V37h10v16"/></>,
  wants:<><path d="M32 52s-18-10-18-25c0-7 5-12 12-12 4 0 6 2 6 5 0-3 3-5 7-5 7 0 12 5 12 12 0 15-19 25-19 25z"/></>,
  discern:<><path d="M32 8v9M15 15l7 7M49 15l-7 7"/><circle cx="32" cy="34" r="13"/><path d="M27 47v7h10v-7M27 31c3-5 8-5 11 0"/></>
  ,examples:<><circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="12"/><circle cx="32" cy="32" r="3"/></>
 };
 return <svg class="visual-icon" viewBox="0 0 64 64" aria-hidden="true">{paths[kind]}</svg>
};

const splitParagraphs=(text:string)=>text.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
const splitLines=(text:string)=>text.split('\n').map(x=>x.trim()).filter(Boolean);

export function Inline({text}:{text:string}){
  // Presentation-only emphasis copied from the source PowerPoint. Match whole phrases only,
  // so e.g. "plan" never highlights the middle of "Unplanned".
  const emphasis=['in the here and now','do not spend','disciplined','pray for','must have','nice to have','discernment (also wisdom)','plan','future','today'];
  const boldLead=/^(Savings:|Goal:)/;
  const parts:{text:string;kind?:'em'|'lead'}[]=[];
  let rest=text; const lead=rest.match(boldLead);
  if(lead){parts.push({text:lead[0],kind:'lead'});rest=rest.slice(lead[0].length)}
  while(rest){
    let best:{i:number;s:string}|null=null;
    for(const s of emphasis){
      const re=new RegExp(`(^|[^A-Za-z])(${s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})(?=$|[^A-Za-z])`,'i');
      const m=rest.match(re); if(m){const i=(m.index||0)+m[1].length;if(!best||i<best.i)best={i,s:rest.slice(i,i+m[2].length)}}
    }
    if(!best){parts.push({text:rest});break}
    if(best.i)parts.push({text:rest.slice(0,best.i)});
    parts.push({text:best.s,kind:'em'});rest=rest.slice(best.i+best.s.length);
  }
  return <>{parts.map((p,i)=>p.kind==='lead'?<strong key={i}>{p.text}</strong>:p.kind==='em'?<span class="source-emphasis" key={i}>{p.text}</span>:p.text)}</>;
}
const Para=({text,className=''}:{text:string,className?:string})=><div class={`block ${className}`}><Inline text={text}/></div>;
function Bullets({items}:{items:string[]}){return <ul class="learning-list">{items.map((x,i)=><li key={i}><Inline text={x}/></li>)}</ul>}

function ScriptureContent({page,text}:{page:CoursePage,text:string}){
 const paras=splitParagraphs(text);
 // Surrender contains prayer/application followed by one actual Scripture passage.
 if(page.id==='FGMM-M01-P016') return <><div class="application-panel">{paras.slice(0,2).map((p,i)=><Para key={i} text={p}/>)}</div><div class="verse-block"><span class="verse-marker" aria-hidden="true">✦</span><Para text={paras[2]||''}/></div></>;
 return <>{paras.map((p,i)=>{
   const isVerse=i===0 || /(?:Proverbs|Exodus|Jeremiah|Timothy|Samuel)\s*\d/i.test(p);
   return isVerse?<div class="verse-block" key={i}><span class="verse-marker" aria-hidden="true">✦</span><Para text={p}/></div>:<Para key={i} text={p} className="scripture-comment"/>;
 })}</>;
}

function Concepts({page,text}:{page:CoursePage,text:string}){
 const paras=splitParagraphs(text);
 if(page.id==='FGMM-M01-P008'){
   const icons=['tangible','measurable','deadline']; return <><Para text={paras[0]}/><div class="concept-grid">{paras.slice(1).map((x,i)=><div class="concept-card visual-card" key={i}><VisualIcon kind={icons[i]}/><Para text={x}/></div>)}</div></>;
 }
 if(page.id==='FGMM-M01-P009'){
   const lines=splitLines(text); return <><div class="concept-intro">{lines.slice(0,2).map((x,i)=><Para key={i} text={x}/>)}</div><div class="examples-panel"><div class="examples-symbol">◎</div><Bullets items={lines.slice(2)}/></div></>;
 }
 if(page.id==='FGMM-M01-P010'){
   return <div class="discernment-flow"><div class="choice-card"><VisualIcon kind="needs"/><Para text={paras[0]}/></div><div class="choice-card"><VisualIcon kind="wants"/><Para text={paras[1]}/></div><div class="discern-card"><VisualIcon kind="discern"/><Para text={paras[2]}/></div></div>;
 }
 return <div class="concept-grid">{paras.map((x,i)=><div class="concept-card" key={i}><Para text={x}/></div>)}</div>;
}

function Steps({page,text}:{page:CoursePage,text:string}){
 const paras=splitParagraphs(text);
 return <div class="steps-list">{paras.map((p,i)=>{
   const lines=splitLines(p); const m=lines[0]?.match(/^(?:Step|Paso)\s+(\d+):\s*(.*)$/i);
   if(!m){const cls=page.id==='FGMM-M01-P015C'?'step-transition':'step-card';return <div class={cls} key={i}><Para text={p}/></div>}
   return <div class="step-card" key={i}><span>{m[1]}</span><div><Para text={m[2]}/>{lines.length>1&&<Bullets items={lines.slice(1)}/>}</div></div>;
 })}</div>;
}

export default function TemplateRenderer({page,course,logo}:{page:CoursePage;course?:Course;logo?:{src:string;alt:string}}){
 const t=labels(course?.language||'en');
 const items=body(page); const text=items.join('\n\n');
 switch(page.template){
  case 'title': {
   const lines=text.split('\n').map(line=>line.trim()).filter(Boolean);
   const moduleLine=lines.findIndex(line=>/^(?:Module|Módulo)\s+\d+:/i.test(line));
   const heading=moduleLine>=0?lines[moduleLine].replace(/^[^:]+:\s*/,'').replace(/[–-]\s*$/,'').trim():course?.module.title||page.title;
   const theme=moduleLine>=0?lines.slice(moduleLine+1):lines;
   return <div class="template title-template"><div class="module-hero">
     {logo&&<img class="module-logo" src={logo.src} alt={logo.alt}/>}
     <div class="module-eyebrow">{page.title}</div><div class="module-number">{t.module} {course?.module.number||1}</div>
     <h1>{heading}</h1>{theme.length>0&&<div class="module-theme">{theme.map((line,index)=><>{index>0&&<> <span>•</span> </>}{line.replace(/,\s*$/,'')}</>)}</div>}
   </div></div>;
  }
  case 'scripture': return <div class="template scripture-template"><div class="scripture-heading"><BibleIcon/><div><div class="template-label">{t.scripture}</div><h1>{page.title}</h1></div></div><div class="scripture-card"><ScriptureContent page={page} text={text}/></div></div>;
  case 'prayer': return <div class="template prayer-template"><div class="scripture-heading"><PrayerIcon/><div><div class="template-label">{t.prayer}</div><h1>{page.title}</h1></div></div><div class="prayer-card">{splitParagraphs(text).map((x,i)=><Para key={i} text={x}/>)}</div></div>;
  case 'steps': return <div class="template steps-template"><div class="template-label">{t.practice}</div><h1>{page.title}</h1><Steps page={page} text={text}/></div>;
  case 'question': return <div class="template question-template"><div class="template-label">{t.discuss}</div><h1>{page.title}</h1><div class="question-card"><Bullets items={splitParagraphs(text)}/></div></div>;
  case 'concepts': return <div class="template concepts-template"><div class="template-label">{t.ideas}</div><h1>{page.title}</h1><Concepts page={page} text={text}/></div>;
  default:
   if(page.id==='FGMM-M01-P002'){const lines=splitLines(text);return <div class="template teaching-template"><div class="template-label">{t.learn}</div><h1>{page.title}</h1><div class="teaching-body"><Para text={lines[0]}/><Bullets items={lines.slice(1)}/></div></div>}
   return <div class="template teaching-template"><div class="template-label">{t.learn}</div><h1>{page.title}</h1><div class="teaching-body">{splitParagraphs(text).map((x,i)=><Para key={i} text={x}/>)}</div></div>;
 }
}
