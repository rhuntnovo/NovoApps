import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Course, CoursePage } from '../types';

function splitParas(page:CoursePage){
 const raw=page.blocks.map((b,n)=>{const lines=(b.text||'').split('\n');return n===0&&lines[0]===page.title?lines.slice(1).join('\n'):b.text}).filter(Boolean).join('\n\n');
 return raw.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
}

export function GuidedDemoViewer({course}:{course:Course}){
 const pages=course.module.pages.filter(p=>p.guided);
 const hashIndex=pages.findIndex(p=>`#${p.id}`===location.hash);
 const [index,setIndex]=useState(hashIndex>=0?hashIndex:0); const [playing,setPlaying]=useState(false); const [paused,setPaused]=useState(false); const [revealed,setRevealed]=useState(1); const [activeSegment,setActiveSegment]=useState<number|null>(null); const [showPrompt,setShowPrompt]=useState(false); const [readyForFacilitator,setReadyForFacilitator]=useState(false);
 const utterance=useRef<SpeechSynthesisUtterance|null>(null); const audio=useRef<HTMLAudioElement|null>(null); const timers=useRef<number[]>([]); const runId=useRef(0); const segmentIndex=useRef(0); const pendingSegment=useRef<number|null>(null); const cardRefs=useRef<(HTMLDivElement|null)[]>([]);
 const page=pages[index]; const paras=useMemo(()=>splitParas(page),[page]);
 const clearTimers=()=>{timers.current.forEach(clearTimeout);timers.current=[]};
 const stop=()=>{runId.current++;speechSynthesis?.cancel();if(audio.current){audio.current.pause();audio.current.currentTime=0;audio.current=null}clearTimers();pendingSegment.current=null;setPlaying(false);setPaused(false);setActiveSegment(null)};
 const go=(n:number)=>{stop();setShowPrompt(false);setReadyForFacilitator(false);setRevealed(1);setIndex(Math.max(0,Math.min(pages.length-1,n)))};
 useEffect(()=>{history.replaceState(null,'',`${location.pathname}?mode=guided#${page.id}`);window.scrollTo(0,0);return stop},[page.id]);
 useEffect(()=>{if(activeSegment===null)return;const t=globalThis.setTimeout(()=>cardRefs.current[activeSegment]?.scrollIntoView({behavior:'smooth',block:'center'}),80);return()=>clearTimeout(t)},[activeSegment]);
 function voiceFor(u:SpeechSynthesisUtterance){u.rate=.94;u.pitch=1;u.lang='en-US';const voices=speechSynthesis.getVoices();const preferred=voices.find(v=>/natural|enhanced|premium|google us english/i.test(v.name))||voices.find(v=>v.lang==='en-US');if(preferred)u.voice=preferred}
 function scheduleSegment(i:number,myRun:number){if(myRun!==runId.current)return;segmentIndex.current=i;pendingSegment.current=i;setRevealed(Math.min(paras.length,i+1));setActiveSegment(i);timers.current.push(globalThis.setTimeout(()=>{pendingSegment.current=null;if(myRun!==runId.current)return;playSegment(i,myRun)},500))}
 function playSegment(i:number,myRun:number){
  const g=page.guided;if(!g||myRun!==runId.current)return;const assets=g.audio_segments||[];const useOpus=g.narration_mode==='marin_opus';
  const next=()=>{if(myRun!==runId.current)return;if(i+1<(g.narration_segments?.length||0))scheduleSegment(i+1,myRun);else finish(myRun)};
  if(useOpus&&assets[i]){const a=new Audio(assets[i]);audio.current=a;a.onended=next;a.onerror=()=>speakFallback(i,myRun,next);a.play().catch(()=>speakFallback(i,myRun,next));return}
  speakFallback(i,myRun,next);
 }
 function speakFallback(i:number,myRun:number,next:()=>void){if(audio.current){audio.current.onended=null;audio.current.onerror=null;audio.current=null}const text=page.guided?.narration_segments?.[i];if(!text||!('speechSynthesis' in window)){next();return}const u=new SpeechSynthesisUtterance(text);voiceFor(u);utterance.current=u;u.onend=()=>{if(myRun===runId.current)next()};u.onerror=()=>{if(myRun===runId.current)next()};speechSynthesis.speak(u)}
 function play(){
  if(paused){setPaused(false);setPlaying(true);if(audio.current){audio.current.play();return}if(speechSynthesis?.paused){speechSynthesis.resume();return}if(pendingSegment.current!==null){const i=pendingSegment.current;pendingSegment.current=null;scheduleSegment(i,runId.current);return}}
  stop();setShowPrompt(false);setReadyForFacilitator(false);setPlaying(true);setRevealed(1);const g=page.guided;if(!g)return;const myRun=++runId.current;const segments:string[]=(g.narration_segments?.length===paras.length)?(g.narration_segments||[]):[g.narration];if(segments.length===paras.length){scheduleSegment(0,myRun);return}
  const seconds=g.estimated_seconds||Math.max(18,Math.round(g.narration.split(/\s+/).length/2.35));for(let i=1;i<paras.length;i++)timers.current.push(globalThis.setTimeout(()=>setRevealed(i+1),seconds*1000*i/paras.length));if('speechSynthesis' in window){const u=new SpeechSynthesisUtterance(g.narration);voiceFor(u);u.onend=()=>finish(myRun);u.onerror=()=>finish(myRun);utterance.current=u;speechSynthesis.speak(u)}else timers.current.push(globalThis.setTimeout(()=>finish(myRun),seconds*1000));
 }
 function pause(){clearTimers();setPlaying(false);setPaused(true);if(audio.current&&!audio.current.paused)audio.current.pause();if(speechSynthesis?.speaking&&!speechSynthesis.paused)speechSynthesis.pause();if(!audio.current&&!speechSynthesis?.speaking)pendingSegment.current=segmentIndex.current}
 function finish(myRun=runId.current){if(myRun!==runId.current)return;clearTimers();setRevealed(paras.length);setPlaying(false);setPaused(false);setActiveSegment(null);audio.current=null;if(page.guided?.facilitator)setReadyForFacilitator(true);else if(page.guided?.auto_advance&&index<pages.length-1)timers.current.push(globalThis.setTimeout(()=>{if(myRun===runId.current)go(index+1)},1200))}
 function toggle(){playing?pause():play()}
 function selfPaced(){location.href=`${location.pathname}#${page.id}`}
 return <div class="guided-app"><header class="guided-header"><div><div class="brand">New Vines Learning <span class="guided-badge">GUIDED</span></div><div class="sub">Facilitator-led narration • Module {course.module.number}</div></div><div class="spacer"/><button class="iconbtn modebtn" onClick={selfPaced}>Self Paced</button></header>
 <main class="guided-main"><div class="guided-topline"><span>{course.title} <span class="course-version">v{course.presentation_version||'1.0'}</span></span><span>Sample {index+1} of {pages.length}</span></div>
 <section class={`guided-stage ${playing?'is-playing':''}`}>
  <div class="guided-kicker">{course.track} • Guided Presentation</div><h1>{page.title}</h1>
  <div class={`guided-content guided-${page.template||'teaching'}`}>
   {paras.map((p,i)=>{const scripture=page.template==='scripture'&&i===0;return <div ref={el=>{cardRefs.current[i]=el}} key={i} class={`guided-card ${i<revealed?'revealed':''} ${activeSegment===i&&!scripture?'active':''} ${scripture?'persistent-scripture':''}`}><span class="reveal-dot">{i+1}</span><div>{p.split('\n').map((l,j)=><span key={j}>{l}{j<p.split('\n').length-1&&<br/>}</span>)}</div></div>})}
  </div>
  {showPrompt&&page.guided?.facilitator&&<div class="facilitator-overlay"><div class="facilitator-box"><button class="fac-close" aria-label="Close facilitator prompt" onClick={()=>{setShowPrompt(false);setReadyForFacilitator(true);setRevealed(paras.length)}}>×</button><div class="fac-label">FACILITATOR PAUSE {page.guided.facilitator.time&&`• ${page.guided.facilitator.time}`}</div><h2>{page.guided.facilitator.title}</h2><p>{page.guided.facilitator.prompt}</p><button onClick={()=>index<pages.length-1?go(index+1):(setShowPrompt(false),setReadyForFacilitator(false))}>{index<pages.length-1?'Continue Lesson →':'Close Prompt'}</button></div></div>}
 </section></main>
 {readyForFacilitator&&!showPrompt&&page.guided?.facilitator&&<button class="fac-ready-btn" onClick={()=>setShowPrompt(true)}>Continue →</button>}
 <div class="guided-controls"><button disabled={index===0} onClick={()=>go(index-1)}>←</button><button class="playbtn" onClick={toggle}>{playing?'❚❚ Pause':paused?'▶ Resume':'▶ Play Narration'}</button><button disabled={index===pages.length-1} onClick={()=>go(index+1)}>→</button></div>
 <div class="demo-note">AI-generated narration</div></div>
}
