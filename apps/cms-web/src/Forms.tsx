const titleCase=(value:string)=>value.replace(/\b\w/g,letter=>letter.toUpperCase());
import { useEffect,useRef,useState } from 'react';
import { api } from './api';
type Field={name:string;label:string;value?:string;type?:'text'|'number'|'textarea'|'select';options?:{value:string;label:string}[];hint?:string;required?:boolean};
export type FormSpec={title:string;description?:string;fields:Field[];submit:string;save:(values:Record<string,string>)=>Promise<void>};
export function CreateDialog({spec,onClose}:{spec:FormSpec;onClose:()=>void}){
  const element=useRef<HTMLDialogElement>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{element.current?.showModal();return()=>element.current?.close();},[]);
  return <dialog ref={element} className="studio-dialog" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');
      const values=Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string,string>;
      try{await spec.save(values);onClose();}catch(error){setError(String(error));}finally{setBusy(false);}}}>
      <h2>{titleCase(spec.title)}</h2>{spec.description&&<p className="editor-help">{spec.description}</p>}
      <fieldset disabled={busy}>{spec.fields.map(field=><label key={field.name}>{titleCase(field.label)}
        {field.type==='select'?<select name={field.name} defaultValue={field.value} required={field.required!==false}>{field.options?.map(option=><option key={option.value} value={option.value}>{titleCase(option.label)}</option>)}</select>:
         field.type==='textarea'?<textarea name={field.name} defaultValue={field.value} rows={5} required={field.required!==false}/>:
         <input name={field.name} type={field.type||'text'} defaultValue={field.value} min={field.type==='number'?1:undefined} required={field.required!==false}/>}
         {field.hint&&<small>{field.hint}</small>}</label>)}</fieldset>
      {error&&<p className="message error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy?'Saving…':spec.submit}</button></div>
    </form>
  </dialog>;
}
export type AIStatus={configured:boolean;model:string;source:string};
export function AISettings({status,onChange,onClose}:{status:AIStatus;onChange:(value:AIStatus)=>void;onClose:()=>void}){
  const element=useRef<HTMLDialogElement>(null);
  const [key,setKey]=useState(''),[model,setModel]=useState(status.model),[current,setCurrent]=useState(status);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
  useEffect(()=>{
    element.current?.showModal();let active=true;
    void api<AIStatus>('/translation-settings').then(value=>{
      if(!active)return;setCurrent(value);setModel(value.model);onChange(value);
    }).catch(error=>{if(active)setError(String(error));}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;element.current?.close();};
  },[]);
  async function save(forget=false){
    setBusy(true);setError('');setMessage('');
    try{
      const saved=await api<AIStatus>('/translation-settings','PUT',{model,...(key.trim()?{apiKey:key.trim()}:{}),...(forget?{forget:true}:{})});
      // Confirm the next request can see the saved configuration before reporting success.
      const confirmed=await api<AIStatus>('/translation-settings');
      setCurrent(confirmed);onChange(confirmed);
      if(saved.configured!==confirmed.configured||saved.model!==confirmed.model||(!forget&&!confirmed.configured))
        throw new Error('The API did not retain these settings. It may have restarted. Please save your key again.');
      setKey('');
      setMessage(forget?'AI generation is disabled for this session.':'API key and settings saved for this session. Translation, images and narration use the same key.');
    }catch(error){setError(String(error));}finally{setBusy(false);}
  }
  return <dialog ref={element} className="studio-dialog" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <form onSubmit={event=>{event.preventDefault();void save();}}>
      <h2>AI Settings</h2><p className="editor-help" role="status">OpenAI: {loading?'Checking…':current.configured?'Configured for this session':'No key configured in this session'}. Generation runs only when you request it and uses your OpenAI account.</p>
      <label>OpenAI API Key<input type="password" autoComplete="new-password" value={key} onChange={event=>{setKey(event.target.value);setMessage('');}} placeholder={current.configured?'Paste a replacement key':'Paste your API key'} disabled={busy||loading}/>
        <small>After pasting, click Save Settings. Keys stay in server memory for up to 12 hours; restarting the local API clears them. A saved key is never returned to this field.</small></label>
      <label>Translation Model<input value={model} onChange={event=>{setModel(event.target.value);setMessage('');}} required disabled={busy||loading}/></label>
      <p className="editor-help">For persistence across restarts, configure OPENAI_API_KEY in the API worker’s ignored .dev.vars.local file. Never add it to course content.</p>
      {message&&<p className="success message" role="status">{message}</p>}
      {error&&<p className="error message" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>{message?'Done':'Cancel'}</button>
        {current.configured&&<button type="button" disabled={busy||loading} onClick={()=>void save(true)}>Disable Key For This Session</button>}
        <button className="primary" disabled={busy||loading||(!current.configured&&!key.trim())}>{busy?'Saving…':'Save Settings'}</button></div>
    </form>
  </dialog>;
}
