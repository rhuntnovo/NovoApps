import {spawn,execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {reservePort,releasePort} from './cms-process.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const npmCli=process.env.npm_execpath;
if(!npmCli)throw new Error('Run this command using npm run dev:cms or npm run dev:cms:auth');
const storage=process.argv.includes('--storage'),authenticated=process.argv.includes('--auth')||storage,children=new Set();
let stopping=false,startupReservation;
const childEnv={...process.env};
function start(args){const child=spawn(process.execPath,[npmCli,...args],{cwd:root,env:childEnv,stdio:'inherit',windowsHide:true});children.add(child);child.on('exit',()=>children.delete(child));return child;}
const run=args=>new Promise((resolve,reject)=>{const child=start(args);child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('CMS command failed: '+args.join(' '))));});
function stop(){if(stopping)return;stopping=true;void releasePort(startupReservation);for(const child of children){if(process.platform==='win32'&&child.pid)execFile('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>{});else child.kill('SIGTERM');}}
process.on('SIGINT',()=>{stop();process.exitCode=0;});process.on('SIGTERM',()=>{stop();process.exitCode=0;});
const portFree=async port=>releasePort(await reservePort(port));
try{
 startupReservation=await reservePort(5174);
 for(const port of [8787,...(storage?[]:[8789]),5175,...(authenticated?[5176]:[])])await portFree(port);
 if(authenticated){
  const file=new URL('../services/api-worker/.dev.vars.'+(storage?'storage':'auth'),import.meta.url);
  try{await writeFile(file,'# Generated local authentication secrets. Never commit or share.\nBETTER_AUTH_SECRET='+randomBytes(48).toString('hex')+'\nCMS_MEDIA_SECRET='+randomBytes(48).toString('hex')+'\n',{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
  let config=await readFile(file,'utf8');
  if(!/^AI_CREDENTIAL_MASTER_KEY=/m.test(config)){await writeFile(file,(config.endsWith('\n')?'':'\n')+'# Keep this encryption secret separately for credential recovery.\nAI_CREDENTIAL_KEY_ID=v1\nAI_CREDENTIAL_MASTER_KEY='+randomBytes(32).toString('hex')+'\n',{flag:'a',mode:0o600});config=await readFile(file,'utf8');}
  if(!/^AI_CREDENTIAL_MASTER_KEY=[a-f0-9]{64}$/m.test(config))throw Error('The local AI encryption secret is incomplete. Preserve this file for recovery.');
  const bridge=config.match(/^CMS_MEDIA_SECRET=([a-f0-9]{96})$/m)?.[1];
  if(!bridge||!/^BETTER_AUTH_SECRET=[a-f0-9]{96}$/m.test(config))throw Error('The local auth secret file is incomplete. See docs/15 for recovery.');
  childEnv.CMS_MEDIA_SECRET=bridge;childEnv.CMS_AUTH_MODE='true';
 }
 if(storage)await run(['run','cms:storage:init']);
 else{await run(['run','cms:migrate']);if(authenticated)await run(['run','db:migrate:auth','--workspace','@novoapps/api-worker']);}
 const watch=(workspace,args)=>{const child=start(args);child.on('exit',code=>{if(!stopping){console.error(workspace+' stopped:',code);stop();process.exitCode=1;}});};
 if(storage)await run(['run','cms:storage:assets']);
 else watch('Media Service',['run','dev','--workspace','@novoapps/media-server']);
 watch('CMS API',['run',storage?'dev:storage':authenticated?'dev:auth':'dev','--workspace','@novoapps/api-worker']);
 const deadline=Date.now()+60000;let ready=false;
 while(!stopping&&Date.now()<deadline){try{ready=(await fetch('http://127.0.0.1:8787/health',{signal:AbortSignal.timeout(1000)})).ok&&(storage||(await fetch('http://127.0.0.1:8789/health',{signal:AbortSignal.timeout(1000)})).ok);}catch{}if(ready)break;await new Promise(resolve=>setTimeout(resolve,300));}
 if(!ready)throw Error('Local API did not start. Check the output above.');
 if(authenticated&&!storage&&!(await(await fetch('http://127.0.0.1:8789/health')).json()).authenticatedBridge)throw Error('Authenticated media bridge did not start.');
 // Existing drafts are reused. The unauthenticated importer is never run against
 // the authenticated API. On a fresh install import locally before switching modes.
 if(!authenticated)await run(['run','cms:import']);
 await releasePort(startupReservation);startupReservation=undefined;
 for(const workspace of ['@novoapps/cms-web','@novoapps/cms-preview',...(authenticated?['@novoapps/platform-web']:[])])watch(workspace,['run','dev','--workspace',workspace]);
 console.log('\nContent Studio: http://127.0.0.1:5174/\nPreview: http://127.0.0.1:5175/'+(authenticated?'\nSign In & Invitations: http://127.0.0.1:5176/':'')+(storage?'\nSTORAGE SANDBOX: a separate local copy. R2 is emulated; Publish stays local.':'\nDrafts are stored in local D1. Nothing is published automatically.')+'\n');
}catch(error){console.error(error.message);stop();process.exitCode=1;}
