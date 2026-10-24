import { useEffect,useMemo,useRef,useState } from 'react';
import { courseSchema,templateSchema,appendBlock,newAuthoringId,sameBlockIds,
  type AuthoringModule,type CoursePage,type Provider } from '@novoapps/content-model';
import type {Access} from './Access';
import { api } from './api';
import { CreateDialog,AISettings,type FormSpec,type AIStatus } from './Forms';
import { PromptFields,TranslationFields } from './PageFields';
import {NarrationMedia,BlockImage} from './MediaAuthoring';
import {Publishing} from './Publishing';
const titleCase=(value:string)=>value.replace(/[_-]/g,' ').replace(/\b\w/g,letter=>letter.toUpperCase());
const screens={phonePortrait:{label:'Phone - Portrait',width:390,height:844},phoneLandscape:{label:'Phone - Landscape',width:844,height:390},tabletPortrait:{label:'Tablet - Portrait',width:768,height:1024},tabletLandscape:{label:'Tablet - Landscape',width:1024,height:768},desktop:{label:'Desktop',width:1280,height:800}};

type ModuleSummary={id:string;courseId:string;providerId:string;providerName:string;locale:string;canonicalId:string;
  sourceModuleId:string|null;course:{title:string};module:{title:string;number:number}};
type CourseSummary={id:string;providerId:string;canonicalId:string;locale:string;sourceCourseId:string|null;
  metadata:{title:string;language:string;country:string}};
