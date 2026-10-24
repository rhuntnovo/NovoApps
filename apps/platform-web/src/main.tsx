import {useEffect,useState,type FormEvent} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';
import {EmailActionPanel,ForgotPassword,EmailPreviewInbox,type EmailAction} from './AccountEmail';
type Session={user:{name:string;email:string;emailVerified:boolean};owner:boolean;grants:{locale:string}[]};
type Course={id:string;providerId:string;sourceCourseId:string|null;locale:string;metadata:{title:string}};
type Invite={id:string;email:string;locale:string;expires_at:number;consumed_at:number|null;revoked_at:number|null};
const cms=import.meta.env.VITE_CMS_ORIGIN||'http://127.0.0.1:5174';
async function request<T=any>(path:string,body?:unknown):Promise<T>{const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed.');return data;}
function readAccountLinks(){const values=new URLSearchParams(location.hash.slice(1));const result={invite:values.get('invite')||'',verify:values.get('verify')||'',reset:values.get('reset')||''};if(location.hash)history.replaceState(null,'',location.pathname+location.search);return result;}
function App(){
 const [datasetLabel,setDatasetLabel]=useState(''),[emailMode,setEmailMode]=useState('disabled'),[emailRefresh,setEmailRefresh]=useState(0),[forgot,setForgot]=useState(false);
 const [session,setSession]=useState<Session|null>(null),[setup,setSetup]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[register,setRegister]=useState(true);
 const [links,setLinks]=useState(readAccountLinks);
 const token=links.invite;
 const [emailAction,setEmailAction]=useState<EmailAction|null>(links.reset?{kind:'reset',token:links.reset}:links.verify?{kind:'verify',token:links.verify}:null);
 const [invitation,setInvitation]=useState<{email:string;locale:string}|null>(null),[accepted,setAccepted]=useState(false);
 const [courses,setCourses]=useState<Course[]>([]),[invites,setInvites]=useState<Invite[]>([]),[editionId,setEditionId]=useState(''),[inviteEmail,setInviteEmail]=useState(''),[inviteURL,setInviteURL]=useState('');
 async function refresh(){const status=await request<{setupRequired:boolean;datasetLabel?:string;emailMode?:string}>('v1/account/status');setSetup(status.setupRequired);setDatasetLabel(status.datasetLabel||'');setEmailMode(status.emailMode||'disabled');
  let who:Session|null=null;try{who=await request<Session>('v1/account/session');}catch{}setSession(who);
  if(who?.owner){setCourses(await request<Course[]>('v1/cms/courses'));setInvites(await request<Invite[]>('v1/account/invitations'));}
 }
 useEffect(()=>{const change=()=>{const next=readAccountLinks();setLinks(next);setEmailAction(next.reset?{kind:'reset',token:next.reset}:next.verify?{kind:'verify',token:next.verify}:null);setForgot(false);setAccepted(false);setInvitation(null);setRegister(true);setError('');setNotice('');};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
 useEffect(()=>{void(async()=>{try{await refresh();if(token){const invite=await request<{email:string;locale:string}>('v1/account/invitation',{token});setInvitation(invite);setEmail(invite.email);}}catch(e){setError(String(e));}finally{setLoading(false);}})();},[token]);
 async function action(work:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await work();}catch(e){setError(String(e));}finally{setPassword('');setBusy(false);}}
 async function submit(event:FormEvent){event.preventDefault();await action(async()=>{
  if(setup){await request('v1/account/setup',{name,email,password});setSetup(false);setNotice('Owner created. Sign in with your new password, then open Email Previews to test email verification.');return;}
  if(invitation&&register){await request('v1/account/register',{name,password,token});setRegister(false);}
  await request('auth/sign-in/email',{email,password});await refresh();
 });}
 const editions=courses.filter(course=>course.sourceCourseId);
 return <main className="account-shell"><header><span className="logo">N</span><div><strong>NovoApps</strong><span>Account & Access</span></div><small>{datasetLabel||'Local Authentication Pilot'}</small></header>
  {loading?<section><p>Loading Account…</p></section>:<>
   {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
   {emailAction?<EmailActionPanel key={emailAction.kind+emailAction.token} action={emailAction} request={request} onCancel={()=>setEmailAction(null)} onComplete={async notice=>{setEmailAction(null);await refresh();setNotice(notice);}}/>:forgot?<ForgotPassword request={request} initialEmail={email} onBack={()=>setForgot(false)}/>:!session?<section><span className="eyebrow">Content Studio</span><h1>{setup?'Create Your Owner Account':invitation&&register?'Accept Your Invitation':'Welcome Back'}</h1>
    <p>{setup?'This one-time local setup creates the owner account. Choose a unique password.':invitation?'Your invitation is for '+invitation.email+' · '+invitation.locale+'. Sign in or create your account, then confirm access.':'Sign in with your invited account. Public registration is closed.'}</p>
    <form onSubmit={event=>void submit(event)}><fieldset disabled={busy}>
     {(setup||invitation&&register)&&<label>Name<input autoComplete="name" required value={name} onChange={e=>setName(e.target.value)}/></label>}
     <label>Email<input type="email" autoComplete="username" required readOnly={!!invitation} value={email} onChange={e=>setEmail(e.target.value)}/></label>
     <label>Password<input type="password" autoComplete={setup||invitation&&register?'new-password':'current-password'} minLength={setup||invitation&&register?12:1} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
     {(setup||invitation&&register)&&<small>Use At Least 12 Characters.</small>}
     <button className="primary" type="submit">{busy?'Please Wait…':setup?'Create Owner Account':invitation&&register?'Create Account & Sign In':'Sign In'}</button>
     {emailMode==='preview'&&!(setup||invitation&&register)&&<button type="button" onClick={()=>setForgot(true)}>Forgot Password?</button>}
     {invitation&&<button type="button" onClick={()=>{setRegister(!register);setPassword('');}}>{register?'I Already Have An Account':'Create An Invited Account'}</button>}
    </fieldset></form>
   </section>:<>
    <section><span className="eyebrow">Signed In As {session.owner?'Super Admin':'Reviewer'}</span><h1>{session.user.name}</h1><p>{session.user.email}</p>
     {emailMode==='preview'&&<div className="verification-status"><strong>{session.user.emailVerified?'Email Verified':'Email Not Yet Verified'}</strong>{!session.user.emailVerified&&<><p>Verify your email before accepting a new invitation. In this local test, ask the Super Admin to open the message in Email Previews.</p><button disabled={busy} onClick={()=>void action(async()=>{await request('v1/account/send-verification',{email:session.user.email});setEmailRefresh(value=>value+1);setNotice('Verification link prepared. Open Email Previews, or ask the Super Admin to retrieve it. No email was sent.');})}>Request Verification Link</button><button disabled={busy} onClick={()=>void action(refresh)}>Refresh Verification Status</button></>}</div>}
     {invitation&&!accepted?<><p>Accept review access for {invitation.locale}. This invitation does not grant publishing or AI-generation access.</p><button className="primary" disabled={busy||emailMode==='preview'&&!session.user.emailVerified} onClick={()=>void action(async()=>{await request('v1/account/accept',{token});setAccepted(true);await refresh();setNotice('Invitation accepted. You can now open Content Studio.');})}>Accept Review Access</button></>:null}
     {(session.owner||session.grants.length>0)&&<a className="button primary" href={cms}>Open Content Studio →</a>}
     {!session.owner&&session.grants.length===0&&!invitation&&<p>No active course access. Ask the owner for a new invitation link.</p>}
     <button disabled={busy} onClick={()=>void action(async()=>{await request('auth/sign-out',{});await refresh();setInviteURL('');setInvites([]);setCourses([]);})}>Sign Out</button>
     <p className="muted">Keep any Content Studio tab with unsaved edits open when signing in again.</p>
    </section>
    {session.owner&&<><section><h2>Invite A Course Reviewer</h2><p>Reviewers can edit and review the selected language edition and read its primary language. They cannot publish or change course structure. AI generation is disabled by default; grant individual features in the provider’s AI Settings. Reviewers never receive the API key.</p>
     <form onSubmit={event=>{event.preventDefault();void action(async()=>{const course=editions.find(course=>course.id===editionId);if(!course)throw Error('Choose a language edition.');const result=await request<{url:string}>('v1/account/invitations',{email:inviteEmail,providerId:course.providerId,courseId:course.sourceCourseId,locale:course.locale});setInviteURL(result.url);setInviteEmail('');setEmailRefresh(value=>value+1);await refresh();setNotice(emailMode==='preview'?'Invitation prepared in Local Email Previews. No email was sent.':'Invitation link created.');});}}><fieldset disabled={busy}>
      <label>Reviewer Email<input type="email" required value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}/></label>
      <label>Course / Language Edition<select required value={editionId} onChange={e=>setEditionId(e.target.value)}><option value="">Choose An Edition</option>{editions.map(course=><option key={course.id} value={course.id}>{course.metadata.title+' · '+course.locale}</option>)}</select></label>
      <button className="primary">Create Invitation</button></fieldset></form>
     {inviteURL&&<div className="invite-link"><strong>Invitation Created · Expires In 7 Days</strong><label>Private Invitation Link<input readOnly value={inviteURL} onFocus={e=>e.target.select()}/></label><button onClick={()=>void action(async()=>{await navigator.clipboard.writeText(inviteURL);setNotice('Invitation link copied.');})}>Copy Link</button><p>This local link works only on this computer. Hosted reviewer access will come in a later phase. The full link is shown only now; create another if lost.</p></div>}
     <h3>Invitations & Access</h3><ul className="invites">{invites.map(invite=><li key={invite.id}><div><strong>{invite.email}</strong><span>{invite.locale+' · '+(invite.revoked_at?'Revoked':invite.consumed_at?'Access Active':invite.expires_at<Date.now()?'Expired':'Awaiting Acceptance')}</span></div>{emailMode==='preview'&&!invite.revoked_at&&!invite.consumed_at&&<button disabled={busy} onClick={()=>void action(async()=>{await request('v1/account/invitations/'+invite.id+'/resend',{});setEmailRefresh(value=>value+1);setInviteURL('');await refresh();setNotice('New invitation prepared in Email Previews. The previous invitation link no longer works.');})}>Resend Invitation</button>}{!invite.revoked_at&&<button disabled={busy} onClick={()=>void action(async()=>{await request('v1/account/invitations/'+invite.id+'/revoke',{});await refresh();})}>Revoke {invite.consumed_at?'Access':'Invitation'}</button>}</li>)}</ul>
    </section>{emailMode==='preview'&&<EmailPreviewInbox request={request} refreshKey={emailRefresh}/>}</>}
   </>}
  </>}
  <footer>Local-only validation. Accounts and permissions are stored separately from curriculum. Nothing here publishes course content.</footer>
 </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
