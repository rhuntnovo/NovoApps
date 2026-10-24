import {useEffect,useState,type ReactNode} from 'react';
export type Access={mode:'local'|'authenticated';owner:boolean;datasetLabel?:string;user?:{name:string;email:string};grants:{provider_id:string;course_id:string;locale:string}[]};
const platform=import.meta.env.VITE_PLATFORM_ORIGIN||'http://127.0.0.1:5176';
export function AccessBoundary({children}:{children:(access:Access)=>ReactNode}){
 const [access,setAccess]=useState<Access|null>(null),[error,setError]=useState(''),[expired,setExpired]=useState(false);
 async function refresh(){try{const response=await fetch('/api/v1/access');if(response.status===401){setExpired(true);return;}if(!response.ok)throw Error('Could not check your session. Start the local CMS API.');setAccess(await response.json());setExpired(false);setError('');}catch(e){setError(String(e));}}
 useEffect(()=>{void refresh();const check=()=>void refresh();const ended=()=>setExpired(true);window.addEventListener('focus',check);window.addEventListener('novoapps-session-ended',ended);return()=>{window.removeEventListener('focus',check);window.removeEventListener('novoapps-session-ended',ended);};},[]);
 if(!access)return <main className="empty"><h1>Content Studio</h1><p>{error|| (expired?'Sign in with your owner or invited reviewer account.':'Checking Your Session…')}</p>{expired&&<a href={platform}>Open NovoApps Sign In →</a>}<button onClick={()=>void refresh()}>Check Again</button></main>;
 return <>{(expired||error)&&<div className="message error session-alert" role="alert">{expired?'Your session ended. Keep this tab open to preserve unsaved edits.':'Session check failed. Keep this tab open.'} <a href={platform} target="_blank" rel="noreferrer">Sign In In A New Tab</a> <button onClick={()=>void refresh()}>Resume Editing</button></div>}{children(access)}</>;
}
