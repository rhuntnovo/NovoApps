import { pageText,type CoursePage } from '@novoapps/content-model';

export function PromptFields({label,value,onChange}:{label:string;value:{title:string;prompt:string;time?:string}|undefined;onChange:(value:{title:string;prompt:string;time?:string}|undefined)=>void}){
  return <section className="field-section"><div className="section-heading"><h3>{label}</h3>
    <button className="text-button" onClick={()=>onChange(value?undefined:{title:'Pause and reflect',prompt:''})}>{value?'Remove':'Add prompt'}</button></div>
    {value?<><label>Heading<input value={value.title} onChange={event=>onChange({...value,title:event.target.value})}/></label>
      <label>Question Or Activity<textarea rows={4} value={value.prompt} onChange={event=>onChange({...value,prompt:event.target.value})}/></label>
      <label>Suggested Time<input value={value.time||''} onChange={event=>onChange({...value,time:event.target.value})}/></label></>:<p className="muted">No separate prompt.</p>}
  </section>;
}
function updateText(page:CoursePage,key:string,value:string):CoursePage{
  const next=structuredClone(page);
  if(key==='title')next.title=value;
  if(key==='sourceNote')next.presentation={...next.presentation,source_note:value};
  if(key==='narration'&&next.guided)next.guided.narration=value;
  for(const block of next.blocks){
    if(key==='block:'+block.id)block.text=value;
    if(key==='alt:'+block.id&&block.image)block.image.alt=value;
  }
  for(const segment of next.guided?.segments||[])if(key==='segment:'+segment.block_id){segment.text=value;delete segment.audio;delete segment.audio_source;}
  for(const field of ['title','prompt','time'] as const){
    if(key==='reflection.'+field&&next.reflection)next.reflection[field]=value;
    if(key==='facilitator.'+field&&next.guided?.facilitator)next.guided.facilitator[field]=value;
  }
  return next;
}
export function TranslationFields({source,draft,onChange}:{source:CoursePage;draft:CoursePage;onChange:(value:CoursePage)=>void}){
  const originals=pageText(source),translated=pageText(draft);
  return <div className="translation-fields">{Object.entries(originals).map(([key,value])=><div className="translation-pair" key={key}>
    <div><span className="field-key">{key.startsWith('block:')?'Content Block':key.startsWith('segment:')?'Narration':key}</span><p lang="en">{value||'—'}</p></div>
    <label>Translation<textarea rows={Math.min(10,Math.max(2,value.split('\n').length+1))} value={translated[key]??''}
      disabled={translated[key]===undefined} onChange={event=>onChange(updateText(draft,key,event.target.value))}/></label>
  </div>)}</div>;
}
