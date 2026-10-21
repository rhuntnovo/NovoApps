import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Course, CoursePage, GuidedNarrationMode } from '../types';
import { useNarration } from '../hooks/useNarration';
import { LessonBlocks, revealBlocks } from './LessonBlocks';
import { ReflectionDialog } from './ReflectionDialog';
import { UpdateNotice } from './UpdateNotice';
import { appUpdates } from '../pwa/updates';
import { saveLessonResume, takeLessonResume, type LessonResume } from '../pwa/lessonResume';
import TemplateRenderer, { BibleIcon, PrayerIcon } from './templates/TemplateRenderer';

type Mode = 'self-paced' | 'guided';
type Audience = 'individual' | 'group';

export function CourseViewer({ course, initialMode = 'self-paced' }: { course: Course; initialMode?: Mode }) {
  const [resume, setResume] = useState(() => {
    const saved = takeLessonResume(course.course_id, course.language);
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
    history.replaceState(null, '', `${location.pathname}${mode === 'guided' ? '?mode=guided' : ''}#${page.id}`);
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

  return <LessonPage key={page.id} course={course} page={page} mode={mode} index={index} total={pages.length}
    resume={resume?.pageId === page.id ? resume : null}
    audience={audience} onAudience={() => setAudience(audience === 'group' ? 'individual' : 'group')}
    presenting={presenting} onPresent={() => void togglePresent()} onMode={changeMode}
    onNavigate={delta => { const target = pages[index + delta]; if (target) { setResume(null); setPageId(target.id); } }}/>;
}

function LessonPage({ course, page, mode, audience, onAudience, index, total, presenting, onPresent, onMode, onNavigate, resume }: {
  course: Course; page: CoursePage; mode: Mode; index: number; total: number; presenting: boolean;
  audience: Audience; onAudience: () => void;
  onPresent: () => void; onMode: () => void; onNavigate: (delta: number) => void;
  resume: LessonResume | null;
}) {
  const blocks = revealBlocks(page);
  const progressive = blocks.length > 0;
  const guided = mode === 'guided';
  const [revealed, setRevealed] = useState(() => Math.max(1, blocks.findIndex(block => block.id === resume?.blockId) + 1));
  const [showAll, setShowAll] = useState(resume?.showAll || false);
  const [showPrompt, setShowPrompt] = useState(resume?.showPrompt || false);
  const [reflected, setReflected] = useState(resume?.reflected || false);
  const [scrollId, setScrollId] = useState<string | null>(resume?.blockId || null);
  const [voiceOverride, setVoiceOverride] = useState<GuidedNarrationMode | null>(resume?.voiceOverride || null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const options = useRef<HTMLDetailsElement>(null);
  const visibleCount = showAll ? blocks.length : Math.min(revealed, blocks.length);
  const complete = !progressive || visibleCount === blocks.length;
  const group = audience === 'group';
  const prompt = group ? page.guided?.facilitator || page.reflection : page.reflection;
  const mappedSegments = new Map(page.guided?.segments?.map(segment => [segment.block_id, segment]));
  const segments = blocks.flatMap(block => { const segment = mappedSegments.get(block.id); return segment ? [segment] : []; });
  const lead = course.guided_presentation?.reveal_lead_ms;
  const voiceMode = voiceOverride || page.guided?.narration_mode || (course.guided_presentation?.default_narration_mode === 'browser_tts' ? 'browser_tts' : 'marin_opus');
  const narration = useNarration({
    enabled: guided,
    segments,
    mode: voiceMode,
    language: course.language === 'en' ? 'en-US' : course.language,
    leadMs: typeof lead === 'number' ? lead : 500,
    onReveal: id => {
      const position = blocks.findIndex(block => block.id === id);
      if (position >= 0) { setRevealed(count => Math.max(count, position + 1)); setScrollId(id); }
    },
    onComplete: () => setRevealed(blocks.length),
  });

  const prepareUpdate = useRef<() => void>(() => {});
  prepareUpdate.current = () => {
    saveLessonResume(course.course_id, course.language, {
      schema: 1, pageId: page.id, mode, audience, presenting,
      blockId: blocks[Math.min(revealed, blocks.length) - 1]?.id || null,
      showAll, showPrompt, reflected, voiceOverride
    });
    narration.stop();
  };
  useLayoutEffect(() => appUpdates.beforeUpdate(() => prepareUpdate.current()), []);

  useLayoutEffect(() => { window.scrollTo(0, 0); }, [page.id]);
  useEffect(() => {
    if (!scrollId) return;
    document.getElementById(scrollId)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  }, [scrollId]);
  useLayoutEffect(() => {
    if (!showPrompt && reflected) nextButton.current?.focus({ preventScroll: true });
  }, [showPrompt, reflected]);

  function next() {
    narration.stop();
    if (!complete) {
      setRevealed(visibleCount + 1);
      setScrollId(blocks[visibleCount].id);
    } else if (prompt && !reflected) setShowPrompt(true);
    else onNavigate(1);
  }

  function previous() {
    narration.stop();
    if (!guided && progressive && !showAll && revealed > 1) {
      setRevealed(revealed - 1);
      setScrollId(blocks[revealed - 2].id);
      setReflected(false);
    } else onNavigate(-1);
  }

  function closePrompt() { setReflected(true); setShowPrompt(false); }

  useLayoutEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target;
      if (showPrompt || options.current?.open || event.altKey || event.ctrlKey || event.metaKey ||
        target instanceof HTMLElement && target.closest('input,textarea,select,summary,[contenteditable="true"]')) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); next(); }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); previous(); }
      if (event.key.toLowerCase() === 'f') onPresent();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  });

  const previousSection = !guided && progressive && !showAll && revealed > 1;
  const nextLabel = !complete ? 'Next section' : prompt && !reflected ? 'Reflect' : index < total - 1 ? 'Next page' : 'Complete';
  const issue = course.source_issues.find(item => item.source_slide === page.source_slide);

  return <div class={`lesson-app ${guided ? 'with-narration' : ''}`}>
    <header class="lesson-header">
      <div class="lesson-brand"><div class="brand">New Vines Learning</div><div class="sub">{guided ? 'Guided' : 'Self Paced'} • Module {course.module.number}</div></div>
      <span class="spacer"/>
      <button class="iconbtn modebtn" onClick={onMode} disabled={!guided && !course.module.pages.some(item => item.guided)}>{guided ? 'Self Paced' : 'Guided'}</button>
      <details class="lesson-options" ref={options}>
        <summary class="iconbtn" aria-label="Lesson options" title="Lesson options">•••</summary>
        <div class="lesson-options-menu">
          {progressive && <button onClick={() => { narration.stop(); setShowAll(!showAll); if (options.current) options.current.open = false; }}>{showAll ? 'Read section by section' : 'Show entire page'}</button>}
          {prompt && <button onClick={() => { narration.stop(); setRevealed(blocks.length); setShowPrompt(true); if (options.current) options.current.open = false; }}>Open reflection</button>}
          <button aria-pressed={group} onClick={() => { onAudience(); setReflected(false); if (options.current) options.current.open = false; }}>Group questions: {group ? 'On' : 'Off'}</button>
          {guided && segments.length > 0 && <button onClick={() => {
            narration.stop(); setVoiceOverride(voiceMode === 'marin_opus' ? 'browser_tts' : 'marin_opus');
            if (options.current) options.current.open = false;
          }}>{voiceMode === 'marin_opus' ? 'Use browser voice' : 'Use Marin recording'}</button>}
          <button onClick={() => { onPresent(); if (options.current) options.current.open = false; }}>{presenting ? 'Exit presentation' : 'Present'}</button>
        </div>
      </details>
    </header>
    <main class="lesson-main">
      <div class="coursebar lesson-coursebar"><span>{course.title}</span><div class="course-release"><span class="course-version">v{course.presentation_version || '1.0'}</span><UpdateNotice/></div><div class="progress" aria-label={`Page ${index + 1} of ${total}`}><div style={{ width: `${(index + 1) / total * 100}%` }}/></div></div>
      <section class={`slide lesson-stage template-${page.template || 'teaching'}`} onTouchStart={event => {
        const point = event.changedTouches[0]; touch.current = { x: point.clientX, y: point.clientY };
      }} onTouchEnd={event => {
        const start = touch.current; touch.current = null;
        if (!start || showPrompt || window.getSelection()?.toString()) return;
        const point = event.changedTouches[0], dx = point.clientX - start.x, dy = point.clientY - start.y;
        if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) { if (dx < 0) next(); else previous(); }
      }}>
        <div class="kicker">{course.track} • Module {course.module.number}</div>
        {progressive ? <><div class={page.template === 'scripture' || page.template === 'prayer' ? 'scripture-heading' : ''}>
          {page.template === 'scripture' && <BibleIcon/>}{page.template === 'prayer' && <PrayerIcon/>}<h1>{page.title}</h1>
        </div><LessonBlocks blocks={blocks} revealed={visibleCount} activeId={narration.activeId || (!showAll ? blocks[visibleCount - 1]?.id : null)}/></> : <TemplateRenderer page={page}/>}
        {issue && <div class="issue"><strong>Source note:</strong> {issue.note}</div>}
        {narration.unavailable && <p role="status" class="narration-notice">Narration is unavailable on this device. You can continue with Next section.</p>}
        {narration.notice && <p role="status" class="narration-notice">{narration.notice}</p>}
      </section>
    </main>
    <div class="nav-shell lesson-nav-shell">
      <div class="lesson-status" role="status">Page {index + 1} / {total}{progressive && ` · Section ${visibleCount} / ${blocks.length}`}{guided && <span>{segments.length ? voiceMode === 'browser_tts' ? 'Browser voice' : 'Marin · AI narration' : 'No recording'}</span>}</div>
      <nav class={`nav lesson-nav ${guided ? 'has-audio' : ''}`} aria-label="Lesson navigation">
        <button class="lesson-back" aria-label={previousSection ? 'Previous section' : 'Previous page'} title={previousSection ? 'Previous section' : 'Previous page'} disabled={index === 0 && !previousSection} onClick={previous}>←</button>
        {guided && <button class="narration-button" title={voiceMode === 'marin_opus' ? 'Play the Marin Opus recording' : 'Read using the browser voice'} disabled={!segments.length} onClick={narration.toggle}>{narration.status === 'playing' ? 'Ⅱ Pause' : narration.status === 'paused' ? '▶ Resume' : narration.status === 'finished' ? '↻ Replay' : narration.status === 'error' ? '↻ Retry' : '▶ Narrate'}</button>}
        <button ref={nextButton} class="lesson-next" disabled={complete && (!prompt || reflected) && index === total - 1} onClick={next}>{nextLabel}{nextLabel !== 'Complete' && ' →'}</button>
        {presenting && <button class="lesson-exit" aria-label="Exit presentation" title="Exit presentation" onClick={onPresent}>⛶</button>}
      </nav>
    </div>
    {showPrompt && prompt && <ReflectionDialog prompt={prompt} group={group} lastPage={index === total - 1} onClose={closePrompt} onContinue={() => {
      closePrompt(); if (index < total - 1) onNavigate(1);
    }}/>}
  </div>;
}
