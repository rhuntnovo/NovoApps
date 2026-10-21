import { useEffect, useMemo, useRef, useState } from 'react';
import { courseSchema, templateSchema, type CoursePage, type ModuleDraft } from '@novoapps/content-model';

type ModuleSummary = { id: string; canonicalId: string; locale: string; course: { title: string }; module: { title: string; number: number } };
type Prompt = { title: string; prompt: string; time?: string };
const previewOrigin = new URL(import.meta.env.VITE_PREVIEW_ORIGIN || 'http://127.0.0.1:5175').origin;
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch('/api/v1/cms' + url, options);
  const data = await response.json();
  if (!response.ok) throw new Error([data.error, ...(data.issues || [])].filter(Boolean).join(' '));
  return data;
}
function PromptFields({ label, value, onChange }: { label: string; value: Prompt | undefined; onChange: (value: Prompt | undefined) => void }) {
  return <section className="field-section"><div className="section-heading"><h3>{label}</h3>
    <button className="text-button" onClick={() => onChange(value ? undefined : { title: 'Pause and reflect', prompt: '' })}>{value ? 'Remove' : 'Add prompt'}</button></div>
    {value ? <><label>Heading<input value={value.title} onChange={event => onChange({ ...value, title: event.target.value })}/></label>
      <label>Question or activity<textarea rows={4} value={value.prompt} onChange={event => onChange({ ...value, prompt: event.target.value })}/></label>
      <label>Suggested time<input value={value.time || ''} placeholder="Optional" onChange={event => onChange({ ...value, time: event.target.value })}/></label></>
      : <p className="muted">No separate prompt. The viewer uses its usual fallback.</p>}
  </section>;
}
export function App() {
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [module, setModule] = useState<ModuleDraft | null>(null);
  const [pageId, setPageId] = useState('');
  const [draft, setDraft] = useState<CoursePage | null>(null);
  const [unlock, setUnlock] = useState(false);
  const [tab, setTab] = useState('content');
  const [mode, setMode] = useState<'self-paced' | 'guided'>('self-paced');
  const [device, setDevice] = useState(390);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const latestPreview = useRef<unknown>(null);
  const savedPage = module?.course.module.pages.find(page => page.id === pageId);
  const pageSummary = module?.pages.find(page => page.canonicalId === pageId);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(savedPage);
  const previewCourse = useMemo(() => module && draft ? {
    ...module.course, module: { ...module.course.module, pages: module.course.module.pages.map(page => page.id === pageId ? draft : page) }
  } : null, [module, draft, pageId]);
  const validated = useMemo(() => courseSchema.safeParse(previewCourse), [previewCourse]);

  async function openModule(id: string) {
    if (dirty && !window.confirm('Discard unsaved draft changes?')) return;
    try {
      const selected = await api<ModuleDraft>('/modules/' + id);
      setModule(selected); selectPage(selected, selected.course.module.pages[0].id); setError('');
    } catch (error) { setError(String(error)); }
  }
  function selectPage(selected: ModuleDraft, id: string) {
    setPageId(id); setDraft(structuredClone(selected.course.module.pages.find(page => page.id === id)!));
    setUnlock(false); setNotice(''); setError('');
  }
  useEffect(() => { void api<ModuleSummary[]>('/modules').then(items => {
    setModules(items); if (items[0]) void openModule(items[0].id);
  }).catch(error => setError(String(error))); }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, saving]);
  useEffect(() => {
    if (!validated.success) return;
    const payload = { type: 'NOVOAPPS_CMS_PREVIEW', course: validated.data, pageId, mode };
    latestPreview.current = payload;
    const timer = window.setTimeout(() => frame.current?.contentWindow?.postMessage(payload, previewOrigin), 200);
    return () => clearTimeout(timer);
  }, [validated, pageId, mode]);
  async function save() {
    if (!module || !draft || !pageSummary || saving || !validated.success) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await api('/pages/' + pageSummary.id + '/draft', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: pageSummary.revision, allowWordingChanges: unlock, page: draft }) });
      const refreshed = await api<ModuleDraft>('/modules/' + module.id);
      setModule(refreshed); setDraft(structuredClone(refreshed.course.module.pages.find(page => page.id === pageId)!));
      setUnlock(false); setNotice('Draft saved. Published content has not changed.');
    } catch (error) { setError(String(error)); } finally { setSaving(false); }
  }
  function edit(patch: Partial<CoursePage>) { if (draft) { setDraft({ ...draft, ...patch }); setNotice(''); } }
  function moveBlock(index: number, delta: number) {
    if (!draft) return;
    const blocks = [...draft.blocks], target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    edit({ blocks });
  }
  async function exportDraft() {
    if (!module || dirty) return;
    try {
      const response = await fetch('/api/v1/cms/modules/' + module.id + '/export');
      if (!response.ok) throw new Error('Could not export draft');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = module.course.module.id + '.draft.json'; link.click();
      URL.revokeObjectURL(url);
    } catch (error) { setError(String(error)); }
  }

  return <div className="studio">
    <header className="studio-header"><a href="/" className="studio-brand"><span className="brand-mark">NV</span><span>New Vines <strong>Content Studio</strong></span></a>
      <span className="local-label">Local authoring</span><span className="header-spacer"/>
      <button disabled={!module || dirty || saving} onClick={() => void exportDraft()}>Export draft</button>
      <button className="primary" disabled={!dirty || saving || !validated.success} onClick={() => void save()}>{saving ? 'Saving…' : 'Save draft'}</button>
    </header>
    <div className="studio-context"><div><span className="eyebrow">COURSE WORKSPACE</span><h1>{module?.course.title || 'Your course library'}</h1>
      <p>{module ? 'Module ' + module.course.module.number + ' · ' + module.course.module.title : 'Import your first module to start.'}</p></div>
      <div className="context-meta"><span className="draft-label">Draft only</span><span>{modules[0]?.locale || 'en-global'}</span><small>Learning v0.8.3 stays published</small></div></div>
    {error && <div className="message error" role="alert">{error} <button disabled={saving || !module} onClick={() => module && void openModule(module.id)}>Reload latest draft</button></div>}
    {notice && <div className="message success" role="status">{notice}</div>}
    {!module ? <main className="empty"><h2>Ready for your first course</h2><p>Start the CMS development command to import the existing Module 1 into local D1.</p></main> :
    <div className="workspace">
      <aside className="page-sidebar"><label className="module-select">Module<select value={module.id} disabled={saving} onChange={event => void openModule(event.target.value)}>
        {modules.map(item => <option key={item.id} value={item.id}>{item.canonicalId} · {item.locale}</option>)}</select></label>
        <div className="sidebar-heading"><strong>Pages</strong><span>{module.course.module.pages.length}</span></div>
        <nav aria-label="Course pages">{module.course.module.pages.map((page, index) => <button key={page.id} disabled={saving}
          className={'page-link ' + (pageId === page.id ? 'selected' : '')}
          onClick={() => { if (!dirty || window.confirm('Discard unsaved draft changes?')) selectPage(module, page.id); }}>
          <span className="page-number">{index + 1}</span><span>{page.title}</span>
        </button>)}</nav></aside>
      <main className="editor">
        <div className="editor-heading"><span className="eyebrow">PAGE {module.course.module.pages.findIndex(page => page.id === pageId) + 1} OF {module.course.module.pages.length}</span>
          <span className="revision">{dirty ? 'Unsaved changes' : 'Revision ' + pageSummary?.revision}</span></div>
        <h2>{savedPage?.title}</h2>
        {pageSummary?.wordingReviewRequired && <p className="review-note">This draft has wording changes that require review before publication.</p>}
        <div className="editor-tabs" role="tablist" aria-label="Page editor">{[['content','Content'],['reflections','Reflections'],['narration','Narration']].map(([value,label]) =>
          <button role="tab" id={'tab-' + value} aria-controls="editor-panel" aria-selected={tab===value} key={value} onClick={() => setTab(value)}>{label}</button>)}</div>
        <fieldset disabled={saving} id="editor-panel" role="tabpanel" aria-labelledby={'tab-' + tab}>
          {draft && tab === 'content' && <>
            <label className="wording-lock"><input type="checkbox" checked={unlock} onChange={event => setUnlock(event.target.checked)}/>
              <span>Create wording changes for review<small>Original imported wording is kept. Saving a draft does not publish it.</small></span></label>
            <label>Page title<input value={draft.title} readOnly={!unlock} onChange={event => edit({title:event.target.value})}/></label>
            <label>Page layout<select value={draft.template || 'teaching'} onChange={event => edit({template:event.target.value as CoursePage['template']})}>
              {templateSchema.options.map(value => <option key={value}>{value}</option>)}</select></label>
            <div className="section-heading"><h3>Content blocks</h3><span className="muted">{draft.blocks.length} blocks</span></div>
            {draft.blocks.map((block,index) => <section className="block-card" key={block.id}>
              <div className="block-heading"><strong>{block.type === 'title' ? 'Title' : 'Section ' + draft.blocks.slice(0, index + 1).filter(item => item.type !== 'title').length}</strong><span>{block.type}</span>
                <button aria-label={'Move block ' + (index+1) + ' up'} disabled={index===0} onClick={() => moveBlock(index,-1)}>↑</button>
                <button aria-label={'Move block ' + (index+1) + ' down'} disabled={index===draft.blocks.length-1} onClick={() => moveBlock(index,1)}>↓</button></div>
              <textarea aria-label={'Text for ' + block.id} rows={Math.min(12,Math.max(3,block.text.split('\n').length+1))} readOnly={!unlock} value={block.text}
                onChange={event => edit({blocks:draft.blocks.map(item => item.id===block.id?{...item,text:event.target.value}:item)})}/>
              <small className="stable-id">{block.id}{block.icon ? ' · ' + block.icon + ' icon retained' : ''}</small>
              {block.image && <div className="asset-note"><span>Illustration retained</span><small>{block.image.alt}</small></div>}
            </section>)}
          </>}
          {draft && tab === 'reflections' && <>
            <p className="editor-help">Individual and group questions work in both Self Paced and Guided.</p>
            <PromptFields label="Individual reflection" value={draft.reflection} onChange={value => { const updated={...draft}; if(value)updated.reflection=value;else delete updated.reflection;setDraft(updated); }}/>
            <PromptFields label="Group / facilitator question" value={draft.guided?.facilitator} onChange={value => {
              const updated=structuredClone(draft);
              if(value)updated.guided={...updated.guided,narration:updated.guided?.narration||'',facilitator:value};
              else if(updated.guided)delete updated.guided.facilitator;
              setDraft(updated);
            }}/>
          </>}
          {draft && tab === 'narration' && <>
            <p className="editor-help">Narration maps to the same content blocks. Existing Opus recordings and icons stay attached.</p>
            {!draft.guided?.segments?.length ? <p>No narration is mapped on this page yet. The manual section experience remains available.</p> :
              <><p className="review-note">Editing a script does not regenerate its recording. Preview still plays the existing audio.</p>
                {draft.guided.segments.map((segment,index)=><label key={segment.block_id}>Section {index+1} · {segment.block_id}
                  <textarea rows={4} value={segment.text} onChange={event=>edit({guided:{...draft.guided!,segments:draft.guided!.segments!.map(item=>item.block_id===segment.block_id?{...item,text:event.target.value}:item)}})}/>
                  <small className="stable-id">{segment.audio || 'No recording'}</small></label>)}</>}
          </>}
        </fieldset>
        {!validated.success && <p className="validation-note" role="status">Complete the fields before saving. Preview shows the last valid draft. {validated.error.issues[0]?.message}</p>}
      </main>
      <section className="preview-panel" aria-label="Lesson preview"><div className="preview-toolbar"><div><span className="eyebrow">LIVE PREVIEW</span><h2>The learner experience</h2></div>
        <label>Screen<select aria-label="Preview screen size" value={device} onChange={event=>setDevice(Number(event.target.value))}>
          <option value={390}>Phone</option><option value={768}>Tablet</option><option value={1040}>Desktop</option></select></label></div>
        <div className="preview-modes"><button aria-pressed={mode==='self-paced'} onClick={()=>setMode('self-paced')}>Self Paced</button>
          <button aria-pressed={mode==='guided'} onClick={()=>setMode('guided')}>Guided</button><span>Unsaved edits preview automatically</span></div>
        <div className="preview-scroll"><div className={'preview-device '+(device===390?'phone':'')} style={{width:device}}>
          <iframe ref={frame} title="New Vines lesson preview" src={previewOrigin} onLoad={()=>frame.current?.contentWindow?.postMessage(latestPreview.current,previewOrigin)}/>
        </div></div><p className="preview-caption">Uses the existing Learning renderer. Drafts are not published to learners.</p>
      </section>
    </div>}
  </div>;
}
