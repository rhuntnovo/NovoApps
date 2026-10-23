import { useEffect,useState } from 'preact/hooks';
import { LessonPlayer } from '@novoapps/content-runtime';
import type { PublishedCourse } from '@novoapps/content-model';

// Preview owns its navigation state. No learner storage, update manager or worker.
export function PreviewHost({course,pageId,initialMode,brandName,onModeChange}:{course:PublishedCourse;pageId:string;initialMode:'self-paced'|'guided';brandName:string;onModeChange:(value:'self-paced'|'guided')=>void}){
  const [index,setIndex]=useState(Math.max(0,course.module.pages.findIndex(page=>page.id===pageId)));
  const [mode,setMode]=useState(initialMode),[group,setGroup]=useState(initialMode==='guided'),[presenting,setPresenting]=useState(false);
  useEffect(()=>{document.body.classList.toggle('presenter',presenting);return()=>document.body.classList.remove('presenter');},[presenting]);
  return <LessonPlayer key={course.module.pages[index].id} course={course} page={course.module.pages[index]}
    index={index} total={course.module.pages.length} mode={mode} audience={group?'group':'individual'}
    presenting={presenting} resume={null} brandName={brandName} logo={brandName==='New Vines Learning'?{src:'/assets/NVI-logo-clear.png',alt:'New Vines International'}:undefined}
    onAudience={()=>setGroup(!group)} onPresent={()=>{setPresenting(!presenting);setGroup(true);}}
    onMode={()=>{const next=mode==='guided'?'self-paced':'guided';setMode(next);onModeChange(next);}}
    onNavigate={delta=>setIndex(value=>Math.max(0,Math.min(course.module.pages.length-1,value+delta)))}/>;
}
