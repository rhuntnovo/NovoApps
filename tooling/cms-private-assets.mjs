// Local R2 seeding or explicit upload of a verified, private migration manifest.
import {spawn} from 'node:child_process';
import {readFile,readdir,stat,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url)),service=path.join(root,'services/api-worker'),args=process.argv.slice(2),remote=args.includes('--remote'),verify=args.includes('--verify');
const manifestArgument=args.indexOf('--manifest'),manifestFile=manifestArgument>=0?path.resolve(args[manifestArgument+1]):null;
if(remote&&!manifestFile)throw Error('Remote uploads require an explicit verified private import manifest.');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),objects=[];
const types={'.opus':'audio/ogg','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.js':'application/javascript','.wasm':'application/wasm'};
async function walk(folder,prefix){let entries;try{entries=await readdir(folder,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}for(const entry of entries){if(entry.isSymbolicLink())throw Error('Do not follow linked asset folders.');const file=path.join(folder,entry.name),key=prefix+'/'+entry.name;if(entry.isDirectory())await walk(file,key);else if(entry.isFile())objects.push({key,file});}}
if(manifestFile){
 const manifest=JSON.parse(await readFile(manifestFile,'utf8'));if(manifest.format!=='novoapps-private-cloud-import-1')throw Error('Unsupported import manifest.');
 const directory=path.dirname(manifestFile);
 for(const object of manifest.objects){const file=path.resolve(directory,object.file);if(!file.startsWith(directory+path.sep)||!/^media\/(assets|audio|icons)\//.test(object.key)||object.key.includes('..'))throw Error('Unsafe asset manifest.');const data=await readFile(file);if(data.length!==object.bytes||sha(data)!==object.sha256)throw Error('Private asset checksum mismatch.');objects.push({...object,file});}
}else{
 for(const name of ['assets','audio','icons'])await walk(path.join(root,'newvines-learning/public',name),'media/'+name);
 for(const name of ['assets','audio'])await walk(path.join(service,'.wrangler/media',name),'media/'+name);
}
// Host the ~31 MB core in private R2, not Workers Static Assets (25 MiB/file).
for(const name of ['ffmpeg-core.js','ffmpeg-core.wasm'])objects.push({key:'tools/ffmpeg/0.12.10/'+name,file:path.join(root,'node_modules/@ffmpeg/core/dist/esm',name)});
const unique=[...new Map(objects.map(object=>[object.key,object])).values()];
const customConfig=args.indexOf('--config'),customState=args.indexOf('--persist-to');
if(remote&&(customConfig>=0||customState>=0))throw Error('Custom config/state is local-only.');
const configArgs=[...(customConfig>=0?['--config',path.resolve(args[customConfig+1])]:['--env',remote?'staging':'storage']),...(remote?['--remote']:['--local','--persist-to',customState>=0?path.resolve(args[customState+1]):'.wrangler/state'])];
const temporary=path.join(service,'.wrangler/asset-transfer',String(Date.now()));let commandNumber=0;await mkdir(temporary,{recursive:true});
async function cli(input){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),...input],{cwd:service,stdio:['ignore','pipe','pipe'],windowsHide:true});let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',value=>{output+=value;});child.on('error',reject);const log=path.join(temporary,'command-'+(++commandNumber)+'.log');child.on('exit',async code=>{try{await writeFile(log,output);code?reject(Error('Private asset transfer failed; see '+log)):resolve(output);}catch(error){reject(error);}});});}
const stateDirectory=customState>=0?path.resolve(args[customState+1]):path.join(service,'.wrangler/state');
const cacheFile=path.join(stateDirectory,'cms-private-assets.json');let cache={};
if(!remote&&!verify&&!args.includes('--force'))try{cache=JSON.parse(await readFile(cacheFile,'utf8'));}catch{}
let next=0,done=0,skipped=0;const reports=[];
const transfers=await Promise.allSettled(Array.from({length:remote?3:1},async(_,worker)=>{
 while(next<unique.length){const object=unique[next++],data=await readFile(object.file),hash=sha(data);
  if(!remote&&!verify&&cache[object.key]===hash){skipped++;reports.push({key:object.key,bytes:data.length,sha256:hash});done++;continue;}
  if(verify){const target=path.join(temporary,'verify-'+worker);await cli(['r2','object','get','novoapps-drafts/'+object.key,'--file',target,...configArgs]);if(sha(await readFile(target))!==hash)throw Error('Remote private asset verification failed.');}
  else await cli(['r2','object','put','novoapps-drafts/'+object.key,'--file',object.file,'--content-type',types[path.extname(object.file)]||'application/octet-stream','--cache-control','no-store',...configArgs]);
  reports.push({key:object.key,bytes:data.length,sha256:hash});done++;if(done%10===0||done===unique.length)console.log((verify?'Verified ':'Stored ')+done+' / '+unique.length+' private objects');
 }
}));
const failed=transfers.find(result=>result.status==='rejected');if(failed)throw failed.reason;
await writeFile(path.join(temporary,'report.json'),JSON.stringify({remote,verified:verify,objects:reports},null,2));
if(!remote&&!verify){await mkdir(stateDirectory,{recursive:true});await writeFile(cacheFile,JSON.stringify(Object.fromEntries(reports.map(item=>[item.key,item.sha256])),null,2));if(skipped)console.log(skipped+' unchanged local objects retained.');}
console.log((remote?'Cloud':'Emulated')+' private asset '+(verify?'verification':'import')+' complete. No public course objects were written.');
