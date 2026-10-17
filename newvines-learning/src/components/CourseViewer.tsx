import { useEffect, useState } from 'preact/hooks';
import TemplateRenderer from './templates/TemplateRenderer';
import type { Course } from '../types';

export function CourseViewer({course}:{course:Course}){
 const initial=Math.max(0,course.module.pages.findIndex(p=>`#${p.id}`===location.hash));
 const [index,setIndex]=useState(initial); const [presenting,setPresenting]=useState(false);
 const fullscreenSupported=typeof document!=='undefined' && typeof document.documentElement.requestFullscreen==='function';
 const page=course.module.pages[index];
 const move=(d:number)=>setIndex(v=>Math.max(0,Math.min(course.module.pages.length-1,v+d)));
 useEffect(()=>{history.replaceState(null,'',`${location.pathname}#${page.id}`);window.scrollTo(0,0)},[page.id]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='ArrowRight'||e.key==='PageDown')move(1);if(e.key==='ArrowLeft'||e.key==='PageUp')move(-1);if(e.key.toLowerCase()==='f')void togglePresent()};const fs=()=>{if(fullscreenSupported && !document.fullscreenElement)setPresenting(false)};document.addEventListener('keydown',key);document.addEventListener('fullscreenchange',fs);return()=>{document.removeEventListener('keydown',key);document.removeEventListener('fullscreenchange',fs)}},[fullscreenSupported]);
 useEffect(()=>{document.body.classList.toggle('presenter',presenting);return()=>document.body.classList.remove('presenter')},[presenting]);
 async function togglePresent(){
  if(presenting){if(document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();setPresenting(false);return}
  setPresenting(true);if(fullscreenSupported){try{await document.documentElement.requestFullscreen()}catch{/* in-app fallback */}}
 }
 function openGuided(){
  const target=page.guided?page:course.module.pages.find(p=>p.guided);
  location.href=`${location.pathname}?mode=guided${target?`#${target.id}`:''}`;
 }
 let touchX:number|null=null;
 const issue=course.source_issues.find(x=>x.source_slide===page.source_slide);
 return <><header><div><div class="brand">New Vines Learning</div><div class="sub">{page.title}</div></div><div class="spacer"/><button class="iconbtn modebtn" onClick={openGuided}>Guided</button><button class="iconbtn" onClick={()=>void togglePresent()}>{presenting?'Exit':'Present'}</button></header><main><div class="coursebar"><span>{course.title}</span><span class="course-version">v{course.presentation_version||'1.0'}</span><div class="progress"><div style={{width:`${((index+1)/course.module.pages.length)*100}%`}}/></div></div><section class={`slide template-${page.template || 'teaching'}`} onTouchStart={e=>touchX=e.changedTouches[0].clientX} onTouchEnd={e=>{if(touchX===null)return;const dx=e.changedTouches[0].clientX-touchX;if(Math.abs(dx)>70)move(dx<0?1:-1);touchX=null}}>
  <div class="kicker">{course.track} • Module {course.module.number}</div>
  <TemplateRenderer page={page}/>
  {issue&&<div class="issue"><strong>Source note:</strong> {issue.note}</div>}
 </section></main><div class="nav-shell"><div class="nav"><button disabled={index===0} onClick={()=>move(-1)}>← Previous</button><span class="count">{index+1} / {course.module.pages.length}</span><button disabled={index===course.module.pages.length-1} onClick={()=>move(1)}>Next →</button></div></div></>;
}
