import {useEffect,useRef,useState} from 'react';
import {api} from './api';
export type MediaOwner={moduleId:string;pageId:string;blockId:string;expectedRevision:number};
async function base64(blob:Blob){return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Could not read the file'));reader.readAsDataURL(blob);});}
async function browserProcessing(){return (await api<{processing:string}>('/media-capabilities')).processing==='browser';}
const endpoint=(owner:MediaOwner,kind:string)=>'/modules/'+owner.moduleId+'/pages/'+owner.pageId+'/media/'+kind;
export function NarrationMedia({owner,text,disabled,onAudio,onRecording}:{owner:MediaOwner;text:string;disabled:boolean;onAudio:(path:string,source:'human'|'ai')=>void;onRecording:(value:boolean)=>void}){
 const [status,setStatus]=useState('');
 const [open,setOpen]=useState(false),[recording,setRecording]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState(''),[blob,setBlob]=useState<Blob|null>(null);
 const dialog=useRef<HTMLDialogElement>(null),recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),chunks=useRef<Blob[]>([]),limit=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{if(open)dialog.current?.showModal();},[open]);
 useEffect(()=>()=>{if(limit.current)clearTimeout(limit.current);recorder.current?.state==='recording'&&recorder.current.stop();stream.current?.getTracks().forEach(track=>track.stop());onRecording(false);},[]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 async function start(){
  setError('');setBlob(null);setPreview('');
  try{if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw Error('This browser cannot record a microphone. Use Chrome, Edge, or Safari on localhost or HTTPS.');
   const mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});stream.current=mic;
   const type=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(value=>MediaRecorder.isTypeSupported(value));
   const instance=new MediaRecorder(mic,type?{mimeType:type,audioBitsPerSecond:64000}:undefined);recorder.current=instance;chunks.current=[];
   instance.ondataavailable=event=>{if(event.data.size)chunks.current.push(event.data);};
   instance.onstop=()=>{if(limit.current)clearTimeout(limit.current);mic.getTracks().forEach(track=>track.stop());setRecording(false);onRecording(false);
    const result=new Blob(chunks.current,{type:instance.mimeType});setBlob(result);setPreview(URL.createObjectURL(result));};
   instance.onerror=()=>{mic.getTracks().forEach(track=>track.stop());setRecording(false);onRecording(false);setError('Recording failed. Please try again.');};
   instance.start(1000);setRecording(true);onRecording(true);limit.current=setTimeout(()=>instance.state==='recording'&&instance.stop(),600000);
  }catch(error){stream.current?.getTracks().forEach(track=>track.stop());setError(String(error));onRecording(false);}
 }
 function close(){if(recording||working)return;setOpen(false);setBlob(null);setPreview('');setError('');}
 async function upload(){if(!blob)return;setWorking(true);setError('');try{
  let payload:{data:string;prepared?:boolean};
  if(await browserProcessing()){const {prepareAudio}=await import('./prepare-media');payload={data:await prepareAudio(blob,setStatus),prepared:true};}else payload={data:await base64(blob)};
  setStatus('Saving Narration…');
  const result=await api<{audio:string}>(endpoint(owner,'recording'),'POST',{...owner,...payload});
  onAudio(result.audio,'human');setOpen(false);setBlob(null);setPreview('');
 }catch(error){setError(String(error));}finally{setWorking(false);}}
 async function generate(){if(!window.confirm('Generate this narration with Marin using your OpenAI account? Existing files and earlier revisions are retained.'))return;
  setWorking(true);setError('');try{const result=await api<{audio:string}>(endpoint(owner,'speech'),'POST',{...owner,script:text});onAudio(result.audio,'ai');}
  catch(error){setError(String(error));}finally{setWorking(false);}}
 return <div className="media-authoring"><div className="media-actions">
  <button type="button" disabled={disabled||working||!text.trim()} onClick={()=>{setError('');setOpen(true);}}>🎙 Record Narration</button>
  <button type="button" disabled={disabled||working||!text.trim()||text.length>4096} onClick={()=>void generate()}>Generate AI Narration</button>
 </div>{disabled&&<small>Save this page before creating media.</small>}{working&&<p role="status">Creating and compressing narration…</p>}{error&&!open&&<p className="inline-error" role="alert">{error}</p>}
 {open&&<dialog ref={dialog} className="studio-dialog recording-dialog" onCancel={event=>{event.preventDefault();close();}}>
  <h2>Record Narration</h2><p>Read the script below. Recording stops after 10 minutes.</p><div className="reading-script">{text}</div>
  <div className="recording-state" role="status">{recording?'● Recording…':working?(status||'Compressing And Saving Opus…'):blob?'Recording ready for review':'Microphone is off'}</div>
  {preview&&<audio controls src={preview}/>}
  {error&&<p className="inline-error" role="alert">{error}</p>}
  <div className="dialog-actions"><button disabled={recording||working} onClick={close}>Cancel</button>
   {!recording?<button disabled={working} onClick={()=>void start()}>{blob?'Record Again':'Start Recording'}</button>:<button className="record-stop" onClick={()=>recorder.current?.stop()}>Stop Recording</button>}
   {blob&&!recording&&<button className="primary" disabled={working} onClick={()=>void upload()}>Use Recording</button>}
  </div>
 </dialog>}
 </div>;
}
export function BlockImage({owner,alt,src,text,disabled,onImage,onDescription}:{owner:MediaOwner;alt:string;src?:string;text:string;disabled:boolean;onDescription:(value:string)=>void;onImage:(value:any)=>void}){
 const [description,setDescription]=useState(alt),[working,setWorking]=useState(false),[error,setError]=useState('');
 useEffect(()=>setDescription(alt),[alt]);
 async function run(kind:string,file?:File){
  if(kind==='image-generate'&&!window.confirm('Generate a new suggested image using your OpenAI account? Your existing image will remain in earlier revisions.'))return;
  setWorking(true);setError('');
  try{
   const prepare=await browserProcessing();let prepared={};
   if(file&&prepare){const {prepareImage}=await import('./prepare-media');prepared=await prepareImage(file);}
   let result=await api<{image?:any;generatedImage?:{data:string;mimeType:string}}>(endpoint(owner,kind),'POST',{...owner,description,textContext:text,...(file&&!prepare?{data:await base64(file)}:{}),...prepared});
   if(result.generatedImage){const {prepareImage}=await import('./prepare-media'),raw=atob(result.generatedImage.data),bytes=Uint8Array.from(raw,value=>value.charCodeAt(0));
    const optimized=await prepareImage(new Blob([bytes],{type:result.generatedImage.mimeType}));
    result=await api(endpoint(owner,'image-upload'),'POST',{...owner,description,...optimized,source:'ai'});
   }
   if(!result.image)throw Error('No image was saved.');onImage(result.image);
  }
  catch(error){setError(String(error));}finally{setWorking(false);}
 }
 return <section className="block-image">
  <div className="image-label-row"><label>Image Description<input value={description} onChange={event=>{setDescription(event.target.value);onDescription(event.target.value);}} placeholder="Describe the image you want"/></label>
   <button disabled={disabled||working||!description.trim()} onClick={()=>void run('image-generate')}>Generate Image</button></div>
  <label className="upload-control">Upload Image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled||working||!description.trim()} onChange={event=>{const file=event.target.files?.[0];if(file)void run('image-upload',file);event.target.value='';}}/></label>
  {src&&<img src={src} alt={alt} className="editor-image"/>}
  {disabled&&<small>Save this block before adding media.</small>}
  {working&&<p role="status">Creating and optimizing image…</p>}{error&&<p className="inline-error" role="alert">{error}</p>}
 </section>;
}