const previewOrigin=new URL(import.meta.env.VITE_PREVIEW_ORIGIN||'http://127.0.0.1:5175').origin;
export function App({access}:{access:Access}){
  const owner=access.owner;
  const platform=import.meta.env.VITE_PLATFORM_ORIGIN||'http://127.0.0.1:5176';
  const [providers,setProviders]=useState<Provider[]>([]),[courses,setCourses]=useState<CourseSummary[]>([]);
  const [modules,setModules]=useState<ModuleSummary[]>([]),[providerId,setProviderId]=useState('');
  const [courseId,setCourseId]=useState(''),[module,setModule]=useState<AuthoringModule|null>(null);
  const [pageId,setPageId]=useState(''),[draft,setDraft]=useState<CoursePage|null>(null);
  const [unlock,setUnlock]=useState(false),[tab,setTab]=useState('content');
  const mode='self-paced' as const;
  const [device,setDevice]=useState<keyof typeof screens>('phonePortrait'),[collapsed,setCollapsed]=useState(false),[recording,setRecording]=useState(false),[showPublish,setShowPublish]=useState(false),[published,setPublished]=useState('');
  const draggedPage=useRef('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [form,setForm]=useState<FormSpec|null>(null),[showAI,setShowAI]=useState(false);
  const [ai,setAI]=useState<AIStatus>({configured:false,model:'gpt-5-mini',source:'none'});
  const [reviewNote,setReviewNote]=useState(''),[batch,setBatch]=useState<{label:string;completed:number;total:number}|null>(null);
  const cancelBatch=useRef(false),frame=useRef<HTMLIFrameElement>(null),latestPreview=useRef<unknown>(null);
  const savedPage=module?.course.module.pages.find(page=>page.id===pageId);
  const importInfo=module?.course.module.source_import as {filename?:string;issues?:{source_slide:number;note:string}[]}|undefined;
  const summary=module?.pages.find(page=>page.canonicalId===pageId);
  const originalSource=module?.sourceCourse?.module.pages.find(page=>page.id===pageId);
  const sourceIssue=module?.sourceCourse?.source_issues.find(issue=>issue.source_slide===originalSource?.source_slide);
  const sourcePage=originalSource&&sourceIssue?{...originalSource,presentation:{...originalSource.presentation,source_note:sourceIssue.note}}:originalSource;
  const dirty=!!draft&&(JSON.stringify(draft)!==JSON.stringify(savedPage)||reviewNote!==(summary?.reviewNote||''));
  const previewCourse=useMemo(()=>module&&draft?{...module.course,module:{...module.course.module,
    pages:module.course.module.pages.map(page=>page.id===pageId?draft:page)}}:null,[module,draft,pageId]);
  const validated=useMemo(()=>courseSchema.safeParse(previewCourse),[previewCourse]);
  const visibleModules=modules.filter(item=>item.providerId===providerId&&(!courseId||item.courseId===courseId));
  const visibleCourses=courses.filter(item=>item.providerId===providerId);
  const selectedCourse=courses.find(item=>item.id===courseId);
  const primaryCourseId=selectedCourse?.sourceCourseId||courseId;
  const editions=visibleCourses.filter(item=>(item.sourceCourseId||item.id)===primaryCourseId);
  function contextLabel(course:CourseSummary){try{return new Intl.DisplayNames(['en'],{type:'language'}).of(course.metadata.language)+' · '+(course.metadata.country.toLowerCase()==='global'?'Global':new Intl.DisplayNames(['en'],{type:'region'}).of(course.metadata.country.toUpperCase()))+(!course.sourceCourseId?' (Primary)':'');}catch{return course.locale;}}
  function chooseCourse(id:string){if(!mayLeave())return;setCourseId(id);const selected=modules.find(item=>item.courseId===id&&item.canonicalId===module?.course.module.id)||modules.find(item=>item.courseId===id);if(selected)void action(async()=>{await loadModule(selected.id,pageId);});else{setModule(null);setDraft(null);}}
  const writable=owner||!!module?.sourceModuleId&&access.grants.some(grant=>grant.provider_id===module.provider.id&&grant.locale===module.course.language+'-'+module.course.country.toLowerCase()&&grant.course_id===primaryCourseId);
  const mediaOwner=(blockId:string)=>({moduleId:module!.id,pageId:summary!.id,blockId,expectedRevision:summary!.revision});
  function mayLeave(){return !busy&&!recording&&(!dirty||window.confirm('Discard unsaved draft changes?'));}
  function selectPage(selected:AuthoringModule,id:string){
    setModule(selected);setPageId(id);setDraft(structuredClone(selected.course.module.pages.find(page=>page.id===id)!));
    setReviewNote(selected.pages.find(page=>page.canonicalId===id)?.reviewNote||'');setUnlock(false);setNotice('');setError('');if(!selected.sourceModuleId&&tab==='translation')setTab('content');
  }
  async function loadModule(id:string,selectedPage?:string){
    const selected=await api<AuthoringModule>('/modules/'+id);
    setProviderId(selected.provider.id);setCourseId(selected.courseId);
    selectPage(selected,selectedPage&&selected.pages.some(page=>page.canonicalId===selectedPage)?selectedPage:selected.course.module.pages[0].id);
    sessionStorage.setItem('novoapps.cms.last-module',id);
    return selected;
  }
  async function library(){
    const [providerRows,courseRows,moduleRows]=await Promise.all([api<Provider[]>('/providers'),api<CourseSummary[]>('/courses'),api<ModuleSummary[]>('/modules')]);
    setProviders(providerRows);setCourses(courseRows);setModules(moduleRows);
    return {providerRows,courseRows,moduleRows};
  }
  useEffect(()=>{void(async()=>{
    try{
      const {providerRows,moduleRows}=await library();
      const last=sessionStorage.getItem('novoapps.cms.last-module');
      if(moduleRows.length)await loadModule(moduleRows.find(item=>item.id===last)?.id||moduleRows.find(item=>!owner&&item.sourceModuleId&&access.grants.some(grant=>grant.provider_id===item.providerId&&grant.locale===item.locale))?.id||moduleRows[0].id);
      else setProviderId(providerRows[0]?.id||'');
      if(owner)setAI(await api<AIStatus>('/translation-settings'));
    }catch(error){setError(String(error));}
  })();},[]);
  useEffect(()=>{
    const beforeUnload=(event:BeforeUnloadEvent)=>{if(dirty||busy||recording){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',beforeUnload);return()=>window.removeEventListener('beforeunload',beforeUnload);
  },[dirty,busy,recording]);
  useEffect(()=>{
    if(!validated.success)return;
    const payload={type:'NOVOAPPS_CMS_PREVIEW',course:validated.data,pageId,mode,
      provider:{name:module?.provider.name,slug:module?.provider.slug}};
    latestPreview.current=payload;
    const timer=window.setTimeout(()=>frame.current?.contentWindow?.postMessage(payload,previewOrigin),200);
    return()=>clearTimeout(timer);
  },[validated,pageId,mode,module?.provider.name]);
  function edit(patch:Partial<CoursePage>){if(draft){setDraft({...draft,...patch});setNotice('');}}
  async function action(work:()=>Promise<void>){
    setBusy(true);setError('');setNotice('');
    try{await work();}catch(error){setError(String(error));}finally{setBusy(false);}
  }
  async function save(reviewed=false){
    if(!module||!draft||!summary||!validated.success||busy)return;
    if(reviewed&&!window.confirm('Have you reviewed every translated field against the current source, including Scripture and narration? This marks local review only; it does not publish.'))return;
    await action(async()=>{
      await api('/pages/'+summary.id+'/draft','PUT',{expectedRevision:summary.revision,page:draft,
        allowWordingChanges:!!module.sourceModuleId||unlock,
        allowStructureChanges:!sameBlockIds(savedPage!,draft),
        removedBlockIds:savedPage!.blocks.filter(block=>!draft.blocks.some(item=>item.id===block.id)).map(block=>block.id),
        ...(module.sourceModuleId?{translationStatus:reviewed?'reviewed':'draft',
          sourceRevision:reviewed?summary.sourceCurrentRevision:summary.sourceRevision,reviewNote}:{})});
      await loadModule(module.id,pageId);setNotice(reviewed?'Translation marked reviewed locally. Nothing was published.':'Draft saved. Published content has not changed.');
    });
  }
  function moveBlock(index:number,delta:number){
    if(!draft)return;const blocks=[...draft.blocks],target=index+delta;
    if(target<0||target>=blocks.length)return;
    [blocks[index],blocks[target]]=[blocks[target],blocks[index]];edit({blocks});
  }
  const titleField=(value='')=>({name:'title',label:'Title',value});
  function createProvider(){
    if(!mayLeave())return;
    setForm({title:'Add content provider',submit:'Create provider',fields:[{name:'name',label:'Provider name'},{name:'slug',label:'Provider slug',hint:'Lowercase letters, numbers and hyphens'}],
      save:async values=>{const created=await api<Provider>('/providers','POST',values);await library();setProviderId(created.id);setCourseId('');setModule(null);setDraft(null);}});
  }
  function createCourse(){
    if(!mayLeave()||!providerId)return;
    setForm({title:'Add source course',submit:'Create course',description:'Create the canonical source edition. Translations will link back to it.',
      fields:[titleField(),{name:'code',label:'Stable course code',hint:'Unique within this provider, for example foundations'},
        {name:'track',label:'Program / catalog',value:'General learning',required:false},{name:'language',label:'Source language',value:'en'},
        {name:'region',label:'Source country/region',value:'global',hint:'global, a country code such as NI, or a numeric region'}],
      save:async values=>{const result=await api<{courseId:string}>('/courses','POST',{...values,providerId});await library();setCourseId(result.courseId);setModule(null);setDraft(null);}});
  }
  function createModule(){
    if(!mayLeave())return;
    const sources=visibleCourses.filter(item=>!item.sourceCourseId);
    if(!sources.length){setError('Add a source course first.');return;}
    const selected=sources.find(item=>item.id===courseId)||sources[0];
    const nextNumber=Math.max(0,...modules.filter(item=>item.courseId===selected.id).map(item=>item.module.number))+1;
    setForm({title:'Add module',submit:'Create module',description:'A new module starts with one editable draft page.',
      fields:[{name:'courseId',label:'Source course',type:'select',value:selected.id,options:sources.map(item=>({value:item.id,label:item.metadata.title+' · '+item.locale}))},
        {name:'number',label:'Module number',type:'number',value:String(nextNumber)},titleField()],
      save:async values=>{const result=await api<{moduleId:string}>('/modules','POST',{...values,number:Number(values.number)});await library();await loadModule(result.moduleId);}});
  }
  function createPage(){
    if(!module||!mayLeave())return;
    setForm({title:'Add page',submit:'Create page',fields:[titleField(),{name:'template',label:'Layout',type:'select',value:'teaching',options:templateSchema.options.map(value=>({value,label:titleCase(value)}))}],
      save:async values=>{const result=await api<{pageId:string}>('/modules/'+module.id+'/pages','POST',{...values,afterPageId:summary?.id,expectedStructureRevision:module.structureRevision});
        const selected=await api<AuthoringModule>('/modules/'+module.id);
        await loadModule(module.id,selected.pages.find(page=>page.id===result.pageId)!.canonicalId);setUnlock(true);}});
  }
  function createBlock(){
    if(!draft)return;
    setForm({title:'Add content block',submit:'Add to draft',description:'A new block gets a stable UUIDv7 ID. Save the page to keep it.',
      fields:[{name:'type',label:'Block type',type:'select',value:'paragraph',options:['paragraph','scripture','concept','step','list','table','flow','question','prayer','title'].map(value=>({value,label:titleCase(value)}))},
        {name:'text',label:'Content',type:'textarea'}],
      save:async values=>{setDraft(appendBlock(draft,newAuthoringId(),values.type,values.text));setUnlock(true);setNotice('Block added to the unsaved draft.');}});
  }
  function createEdition(){
    if(!module||!mayLeave())return;
    setForm({title:'Create language / regional edition',submit:'Create edition',
      description:'Source-linked copies start as untranslated. Source text is retained for comparison, and English recordings are detached. Nothing is translated until you request it.',
      fields:[{name:'language',label:'Language code',value:'es',hint:'For example es for Spanish'},{name:'region',label:'Country / region',value:'NI',hint:'NI for Nicaragua; global for a language-wide edition'}],
      save:async values=>{let id='';try{const result=await api<{moduleId:string}>('/modules/'+module.id+'/editions','POST',values);id=result.moduleId;}catch(error){const {courseRows,moduleRows}=await library();const locale=values.language.toLowerCase()+'-'+values.region.toLowerCase();const course=courseRows.find(item=>(item.sourceCourseId||item.id)===primaryCourseId&&item.locale.toLowerCase()===locale);const existing=moduleRows.find(item=>item.courseId===course?.id&&item.canonicalId===module.course.module.id);if(!existing)throw error;id=existing.id;}await library();await loadModule(id);setTab('translation');}});
  }
  function editHeadings(){
    if(!module||!mayLeave())return;
    setForm({title:'Edit course / module headings',submit:'Save draft headings',
      fields:[{name:'courseTitle',label:'Course title',value:module.course.title},{name:'moduleTitle',label:'Module title',value:module.course.module.title},{name:'track',label:'Program / catalog',value:module.course.track,required:false}],
      save:async values=>{await api('/modules/'+module.id+'/headings','PUT',{expectedRevision:module.metadataRevision,headings:values});await library();await loadModule(module.id,pageId);}});
  }
  async function translatePage(){
    if(!module||!summary||dirty||busy)return;
    if(!ai.configured){setShowAI(true);return;}
    const overwrite=summary.translationStatus!=='untranslated';
    if(!window.confirm(overwrite?'Replace this page’s existing translation with a new AI draft? Previous revisions are retained. This uses your OpenAI account.':'Generate an AI translation for this page using your OpenAI account? It will require human review.'))return;
    await action(async()=>{await api('/pages/'+summary.id+'/translate','POST',{expectedRevision:summary.revision,overwrite});await loadModule(module.id,pageId);setNotice('AI translation saved as a draft. Review and edit it before marking it reviewed.');});
  }
  async function translateModule(){
    if(!module||dirty||busy)return;
    if(!ai.configured){setShowAI(true);return;}
    const pending=module.pages.filter(page=>page.translationStatus==='untranslated');
    if(!pending.length){setNotice('No untranslated pages remain. Regenerate individual pages explicitly if needed.');return;}
    if(!window.confirm('Translate '+pending.length+' untranslated pages using your OpenAI account? Existing edited/reviewed pages are skipped. Generation can be stopped between pages.'))return;
    cancelBatch.current=false;
    await action(async()=>{
      let completed=0;const headings=module.metadataRevision===1,total=pending.length+(headings?1:0);
      setBatch({label:headings?'Translating Course And Module Headings…':'Starting Translation…',completed:0,total});
      try{
        if(headings){await api('/modules/'+module.id+'/translate-headings','POST',{expectedRevision:module.metadataRevision});setBatch({label:'Headings Translated',completed:1,total});}
        for(const page of pending){
          if(cancelBatch.current)break;
          setBatch({label:'Translating Page '+(completed+1)+' Of '+pending.length+'…',completed:completed+(headings?1:0),total});
          await api('/pages/'+page.id+'/translate','POST',{expectedRevision:page.revision});completed++;setBatch({label:completed+' Pages Translated',completed:completed+(headings?1:0),total});
        }
      }finally{setBatch(value=>value?{...value,label:completed===pending.length?'Translation Complete':cancelBatch.current?'Translation Stopped':'Translation Interrupted'}:value);await library();await loadModule(module.id,pageId);}
      setNotice(completed+' pages translated and saved for review.'+(cancelBatch.current?' Generation stopped.':''));
    });
  }
  async function translateHeadings(){
    if(!module||busy||dirty)return;
    if(!ai.configured){setShowAI(true);return;}
    if(!window.confirm('Generate translated course/module headings using your OpenAI account? Existing heading edits will be replaced; page translations are unchanged.'))return;
    await action(async()=>{await api('/modules/'+module.id+'/translate-headings','POST',{expectedRevision:module.metadataRevision});await library();await loadModule(module.id,pageId);});
  }
  async function exportDraft(){
    if(!module||dirty||busy)return;
    if(module.sourceModuleId&&module.pages.some(page=>page.translationStatus!=='reviewed'||page.needsUpdate)&&
      !window.confirm('This edition contains untranslated or unreviewed material. Download an explicitly marked draft for review?'))return;
    await action(async()=>{
      const document=await api('/modules/'+module.id+'/export');
      const url=URL.createObjectURL(new Blob([JSON.stringify(document,null,2)],{type:'application/json'}));
      const link=documentElement('a');link.href=url;link.download=module.course.module.id+'.'+module.course.language+'-'+module.course.country.toLowerCase()+'.draft.json';link.click();URL.revokeObjectURL(url);
    });
  }

  async function reorderPages(ids:string[]){
    if(!module||!mayLeave())return;
    await action(async()=>{await api('/modules/'+module.id+'/page-order','PUT',{expectedStructureRevision:module.structureRevision,pageIds:ids});await loadModule(module.id,pageId);});
  }
  function dropPage(target:string,after:boolean){
    const from=draggedPage.current;draggedPage.current='';if(!module||!from||from===target)return;
    const ids=module.pages.map(page=>page.id).filter(id=>id!==from);ids.splice(ids.indexOf(target)+(after?1:0),0,from);void reorderPages(ids);
  }
  async function deletePage(){
    if(!module||!summary||!mayLeave()||!window.confirm('Delete this page from the module? Linked translations will also be removed from their active edition. Previous revisions are retained.'))return;
    await action(async()=>{await api('/modules/'+module.id+'/pages/'+summary.id+'/delete','POST',{expectedStructureRevision:module.structureRevision});await loadModule(module.id);});
  }
  function deleteBlock(id:string){
    if(!draft||!window.confirm('Delete this content block and its narration mapping? Save the page to keep this change. Previous revisions are retained.'))return;
    const blocks=draft.blocks.filter(block=>block.id!==id);
    edit({blocks,presentation:{...draft.presentation,reveal_blocks:blocks.some(block=>block.type!=='title')&&draft.presentation?.reveal_blocks},
      guided:draft.guided?{...draft.guided,segments:draft.guided.segments?.filter(segment=>segment.block_id!==id)}:undefined});setUnlock(true);
  }
  function changeBlockType(id:string,type:string){
    if(!draft)return;setUnlock(true);
    const blocks=draft.blocks.map(block=>block.id===id?{...block,type}:block);
    let segments=draft.guided?.segments?.filter(segment=>blocks.some(block=>block.id===segment.block_id&&block.type!=='title'));
    if(segments&&type!=='title'&&!segments.some(segment=>segment.block_id===id))segments=[...segments,{block_id:id,text:blocks.find(block=>block.id===id)!.text||'Add narration'}];
    edit({blocks,presentation:{...draft.presentation,reveal_blocks:blocks.some(block=>block.type!=='title')&&draft.presentation?.reveal_blocks},guided:draft.guided?{...draft.guided,segments}:undefined});
  }
  return <div className="studio">
    <div className="studio-top"><header className="studio-header"><a href="/" className="studio-brand"><span className="brand-mark">N</span><span>NovoApps<strong>Content Studio</strong></span></a>
      <span className="local-label">{access.mode==='local'?'Local Authoring':owner?'Owner':'Course Reviewer'}</span>{access.mode==='authenticated'&&<a href={platform} target="_blank" rel="noreferrer">Account & Access</a>}<span className="header-spacer"/>
      {owner&&<button disabled={busy} onClick={()=>setShowAI(true)}>AI Settings</button>}
      <button disabled={!module||dirty||busy} onClick={()=>void exportDraft()}>Export Draft</button>
      <button className="primary" disabled={!owner||!module||dirty||busy||recording} onClick={()=>setShowPublish(true)}>Publish</button>
    </header>

    <div className="library-toolbar">
      <label>Provider<select value={providerId} disabled={busy||recording} onChange={event=>{if(mayLeave()){setProviderId(event.target.value);setCourseId('');setModule(null);setDraft(null);}}}>{providers.map(provider=><option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
      <label>Course<select value={primaryCourseId} disabled={busy||recording} onChange={event=>chooseCourse(event.target.value)}>
        <option value="">Choose A Course</option>{visibleCourses.filter(course=>!course.sourceCourseId).map(course=><option key={course.id} value={course.id}>{course.metadata.title}</option>)}</select></label>
      <label>Language/Context<select value={courseId} disabled={!courseId||busy||recording} onChange={event=>chooseCourse(event.target.value)}>
        {!courseId&&<option value="">Choose A Course First</option>}{editions.map(course=><option key={course.id} value={course.id}>{contextLabel(course)}</option>)}</select></label>
      {owner&&<details className="creation-menu" onClick={event=>{if((event.target as HTMLElement).closest('button'))event.currentTarget.open=false;}}><summary>Add To Library</summary><div><button disabled={busy||recording} onClick={createProvider}>Add Provider</button><button disabled={busy||recording||!providerId} onClick={createCourse}>Add Course</button><button disabled={busy||recording||!providerId} onClick={createModule}>Add Module</button></div></details>}
    </div>
    <div className="studio-context"><div><h1>{module?.course.title||'Choose Or Create A Course'}</h1>
      <p>{module?'Module '+module.course.module.number+' · '+module.course.module.title:'Add a provider, course and module to start authoring.'}</p>
      {module&&<div className="heading-actions"><button className="text-button" disabled={!owner||busy||recording} onClick={editHeadings}>Edit Headings</button><span>Language/Locale <strong>{module.course.language+'-'+module.course.country.toLowerCase()}</strong></span></div>}</div><span className="draft-label">Draft Authoring</span></div>
    </div>
    {error&&<div className="message error" role="alert">{error}{module&&<button disabled={busy} onClick={()=>mayLeave()&&void action(async()=>{await loadModule(module.id,pageId);})}>Reload latest draft</button>}</div>}
    {!owner&&module&&!writable&&<div className="message">Primary Language: Read Only. Choose your assigned language in Language/Context to edit and review.</div>}
    {notice&&<div className="message success" role="status">{notice}</div>}
    {batch&&<div className="translation-progress message" role="status"><strong>{batch.label}</strong><div><progress aria-label="Translation Progress" max={batch.total} value={batch.completed}/><span>{Math.round(batch.completed/batch.total*100)}%</span></div>{busy?<button onClick={()=>{cancelBatch.current=true;}}>Stop After This Page</button>:<button onClick={()=>setBatch(null)}>Dismiss</button>}</div>}
    {!module?<main className="empty"><h2>Your content library</h2><p>Select a course or use Add module to create the next part of your course.</p></main>:
      <div className={'workspace '+(collapsed?'editor-collapsed':'')}>
        <aside className="page-sidebar"><label className="module-select">Module<select value={module.id} disabled={busy} onChange={event=>{if(mayLeave())void action(async()=>{await loadModule(event.target.value);});}}>
          {visibleModules.map(item=><option key={item.id} value={item.id}>{item.module.number+' · '+item.module.title}</option>)}</select></label>
          {!module.sourceModuleId?<button className="sidebar-action" disabled={!owner||busy} onClick={createEdition}>Create Language Edition</button>:
            <button className="sidebar-action" disabled={busy} onClick={()=>mayLeave()&&void action(async()=>{await loadModule(module.sourceModuleId!,pageId);})}>Open Primary Language</button>}
          <div className="sidebar-heading"><strong>Pages</strong><span>{module.pages.length}</span></div>
          {owner&&!module.sourceModuleId&&<button className="sidebar-action" disabled={busy} onClick={createPage}>Add Page Below</button>}
          <nav aria-label="Course Pages">{module.course.module.pages.map((page,index)=>{
            const state=module.pages.find(item=>item.canonicalId===page.id)!;
            return <div className="page-row" key={page.id} draggable={owner&&!busy&&!recording&&!module.sourceModuleId} onDragStart={event=>{draggedPage.current=state.id;event.dataTransfer.setData('text/plain',state.id);event.dataTransfer.effectAllowed='move';}} onDragEnd={()=>{draggedPage.current='';}} onDragOver={event=>{if(!module.sourceModuleId){event.preventDefault();event.dataTransfer.dropEffect='move';}}} onDrop={event=>{event.preventDefault();const box=event.currentTarget.getBoundingClientRect();dropPage(state.id,event.clientY>box.top+box.height/2);}}>
              <button disabled={busy||recording} className={'page-link '+(pageId===page.id?'selected':'')}
              onClick={()=>{if(mayLeave())selectPage(module,page.id);}}>
              <span className="page-number">{index+1}</span><span>{page.title}{state.translationStatus&&<small className={'page-state '+(state.needsUpdate?'stale':'')}>{state.needsUpdate?'Source changed':state.translationStatus}</small>}</span></button>{owner&&!module.sourceModuleId&&<div className="page-order-controls"><button aria-label={'Move Page '+(index+1)+' Up'} disabled={busy||recording||index===0} onClick={()=>{const ids=module.pages.map(page=>page.id);[ids[index],ids[index-1]]=[ids[index-1],ids[index]];void reorderPages(ids);}}>↑</button><button aria-label={'Move Page '+(index+1)+' Down'} disabled={busy||recording||index===module.pages.length-1} onClick={()=>{const ids=module.pages.map(page=>page.id);[ids[index],ids[index+1]]=[ids[index+1],ids[index]];void reorderPages(ids);}}>↓</button></div>}</div>;
          })}</nav>
          {owner&&!module.sourceModuleId&&<button className="sidebar-action danger" disabled={busy||recording||module.pages.length<2} onClick={()=>void deletePage()}>Delete Selected Page</button>}
        </aside>
        {collapsed?<div className="editor-rail"><button aria-label="Expand Content Editor" onClick={()=>setCollapsed(false)}>›<span>Edit Content</span></button></div>:<main className="editor">

          <div className="editor-heading"><div><span className="eyebrow">Page {module.course.module.pages.findIndex(page=>page.id===pageId)+1} Of {module.pages.length}</span><button className="text-button" aria-label="Collapse Content Editor" onClick={()=>setCollapsed(true)}>‹ Collapse Editor</button></div>
            <div className="save-controls"><div><button disabled={!dirty||busy||recording} onClick={()=>{if(window.confirm('Discard unsaved changes on this page?'))selectPage(module,pageId);}}>Cancel</button><button className="primary" disabled={!writable||!dirty||busy||recording||!validated.success} onClick={()=>void save()}>Save</button></div><small role="status">{dirty?'Unsaved Changes':'Saved · Revision '+summary?.revision}</small></div></div>
          <h2>{savedPage?.title}</h2>
          {importInfo&&<p className="muted">PowerPoint Source: Slide {savedPage?.source_slide} · {importInfo.filename}</p>}
          {importInfo?.issues?.filter(issue=>issue.source_slide===savedPage?.source_slide).map((issue,index)=><p className="review-note" key={index}>Source Review: {issue.note}</p>)}
          {summary?.wordingReviewRequired&&owner&&!module.sourceModuleId&&<p className="review-note">This draft requires content review before publication.</p>}
          {module.sourceModuleId&&<div className="translation-banner"><strong>{summary?.needsUpdate?'Source changed — compare again':summary?.translationStatus}</strong>
            <p>{module.course.language} · {module.course.country} · linked to source revision {summary?.sourceRevision}{summary?.sourceCurrentRevision!==summary?.sourceRevision?' (current '+summary?.sourceCurrentRevision+')':''}</p>
            <button disabled={!owner||busy||dirty} onClick={()=>void translatePage()}>{summary?.translationStatus==='untranslated'?'Auto-Translate Page':'Regenerate Page Translation'}</button>
            <button disabled={!owner||busy||dirty} onClick={()=>void translateModule()}>Translate Remaining Pages</button>
            {module.missingSourcePages>0&&<button disabled={!owner||busy||dirty} onClick={()=>void action(async()=>{await api('/modules/'+module.id+'/sync-source','POST',{});await loadModule(module.id,pageId);})}>Add {module.missingSourcePages} new source pages</button>}
          </div>}
          <div className="editor-tabs" role="tablist" aria-label="Page editor">{[['content','Content'],['reflections','Reflections'],['narration','Narration'],...(module.sourceModuleId?[['translation','Translation']]:[])].map(([value,label])=>
            <button key={value} role="tab" aria-selected={tab===value} onClick={()=>setTab(value)}>{label}</button>)}</div>
          <fieldset disabled={busy||!writable}>
            {draft&&tab==='content'&&<>
              {owner&&!module.sourceModuleId&&<label className="wording-lock"><input type="checkbox" checked={unlock} onChange={event=>setUnlock(event.target.checked)}/><span>Create Wording Changes For Review<small>Original imported wording and previous revisions are retained.</small></span></label>}
              <label>Page Title<input value={draft.title} readOnly={owner&&!module.sourceModuleId&&!unlock} onChange={event=>edit({title:event.target.value})}/></label>
              <label>Page Layout<select disabled={!owner} value={draft.template||'teaching'} onChange={event=>edit({template:event.target.value as CoursePage['template'],layout:event.target.value,presentation:{...draft.presentation,reveal_blocks:!['title','prayer'].includes(event.target.value)}})}>{templateSchema.options.map(value=><option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
              <label className="wording-lock"><input type="checkbox" disabled={!owner} checked={!!draft.presentation?.reveal_blocks} onChange={event=>edit({presentation:{...draft.presentation,reveal_blocks:event.target.checked}})}/><span>Reveal Content Section By Section</span></label>
              <div className="section-heading"><h3>Content Blocks</h3>{owner&&!module.sourceModuleId&&<button onClick={createBlock}>Add Content Block</button>}</div>
              {draft.blocks.map((block,index)=><section className="block-card" key={block.id}>
                <div className="block-heading"><strong>{block.type==='title'?'Title':'Section '+draft.blocks.slice(0,index+1).filter(item=>item.type!=='title').length}</strong><select disabled={!owner} aria-label={'Content Block Type For Section '+(index+1)} value={block.type} onChange={event=>changeBlockType(block.id,event.target.value)}>{Array.from(new Set(['paragraph','scripture','concept','step','list','table','flow','question','prayer','title',block.type])).map(type=><option key={type} value={type}>{titleCase(type)}</option>)}</select>
                  <button aria-label={'Move block '+(index+1)+' up'} disabled={!owner||index===0} onClick={()=>moveBlock(index,-1)}>↑</button><button aria-label={'Move block '+(index+1)+' down'} disabled={!owner||index===draft.blocks.length-1} onClick={()=>moveBlock(index,1)}>↓</button></div>
                <textarea aria-label={'Text for '+block.id} rows={Math.min(12,Math.max(3,block.text.split('\n').length+1))} readOnly={owner&&!module.sourceModuleId&&!unlock} value={block.text}
                  onChange={event=>edit({blocks:draft.blocks.map(item=>item.id===block.id?{...item,text:event.target.value}:item)})}/>
                <small className="stable-id">{block.id}{block.icon?' · '+block.icon+' icon retained':''}</small>
                {block.type==='table'&&<p className="editor-help">Table rows use one line each, with tabs between columns. Empty cells preserve the column positions.</p>}

                {owner&&<BlockImage text={block.text} owner={mediaOwner(block.id)} alt={block.image?.alt||''} src={block.image?.src} disabled={busy||!savedPage?.blocks.some(item=>item.id===block.id)} onDescription={value=>{if(block.image)edit({blocks:draft.blocks.map(item=>item.id===block.id?{...item,image:{...item.image!,alt:value}}:item)});}} onImage={image=>edit({blocks:draft.blocks.map(item=>item.id===block.id?{...item,image}:item)})}/>}
                {owner&&!module.sourceModuleId&&<button className="text-button danger" disabled={draft.blocks.length<2} onClick={()=>deleteBlock(block.id)}>Delete Content Block</button>}

              </section>)}
            </>}
            {draft&&tab==='reflections'&&<>
              <p className="editor-help">Individual and group questions work in both Self Paced and Guided.</p>
              <PromptFields textOnly={!owner} label="Individual Reflection" value={draft.reflection} onChange={value=>edit({reflection:value})}/>
              <PromptFields textOnly={!owner} label="Group / Facilitator Question" value={draft.guided?.facilitator} onChange={value=>edit({guided:{...draft.guided,narration:draft.guided?.narration||'',facilitator:value}})}/>
            </>}
            {draft&&tab==='narration'&&<>
              <p className="editor-help">Narration maps to canonical content blocks. Adding a script uses browser voice until a recording is explicitly attached. Editing a recorded script detaches its old audio reference; the original file is retained.</p>
              <button disabled={!owner||!draft.blocks.some(block=>block.type!=='title')} onClick={()=>{
                const existing=new Map(draft.guided?.segments?.map(segment=>[segment.block_id,segment]));
                edit({guided:{...draft.guided,narration:draft.guided?.narration||'',narration_mode:draft.guided?.narration_mode||'browser_tts',
                  segments:draft.blocks.filter(block=>block.type!=='title').map(block=>existing.get(block.id)||{block_id:block.id,text:block.text||'Add narration'})}});
              }}>{draft.guided?.segments?.length?'Add Mappings For New Blocks':'Add Narration For Content Blocks'}</button>
              {draft.guided&&<label>Page Narration Notes<textarea rows={3} value={draft.guided.narration} onChange={event=>edit({guided:{...draft.guided!,narration:event.target.value}})}/></label>}
              {!!draft.guided?.segments?.length&&<label>Playback<select disabled={!owner} value={draft.guided.narration_mode||'marin_opus'} onChange={event=>edit({guided:{...draft.guided!,narration_mode:event.target.value as 'browser_tts'|'marin_opus'}})}><option value="browser_tts">Browser Voice</option><option value="marin_opus">Recorded Opus Audio</option></select></label>}
              {draft.guided?.segments?.map((segment,index)=><section className="narration-card" key={segment.block_id}><label>Section {index+1}
                <textarea rows={4} value={segment.text} onChange={event=>edit({guided:{...draft.guided!,segments:draft.guided!.segments!.map(item=>{if(item.block_id!==segment.block_id)return item;const {audio:_audio,audio_source:_source,...rest}=item;return {...rest,text:event.target.value};})}})}/>
                <small>{segment.audio||'No recording attached'}</small>
                <span className="media-location-label">Narration File Location</span><input readOnly={!owner} aria-label={'Narration File Location For '+segment.block_id} placeholder="/audio/approved-recording.opus (optional)" value={segment.audio||''} onChange={event=>edit({guided:{...draft.guided!,segments:draft.guided!.segments!.map(item=>{if(item.block_id!==segment.block_id)return item;const next={...item};if(event.target.value)next.audio=event.target.value;else delete next.audio;return next;})}})}/>
              </label>
                {segment.audio&&<audio controls preload="none" src={segment.audio}/>}
                {owner&&<NarrationMedia owner={mediaOwner(segment.block_id)} text={segment.text} disabled={busy||!savedPage?.blocks.some(block=>block.id===segment.block_id)} onRecording={setRecording} onAudio={(audio,source)=>edit({guided:{...draft.guided!,narration_mode:'marin_opus',segments:draft.guided!.segments!.map(item=>item.block_id===segment.block_id?{...item,audio,audio_source:source}:item)}})}/>}
              </section>)}
            </>}
            {draft&&tab==='translation'&&sourcePage&&<>
              <p className="editor-help">Source on the left; editable translation on the right. Check Scripture against the authorized Spanish Bible text. Automatic translation does not establish an official NTV quotation. Image adaptation and new recordings require separate review.</p>
              {owner&&<div className="translation-tools"><button disabled={dirty} onClick={()=>void translateHeadings()}>Auto-translate headings</button><button onClick={editHeadings}>Edit Headings</button></div>}
              <TranslationFields source={sourcePage} draft={draft} onChange={value=>{setDraft(value);setNotice('');}}/>
              <label>Reviewer Notes<textarea rows={3} value={reviewNote} onChange={event=>setReviewNote(event.target.value)}/></label>
              <button className="primary" disabled={!validated.success} onClick={()=>void save(true)}>Save and mark reviewed</button>
              <p className="editor-help">Review status is saved with the current source revision. Publication requires the owner.</p>
            </>}
          </fieldset>
          {!validated.success&&<p className="validation-note" role="status">Complete the fields before saving. Preview keeps the last valid draft. {validated.error.issues[0]?.message}</p>}
        </main>}
        <section className="preview-panel" aria-label="Lesson preview">

          <div className="preview-toolbar"><div><span className="eyebrow">Live Preview</span><h2>The Learner Experience</h2></div><label>Screen<select value={device} aria-label="Preview Screen Size" onChange={event=>setDevice(event.target.value as keyof typeof screens)}>{Object.entries(screens).map(([value,screen])=><option key={value} value={value}>{screen.label}</option>)}</select></label></div>
          <div className="preview-scroll"><div className={'preview-device '+(device.startsWith('phone')?'phone':'')} style={{width:screens[device].width,height:screens[device].height}}><iframe ref={frame} title="Course preview" src={previewOrigin} onLoad={()=>frame.current?.contentWindow?.postMessage(latestPreview.current,previewOrigin)}/></div></div>
          <p className="preview-caption">Actual course rendering. Drafts and local review status do not publish content.</p>
        </section>
      </div>}
    {published&&<a className="published-link" href={published} target="_blank" rel="noreferrer">Open Published Module JSON</a>}
    {showPublish&&module&&<Publishing module={module} onClose={()=>setShowPublish(false)} onPublished={value=>{setPublished(value);setNotice('Module published to Cloudflare content storage.');}}/>}
    {form&&<CreateDialog key={form.title} spec={form} onClose={()=>setForm(null)}/>}
    {showAI&&<AISettings status={ai} onChange={setAI} onClose={()=>setShowAI(false)}/>}
  </div>;
}
function documentElement<K extends keyof HTMLElementTagNameMap>(tag:K){return document.createElement(tag);}
