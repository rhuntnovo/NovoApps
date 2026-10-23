import { useEffect, useRef, useState } from 'preact/hooks';
import { CourseViewer } from './components/CourseViewer';
import { parseCatalog, chooseEdition, editionFromUrl, rememberEdition, resolveDeliveryCourse, type Edition } from './catalog';
import type { Course } from './types';

export function App(){
  const [editions,setEditions]=useState<Edition[]>([]),[selected,setSelected]=useState('');
  const [loaded,setLoaded]=useState<{entry:Edition;course:Course}|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  const active=useRef(loaded);active.current=loaded;
  useEffect(()=>{if(loaded)document.documentElement.lang=loaded.course.language+(loaded.course.country.toLowerCase()==='global'?'':'-'+loaded.course.country.toUpperCase());},[loaded]);
  useEffect(()=>{
    const abort=new AbortController();
    void fetch('/courses/catalog.json',{signal:abort.signal}).then(async response=>{
      if(!response.ok)throw Error('Course library is unavailable.');
      const entries=parseCatalog(await response.json());
      let saved:string|null=null;try{saved=localStorage.getItem('novoapps.learning.edition');}catch{}
      setEditions(entries);setSelected(chooseEdition(entries,editionFromUrl(location.search),saved).id);
    }).catch(error=>{if(!abort.signal.aborted){setError(String(error));setLoading(false);}});
    return()=>abort.abort();
  },[]);
  useEffect(()=>{
    const entry=editions.find(item=>item.id===selected);if(!entry||active.current?.entry.id===entry.id)return;
    const abort=new AbortController();setLoading(true);setError('');
    void fetch(entry.path,{signal:abort.signal}).then(async response=>{
      if(!response.ok)throw Error('This edition could not be loaded.');
      const document=await response.json() as Course;
      if(document.schema_version!=='0.3'||document.course_id!==entry.courseId||document.module?.id!==entry.moduleId||
        document.language!==entry.language||document.country.toLowerCase()!==entry.country.toLowerCase()||!document.module.pages.length)
        throw Error('The edition does not match this course release.');
      // Keep published JSON byte-identical; the host resolves bundled media locally.
      const course=resolveDeliveryCourse(document,entry);
      if(abort.signal.aborted)return;
      rememberEdition(entry.id);setLoaded({entry,course});setLoading(false);
    }).catch(error=>{if(!abort.signal.aborted){setError(String(error));setLoading(false);const previous=active.current;if(previous){setSelected(previous.entry.id);rememberEdition(previous.entry.id);}}});
    return()=>abort.abort();
  },[selected,editions]);
  if(!loaded)return <main><p role={error?'alert':'status'}>{error||'Loading…'}</p>{error&&<button onClick={()=>location.reload()}>Retry / Reintentar</button>}</main>;
  const spanish=loaded.course.language==='es';
  const selector=<label class="edition-picker"><span class="edition-label">Language / Idioma</span><select aria-label="Language / Idioma" value={selected} disabled={loading}
    onChange={event=>setSelected(event.currentTarget.value)}>{editions.map(entry=><option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>;
  return <>{error&&<p class="edition-error" role="alert">{error}</p>}{loading&&<p class="edition-loading" role="status">{spanish?'Cargando…':'Loading…'}</p>}
    <CourseViewer key={loaded.entry.id} course={loaded.course} courseControls={selector}
      initialMode={new URLSearchParams(location.search).get('mode')==='guided'||new URLSearchParams(location.search).get('course')==='guided-demo'?'guided':'self-paced'}/></>;
}
