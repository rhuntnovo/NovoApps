import {spawn,execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import net from 'node:net';
const root=fileURLToPath(new URL('..',import.meta.url));
const npmCli=process.env.npm_execpath;
if(!npmCli)throw new Error('Run this command using npm run dev:cms or npm run dev:cms:auth');
const authenticated=process.argv.includes('--auth'),children=new Set();
let stopping=false;
const childEnv={...process.env};
function start(args){const child=spawn(process.execPath,[npmCli,...args],{cwd:root,env:childEnv,stdio:'inherit',windowsHide:true});children.add(child);child.on('exit',()=>children.delete(child));return child;}
const run=args=>new Promise((resolve,reject)=>{const child=start(args);child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('CMS command failed: '+args.join(' '))));});
function stop(){if(stopping)return;stopping=true;for(const child of children){if(process.platform==='win32'&&child.pid)execFile('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>{});else child.kill('SIGTERM');}}
process.on('SIGINT',()=>{stop();process.exitCode=0;});process.on('SIGTERM',()=>{stop();process.exitCode=0;});
const portFree=port=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',()=>reject(Error('Port '+port+' is in use. Stop the previous CMS launcher before switching modes.')));server.listen(port,'127.0.0.1',()=>server.close(resolve));});
try{
 for(const port of [8787,8789,5174,5175,...(authenticated?[5176]:[])])await portFree(port);
 if(authenticated){
  const file=new URL('../services/api-worker/.dev.vars.auth',import.meta.url);
  try{await writeFile(file,'# Generated local authentication secrets. Never commit or share.\nBETTER_AUTH_SECRET='+randomBytes(48).toString('hex')+'\nCMS_MEDIA_SECRET='+randomBytes(48).toString('hex')+'\n',{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
  const config=await readFile(file,'utf8');
  const bridge=config.match(/^CMS_MEDIA_SECRET=([a-f0-9]{96})$/m)?.[1];
  if(!bridge||!/^BETTER_AUTH_SECRET=[a-f0-9]{96}$/m.test(config))throw Error('The local auth secret file is incomplete. See docs/15 for recovery.');
  childEnv.CMS_MEDIA_SECRET=bridge;childEnv.CMS_AUTH_MODE='true';
 }
 await run(['run','cms:migrate']);
 if(authenticated)await run(['run','db:migrate:auth','--workspace','@novoapps/api-worker']);
 const watch=(workspace,args)=>{const child=start(args);child.on('exit',code=>{if(!stopping){console.error(workspace+' stopped:',code);stop();process.exitCode=1;}});};
 watch('Media Service',['run','dev','--workspace','@novoapps/media-server']);
 watch('CMS API',['run',authenticated?'dev:auth':'dev','--workspace','@novoapps/api-worker']);
 const deadline=Date.now()+60000;let ready=false;
 while(!stopping&&Date.now()<deadline){try{ready=(await fetch('http://127.0.0.1:8787/health',{signal:AbortSignal.timeout(1000)})).ok&&(await fetch('http://127.0.0.1:8789/health',{signal:AbortSignal.timeout(1000)})).ok;}catch{}if(ready)break;await new Promise(resolve=>setTimeout(resolve,300));}
 if(!ready)throw Error('Local API did not start. Check the output above.');
 if(authenticated&&!(await(await fetch('http://127.0.0.1:8789/health')).json()).authenticatedBridge)throw Error('Authenticated media bridge did not start.');
 // Existing drafts are reused. The unauthenticated importer is never run against
 // the authenticated API. On a fresh install import locally before switching modes.
 if(!authenticated)await run(['run','cms:import']);
 for(const workspace of ['@novoapps/cms-web','@novoapps/cms-preview',...(authenticated?['@novoapps/platform-web']:[])])watch(workspace,['run','dev','--workspace',workspace]);
 console.log('\nContent Studio: http://127.0.0.1:5174/\nPreview: http://127.0.0.1:5175/'+(authenticated?'\nSign In & Invitations: http://127.0.0.1:5176/':'')+'\nDrafts are stored in local D1. Nothing is published.\n');
}catch(error){console.error(error.message);stop();process.exitCode=1;}
