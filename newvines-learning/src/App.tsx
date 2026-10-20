import { useEffect, useState } from 'preact/hooks';
import { CourseViewer } from './components/CourseViewer';
import type { Course } from './types';
export function App(){
 const params=new URLSearchParams(location.search);
 const guided=params.get('mode')==='guided'||params.get('course')==='guided-demo';
 const [course,setCourse]=useState<Course|null>(null);const [error,setError]=useState('');
 useEffect(()=>{fetch('/courses/nvi-fgmm-m01.en-global.json').then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}).then(setCourse).catch(e=>setError(String(e)))},[]);
 if(error)return <main><p>Unable to load course: {error}</p></main>;if(!course)return <main><p>Loading…</p></main>;
 return <CourseViewer course={course} initialMode={guided?'guided':'self-paced'}/>;
}
