import {useEffect,useRef,useState} from 'react';
import type {AuthoringModule} from '@novoapps/content-model';
import {api} from './api';
export function Publishing({module,onClose,onPublished}:{module:AuthoringModule;onClose:()=>void;onPublished:(value:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[bucket,setBucket]=useState('novoapps-content'),[url,setUrl]=useState(''),[approved,setApproved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{dialog.current?.showModal();void api<{bucket:string;publicBaseUrl:string}>('/storage-settings').then(value=>{setBucket(value.bucket);setUrl(value.publicBaseUrl);}).catch(error=>setError(String(error)));},[]);
 const unreviewed=!!module.sourceModuleId&&module.pages.some(page=>page.translationStatus!=='reviewed'||page.needsUpdate);
 async function publish(){setBusy(true);setError('');try{
  await api('/storage-settings','PUT',{bucket,publicBaseUrl:url});
  const result=await api<{url:string}>('/modules/'+module.id+'/publish','POST',{confirm:true,approvePrimaryWording:approved,structureRevision:module.structureRevision,metadataRevision:module.metadataRevision,pages:Object.fromEntries(module.pages.map(page=>[page.id,page.revision]))});
  onPublished(result.url);onClose();
 }catch(error){setError(String(error));}finally{setBusy(false);}}
 return <dialog ref={dialog} className="studio-dialog" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
  <h2>Publish Saved Content</h2><p>Publish this saved module, its images and narration to Cloudflare content storage. Updating the learner app is a separate step.</p>
  <label>R2 Bucket<input value={bucket} disabled={busy} onChange={event=>setBucket(event.target.value)}/></label>
  <label>Public Content URL<input type="url" value={url} disabled={busy} placeholder="https://content.example.org" onChange={event=>setUrl(event.target.value)}/></label>
  <p className="editor-help">Folder: {module.provider.slug} / {module.course.course_id} / {module.course.language}-{module.course.country.toLowerCase()} / Module {module.course.module.number}</p>
  {unreviewed&&<p className="review-note">Review every translated page against the current primary language before publishing.</p>}
  <label className="wording-lock"><input type="checkbox" checked={approved} disabled={busy} onChange={event=>setApproved(event.target.checked)}/><span>I have reviewed and approve this saved content, including Scripture and media.</span></label>
  {error&&<p className="inline-error" role="alert">{error}</p>}{busy&&<p role="status">Uploading course and media to Cloudflare… Keep this window open.</p>}
  <div className="dialog-actions"><button disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy||unreviewed||!approved||!url} onClick={()=>void publish()}>Publish</button></div>
 </dialog>;
}
