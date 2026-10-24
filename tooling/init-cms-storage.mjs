// A disposable authoring COPY prevents filesystem/R2 mode switches from sharing
// incompatible media references. Everything persists under the ignored state tree.
import {runSetupCommand} from './cms-process.mjs';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url)),service=path.join(root,'services/api-worker'),persist=path.join(service,'.wrangler/state/storage-sandbox'),marker=path.join(persist,'initialized.json');
const cli=path.join(root,'node_modules/wrangler/bin/wrangler.js');
async function run(binary,args,cwd=root,capture=false,label='running the setup command'){console.log('Storage Sandbox: '+label+'…');return runSetupCommand(binary,args,{cwd,capture,label});}
let initialized=false;try{await access(marker);initialized=true;}catch{}
if(!initialized){
 // Refuse to overwrite a partially initialized or user-created sandbox database.
 for(const db of ['CONTROL_DB','CONTENT_DB']){
  const raw=await run(process.execPath,[cli,'d1','execute',db,'--env','storage','--local','--persist-to',persist,'--command',"SELECT name FROM sqlite_master WHERE type='table'",'--json'],service,true,'checking '+db+' before initialization');
  if(JSON.parse(raw).some(item=>item.results.some(row=>!row.name.startsWith('_cf_')&&!row.name.startsWith('sqlite_'))))throw Error('The storage sandbox already has tables but no completion marker. Preserve it before assisted recovery; it was not overwritten.');
 }
 const python=process.env.CMS_BACKUP_PYTHON||(process.platform==='win32'?'python':'python3');
 // The backup tool verifies source quiescence and every file before this copy.
 const backup=JSON.parse(await run(python,['-B',path.join(root,'tooling/backup_cms.py'),'--repo-root',root,'--json'],root,true,'creating the verified backup'));
 const folder=path.join(service,'.wrangler/cloud-imports','storage-sandbox-'+Date.now());
 await run(python,['-B',path.join(root,'tooling/prepare_cms_cloud.py'),'--backup',backup.archive,'--destination',folder],root,false,'preparing the database copies');
 for(const [label,db] of [['control','CONTROL_DB'],['content','CONTENT_DB']])await run(process.execPath,[cli,'d1','execute',db,'--env','storage','--local','--persist-to',persist,'--file',path.join(folder,label+'.sql')],service,true,'importing the '+label+' sandbox copy');
 await mkdir(persist,{recursive:true});await writeFile(marker,JSON.stringify({sourceBackup:backup.archive,createdAt:new Date().toISOString(),message:'Local storage sandbox copy; not the daily authoring database.'},null,2));
}
for(const db of ['CONTROL_DB','CONTENT_DB'])await run(process.execPath,[cli,'d1','migrations','apply',db,'--env','storage','--local','--persist-to',persist],service,false,'applying '+db+' migrations');
console.log('Storage sandbox ready. Daily CMS content/media were not replaced.');
