import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { Course, CoursePage, GuidedNarrationMode } from './types';
import type { LessonState } from './state';
import { useNarration } from './hooks/useNarration';
import { LessonBlocks, revealBlocks,BlockIllustration } from './LessonBlocks';
import { ReflectionDialog } from './ReflectionDialog';
import TemplateRenderer, { BibleIcon, PrayerIcon } from './templates/TemplateRenderer';
import { labels } from './labels';
function mediaUrl(value:string,base:unknown){if(typeof base!=='string')return value;if(base.startsWith('/') && !base.startsWith('//'))return (base.endsWith('/')?base:base+'/')+(value.startsWith('/')?value.slice(1):value);try{const url=new URL(base);return url.protocol==='https:'?new URL(value.startsWith('/')?value.slice(1):value,url.href.endsWith('/')?url.href:url.href+'/').href:value;}catch{return value;}}
function mediaBlock(block:CoursePage['blocks'][number],base:unknown){return block.image?{...block,image:{...block.image,src:mediaUrl(block.image.src,base),small_src:block.image.small_src?mediaUrl(block.image.small_src,base):undefined}}:block;}
type Mode = 'self-paced' | 'guided';
type Audience = 'individual' | 'group';

export function LessonPlayer({ course, page, mode, audience, onAudience, index, total, presenting, onPresent, onMode, onNavigate, resume, brandName = 'NovoApps Learning', releaseNotice, appVersion, courseControls, beforeUpdate, onPrepareUpdate, logo }: {
  course: Course; page: CoursePage; mode: Mode; index: number; total: number; presenting: boolean;
  audience: Audience; onAudience: () => void;
  onPresent: () => void; onMode: () => void; onNavigate: (delta: number) => void;
    resume: LessonState | null;
  brandName?: string; appVersion?:string; courseControls?:ComponentChildren; releaseNotice?: ComponentChildren; logo?: {src:string;alt:string};
  beforeUpdate?: (prepare: () => void) => (() => void);
  onPrepareUpdate?: (state: LessonState) => void;
}) {
  const t = labels(course.language);
  const blocks = revealBlocks(page).map(block=>mediaBlock(block,course.asset_base_url));
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
  const narrationBlocks = progressive ? blocks : page.blocks.filter(block => block.type !== 'title');
  const segments = narrationBlocks.flatMap(block => { const segment = mappedSegments.get(block.id); return segment ? [{...segment,audio:segment.audio?mediaUrl(segment.audio,course.asset_base_url):undefined}] : []; });
  const lead = course.guided_presentation?.reveal_lead_ms;
  const voiceMode = voiceOverride || page.guided?.narration_mode || (course.guided_presentation?.default_narration_mode === 'browser_tts' ? 'browser_tts' : 'marin_opus');
  const narration = useNarration({
    enabled: guided,
    segments,
    mode: voiceMode,
    language: course.language === 'en' ? 'en-US' : course.country.toLowerCase() === 'global' ? course.language : course.language + '-' + course.country.toUpperCase(),
    leadMs: typeof lead === 'number' ? lead : 500,
    onReveal: id => {
      const position = blocks.findIndex(block => block.id === id);
      if (position >= 0) { setRevealed(count => Math.max(count, position + 1)); setScrollId(id); }
    },
    onComplete: () => setRevealed(blocks.length),
  });

  const prepareUpdate = useRef<() => void>(() => {});
  prepareUpdate.current = () => {
    onPrepareUpdate?.({
      schema: 1, pageId: page.id, mode, audience, presenting,
      blockId: blocks[Math.min(revealed, blocks.length) - 1]?.id || null,
      showAll, showPrompt, reflected, voiceOverride
    });
    narration.stop();
  };
  useLayoutEffect(() => beforeUpdate?.(() => prepareUpdate.current()), [beforeUpdate]);

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
  const nextLabel = !complete ? t.nextSection : prompt && !reflected ? t.reflect : index < total - 1 ? t.nextPage : t.complete;
  const issue = course.source_issues.find(item => item.source_slide === page.source_slide);

  return <div class={`lesson-app ${guided ? 'with-narration' : ''}`}>
    <header class="lesson-header">
      <div class="lesson-brand"><div class="brand">{brandName}</div><div class="sub">{guided ? t.guided : t.selfPaced} • {t.module} {course.module.number}</div></div>
      <span class="spacer"/>
      <button class="iconbtn modebtn" onClick={onMode} disabled={!guided && !course.module.pages.some(item => item.guided)}>{guided ? t.selfPaced : t.guided}</button>
      <details class="lesson-options" ref={options}>
        <summary class="iconbtn" aria-label={t.options} title={t.options}>•••</summary>
        <div class="lesson-options-menu">
          {progressive && <button onClick={() => { narration.stop(); setShowAll(!showAll); if (options.current) options.current.open = false; }}>{showAll ? t.readSections : t.showAll}</button>}
          {prompt && <button onClick={() => { narration.stop(); setRevealed(blocks.length); setShowPrompt(true); if (options.current) options.current.open = false; }}>{t.openReflection}</button>}
          <button aria-pressed={group} onClick={() => { onAudience(); setReflected(false); if (options.current) options.current.open = false; }}>{t.groupQuestions}: {group ? t.on : t.off}</button>
          {guided && segments.length > 0 && <button onClick={() => {
            narration.stop(); setVoiceOverride(voiceMode === 'marin_opus' ? 'browser_tts' : 'marin_opus');
            if (options.current) options.current.open = false;
          }}>{voiceMode === 'marin_opus' ? t.useBrowser : t.useRecording}</button>}
          <button onClick={() => { onPresent(); if (options.current) options.current.open = false; }}>{presenting ? t.exit : t.present}</button>
        </div>
      </details>
    </header>
    <main class="lesson-main">
      <div class="coursebar lesson-coursebar"><span>{course.title}</span><div class="course-release">{courseControls}<span class="course-version">v{appVersion || course.presentation_version || '1.0'}</span>{releaseNotice}</div><div class="progress" aria-label={`Page ${index + 1} of ${total}`}><div style={{ width: `${(index + 1) / total * 100}%` }}/></div></div>
      <section class={`slide lesson-stage template-${page.template || 'teaching'}`} onTouchStart={event => {
        const point = event.changedTouches[0]; touch.current = { x: point.clientX, y: point.clientY };
      }} onTouchEnd={event => {
        const start = touch.current; touch.current = null;
        if (!start || showPrompt || window.getSelection()?.toString()) return;
        const point = event.changedTouches[0], dx = point.clientX - start.x, dy = point.clientY - start.y;
        if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) { if (dx < 0) next(); else previous(); }
      }}>
        <div class="kicker">{course.track} • {t.module} {course.module.number}</div>
        {progressive ? <><div class={page.template === 'scripture' || page.template === 'prayer' ? 'scripture-heading' : ''}>
          {page.template === 'scripture' && <BibleIcon/>}{page.template === 'prayer' && <PrayerIcon/>}<h1>{page.title}</h1>
        </div><LessonBlocks blocks={blocks} revealed={visibleCount} activeId={narration.activeId || (!showAll ? blocks[visibleCount - 1]?.id : null)}/></> : <TemplateRenderer page={{...page,blocks:page.blocks.map(block=>mediaBlock(block,course.asset_base_url))}} course={course} logo={logo?{...logo,src:mediaUrl(logo.src,course.asset_base_url)}:undefined}/>}
        {!progressive&&<div class="static-block-images">{page.blocks.filter(block=>block.image).map(block=><BlockIllustration key={block.id} image={mediaBlock(block,course.asset_base_url).image!}/>)}</div>}
        {issue && <div class="issue"><strong>{t.sourceNote}</strong> {typeof page.presentation?.source_note==='string'?page.presentation.source_note:issue.note}</div>}
        {narration.unavailable && <p role="status" class="narration-notice">Narration is unavailable on this device. You can continue with Next section.</p>}
        {narration.notice && <p role="status" class="narration-notice">{narration.notice}</p>}
      </section>
    </main>
    <div class="nav-shell lesson-nav-shell">
      <div class="lesson-status" role="status">{t.page} {index + 1} / {total}{progressive && ` · ${t.section} ${visibleCount} / ${blocks.length}`}{guided && <span>{segments.length ? voiceMode === 'browser_tts' ? t.browserVoice : segments.some(segment=>segment.audio_source==='human')?t.humanRecording:t.recording : t.noRecording}</span>}</div>
      <nav class={`nav lesson-nav ${guided ? 'has-audio' : ''}`} aria-label={t.navigation}>
        <button class="lesson-back" aria-label={previousSection ? t.previousSection : t.previousPage} title={previousSection ? t.previousSection : t.previousPage} disabled={index === 0 && !previousSection} onClick={previous}>←</button>
        {guided && <button class="narration-button" title={voiceMode === 'marin_opus' ? 'Play the Opus recording' : 'Read using the browser voice'} disabled={!segments.length} onClick={narration.toggle}>{narration.status === 'playing' ? t.pause : narration.status === 'paused' ? t.resume : narration.status === 'finished' ? t.replay : narration.status === 'error' ? t.retry : t.narrate}</button>}
        <button ref={nextButton} class="lesson-next" disabled={complete && (!prompt || reflected) && index === total - 1} onClick={next}>{nextLabel}{nextLabel !== t.complete && ' →'}</button>
        {presenting && <button class="lesson-exit" aria-label={t.exit} title={t.exit} onClick={onPresent}>⛶</button>}
      </nav>
    </div>
    {showPrompt && prompt && <ReflectionDialog language={course.language} prompt={prompt} group={group} lastPage={index === total - 1} onClose={closePrompt} onContinue={() => {
      closePrompt(); if (index < total - 1) onNavigate(1);
    }}/>}
  </div>;
}
