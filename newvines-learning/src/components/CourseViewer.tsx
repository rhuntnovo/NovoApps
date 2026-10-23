import type { ComponentChildren } from 'preact';
import { version as appVersion } from '../../package.json';
import { LessonPlayer } from '@novoapps/content-runtime';
import { useEffect, useState } from 'preact/hooks';
import type { Course } from '../types';



import { UpdateNotice } from './UpdateNotice';
import { appUpdates } from '../pwa/updates';
import { saveLessonResume, takeLessonResume, lessonResumeIdentity, type LessonResume } from '../pwa/lessonResume';


type Mode = 'self-paced' | 'guided';
type Audience = 'individual' | 'group';

export function CourseViewer({ course, courseControls, initialMode = 'self-paced' }: { course: Course; courseControls?:ComponentChildren; initialMode?: Mode }) {
  const resumeCourseId=lessonResumeIdentity(course);
  const [resume, setResume] = useState(() => {
    const saved = takeLessonResume(resumeCourseId, course.language) ||
      (course.course_id==='FGMM'&&course.module.id==='FGMM-M01'&&course.language==='en'&&course.country.toLowerCase()==='global'&&(!course.provider||course.provider.id==='019a0640-0000-7000-8000-000000000001')?takeLessonResume(course.course_id,course.language):null);
    return saved && course.module.pages.some(page => page.id === saved.pageId) ? saved : null;
  });
  const [mode, setMode] = useState<Mode>(resume?.mode || initialMode);
  const [audience, setAudience] = useState<Audience>(resume?.audience || (initialMode === 'guided' ? 'group' : 'individual'));
  const [pageId, setPageId] = useState(() => {
    const requested = course.module.pages.find(page => `#${page.id}` === location.hash);
    return resume?.pageId || requested?.id || (initialMode === 'guided' ? course.module.pages.find(page => page.guided)?.id : undefined) || course.module.pages[0]?.id;
  });
  const [presenting, setPresenting] = useState(resume?.presenting || false);
  const pages = course.module.pages;
  const index = Math.max(0, pages.findIndex(page => page.id === pageId));
  const page = pages[index];

  useEffect(() => {
    const fullscreen = () => { if (!document.fullscreenElement) setPresenting(false); };
    document.addEventListener('fullscreenchange', fullscreen);
    return () => document.removeEventListener('fullscreenchange', fullscreen);
  }, []);
  useEffect(() => {
    document.body.classList.toggle('presenter', presenting);
    return () => document.body.classList.remove('presenter');
  }, [presenting]);
  useEffect(() => {
    if (!page) return;
    const url=new URL(location.href);if(mode==='guided')url.searchParams.set('mode','guided');else url.searchParams.delete('mode');url.hash=page.id;history.replaceState(null,'',url.pathname+url.search+url.hash);
  }, [page?.id, mode]);

  async function togglePresent() {
    if (presenting) {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
      setPresenting(false);
    } else {
      setPresenting(true);
      setAudience('group');
      try { await document.documentElement.requestFullscreen?.(); } catch { /* in-app presentation fallback */ }
    }
  }

  function changeMode() {
    setMode(mode === 'guided' ? 'self-paced' : 'guided');
  }

  if (!page) return <main><p>No Guided pages are available.</p><button onClick={() => setMode('self-paced')}>Self Paced</button></main>;

  return <LessonPlayer appVersion={appVersion} courseControls={courseControls} key={page.id} course={course} page={page} mode={mode} index={index} total={pages.length}
    resume={resume?.pageId === page.id ? resume : null}
    brandName={course.provider?.id==='019a0640-0000-7000-8000-000000000001'?'New Vines Learning':course.provider?.name||'New Vines Learning'} logo={course.provider?.id==='019a0640-0000-7000-8000-000000000001'||!course.provider?{src:typeof course.provider?.logo==='string'?course.provider.logo:'/assets/NVI-logo-clear.png',alt:'New Vines International'}:undefined} releaseNotice={<UpdateNotice/>} beforeUpdate={prepare => appUpdates.beforeUpdate(prepare)}
    onPrepareUpdate={state => saveLessonResume(resumeCourseId, course.language, state)}
    audience={audience} onAudience={() => setAudience(audience === 'group' ? 'individual' : 'group')}
    presenting={presenting} onPresent={() => void togglePresent()} onMode={changeMode}
    onNavigate={delta => { const target = pages[index + delta]; if (target) { setResume(null); setPageId(target.id); } }}/>;
}
