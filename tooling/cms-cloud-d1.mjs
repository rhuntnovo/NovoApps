// Explicit, empty-target-only import. SQL, exports and diagnostics remain private.
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url)),service=path.join(root,'services/api-worker'),args=process.argv.slice(2);
const manifestIndex=args.indexOf('--manifest');if(manifestIndex<0)throw Error('Specify --manifest <private manifest.json>.');
const manifestFile=path.resolve(args[manifestIndex+1]),directory=path.dirname(manifestFile),manifest=JSON.parse(await readFile(manifestFile,'utf8'));
if(manifest.format!=='novoapps-private-cloud-import-1')throw Error('Unsupported private import manifest.');
const remote=args.includes('--remote'),verify=args.includes('--verify'),config=JSON.parse(await readFile(path.join(service,'wrangler.jsonc'),'utf8'));
for(const name of ['nvi-control-staging','nvi-content-staging'])if(!config.env.staging.d1_databases.some(db=>db.database_name===name))throw Error('Staging bindings changed; review targets before import.');
const localConfig=path.join(directory,'restore-config.json');
if(!remote)await writeFile(localConfig,JSON.stringify({name:'cms-import-rehearsal',compatibility_date:config.compatibility_date,d1_databases:config.env.staging.d1_databases.map(db=>({...db,migrations_dir:path.resolve(service,db.migrations_dir)}))},null,2));
const flags=remote?['--env','staging','--remote']:['--config',localConfig,'--local'];
const cliFile=path.join(root,'node_modules/wrangler/bin/wrangler.js');
async function cli(args,log){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[cliFile,...args],{cwd:service,windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',value=>out+=value);child.stderr.on('data',value=>err+=value);child.on('error',reject);child.on('exit',async code=>{await writeFile(path.join(directory,log),out+'\n'+err);code?reject(Error('D1 operation failed; inspect private '+log+' in the import folder.')):resolve(out);});});}
for(const label of ['control','content']){
 const db=label==='control'?'CONTROL_DB':'CONTENT_DB',record=manifest.databases[label],file=path.resolve(directory,record.file);
 if(!file.startsWith(directory+path.sep)||createHash('sha256').update(await readFile(file)).digest('hex')!==record.sha256)throw Error('Prepared SQL checksum mismatch.');
 if(!verify){
  const output=await cli(['d1','execute',db,...flags,'--command',"SELECT name FROM sqlite_master WHERE type='table'",'--json'],label+'-empty-check.log');
  const tables=JSON.parse(output).flatMap(result=>result.results||[]).map(row=>row.name).filter(name=>!name.startsWith('_cf_')&&!name.startsWith('sqlite_'));
  if(tables.length)throw Error(label+' target is not empty. No overwrite is permitted; verify the existing import or choose a new reviewed target.');
  await cli(['d1','execute',db,...flags,'--file',file],label+'-import.log');console.log((remote?'Cloud':'Rehearsal')+' '+label+' import complete.');
 }
 const exported=path.join(directory,(remote?'remote-':'rehearsal-')+label+'.sql');
 await cli(['d1','export',db,...flags,'--output',exported],label+'-export.log');
 const python=process.env.CMS_BACKUP_PYTHON||(process.platform==='win32'?'python':'python3');
 await new Promise((resolve,reject)=>{const child=spawn(python,['-B',path.join(root,'tooling/prepare_cms_cloud.py'),'--verify-export',exported,'--manifest',manifestFile,'--database',label],{cwd:root,windowsHide:true,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code?reject(Error('D1 value verification failed.')):resolve());});
}
console.log((remote?'Cloud':'Emulated')+' D1 import/verification complete. No local authoring records were replaced.');
