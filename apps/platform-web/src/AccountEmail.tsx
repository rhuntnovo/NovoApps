import {useEffect,useState,type FormEvent} from 'react';

type Request=<T=any>(path:string,body?:unknown)=>Promise<T>;
export type EmailAction={kind:'verify'|'reset';token:string};
export function EmailActionPanel({action,request,onComplete,onCancel}:{action:EmailAction;request:Request;onComplete:(notice:string)=>Promise<void>;onCancel:()=>void}){
 const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(event:FormEvent){event.preventDefault();setError('');
  if(action.kind==='reset'&&password!==confirmation){setError('The passwords do not match.');return;}
  setBusy(true);try{
   await request('v1/account/'+(action.kind==='verify'?'verify-email':'reset-password'),{token:action.token,...(action.kind==='reset'?{newPassword:password}:{})});
   await onComplete(action.kind==='verify'?'Email verified. Sign in if needed, then return to your invitation to accept access.':'Password reset. Existing sessions have been signed out. Sign in with your new password. Keep any editor tab with unsaved work open.');
  }catch(error){setError(String(error));}finally{setPassword('');setConfirmation('');setBusy(false);}
 }
 return <section aria-labelledby="email-action-title"><span className="eyebrow">Account Security</span><h1 id="email-action-title">{action.kind==='verify'?'Verify Your Email':'Choose A New Password'}</h1>
  <p>{action.kind==='verify'?'Confirm this action to verify the address associated with this link. Verification does not sign you in or grant course access.':'Use a unique password with at least 12 characters. Completing this reset signs out all existing sessions.'}</p>
  {error&&<p role="alert" className="error">{error}</p>}<form onSubmit={event=>void submit(event)}><fieldset disabled={busy}>
   {action.kind==='reset'&&<><label>New Password<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={event=>setPassword(event.target.value)}/></label><label>Confirm New Password<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></label></>}
   <button className="primary">{busy?'Please Wait…':action.kind==='verify'?'Verify Email':'Reset Password'}</button><button type="button" onClick={onCancel}>Back To Account</button>
  </fieldset></form>
 </section>;
}

export function ForgotPassword({request,initialEmail,onBack}:{request:Request;initialEmail:string;onBack:()=>void}){
 const [email,setEmail]=useState(initialEmail),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 return <section><span className="eyebrow">Account Recovery</span><h1>Forgot Your Password?</h1><p>Enter your account email. If it has an eligible account, a reset link will be prepared. Local previews are available only to the Super Admin on this computer.</p>
  {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status" className="notice">{notice}</p>}
  <form onSubmit={event=>{event.preventDefault();setBusy(true);setError('');setNotice('');void request<{message:string}>('v1/account/forgot-password',{email}).then(result=>setNotice(result.message)).catch(error=>setError(String(error))).finally(()=>setBusy(false));}}><fieldset disabled={busy}><label>Account Email<input type="email" autoComplete="username" required value={email} onChange={event=>setEmail(event.target.value)}/></label><button className="primary">{busy?'Please Wait…':'Request Reset Link'}</button><button type="button" onClick={onBack}>Back To Sign In</button></fieldset></form>
 </section>;
}

type Preview={id:string;to:string;subject:string;createdAt:number;expiresAt:number};
export function EmailPreviewInbox({request,refreshKey}:{request:Request;refreshKey:number}){
 const [expanded,setExpanded]=useState(false),[messages,setMessages]=useState<Preview[]>([]),[selected,setSelected]=useState<(Preview&{text:string;url:string})|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function work(action:()=>Promise<void>){setBusy(true);setError('');try{await action();}catch(error){setError(String(error));}finally{setBusy(false);}}
 async function refresh(){const data=await request<{messages:Preview[]}>('v1/account/email-previews');setMessages(data.messages);setSelected(null);}
 useEffect(()=>{if(expanded)void work(refresh);},[expanded,refreshKey]);
 return <section><h2>Local Email Previews</h2><p>No email is sent. This Super Admin inbox simulates delivery for testing on this computer. Previews are temporary and disappear when the Worker restarts; request a new link if needed.</p>
  <button disabled={busy} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Hide Email Previews':'Open Email Previews'}</button>
  {error&&<p role="alert" className="error">{error}</p>}{expanded&&<><button disabled={busy} onClick={()=>void work(refresh)}>Refresh Inbox</button><button disabled={busy||!messages.length} onClick={()=>void work(async()=>{await request('v1/account/email-previews/clear',{});await refresh();})}>Clear Previews</button>
   {busy&&<p role="status">Loading Email Previews…</p>}{!busy&&!messages.length&&<p>No current previews. Request a verification or reset link, or create an invitation.</p>}
   <ul className="invites">{messages.map(message=><li key={message.id}><div><strong>{message.subject}</strong><span>To: {message.to}</span><span>{new Date(message.createdAt).toLocaleString()}</span></div><button disabled={busy} onClick={()=>void work(async()=>setSelected(await request('v1/account/email-previews/'+message.id+'/open',{})))}>View Email</button></li>)}</ul>
   {selected&&<article className="email-preview"><h3>{selected.subject}</h3><p>To: {selected.to}</p><pre>{selected.text}</pre><a className="button primary" href={selected.url} target="_blank" rel="noopener noreferrer">Open Account Link ↗</a><p className="muted">For a reviewer, copy the link into their separate browser profile. It is private and works only on this computer.</p><button onClick={()=>setSelected(null)}>Close Email</button></article>}
  </>}
 </section>;
}
