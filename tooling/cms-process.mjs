import net from 'node:net';
import {spawn} from 'node:child_process';

// Hold the editor port during setup, until the API is ready. This closes the
// window where two launchers could both pass their checks and migrate together.
export function reservePort(port){
 return new Promise((resolve,reject)=>{
  const server=net.createServer(socket=>socket.destroy());
  server.once('error',error=>reject(error.code==='EADDRINUSE'
   ?Error('Port '+port+' is in use. The CMS is already running or starting, or another application is using this port. Stop the previous CMS launcher before switching modes.')
   :error));
  server.listen({port,host:'127.0.0.1',exclusive:true},()=>resolve(server));
 });
}
export const releasePort=server=>new Promise((resolve,reject)=>{
 if(!server?.listening)return resolve();
 server.close(error=>error?reject(error):resolve());
});

export function runSetupCommand(binary,args,{cwd,capture=false,label,stderr=process.stderr}){
 return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{cwd,windowsHide:true,stdio:['ignore',capture?'pipe':'inherit','pipe']});
  let output='';
  if(capture)child.stdout.on('data',value=>output+=value);
  // Preserve real diagnostics even when stdout must remain machine-readable.
  child.stderr.on('data',value=>stderr.write(value));
  child.once('error',error=>reject(Error('Storage sandbox setup failed while '+label+': '+error.message+'. Existing daily CMS data was not replaced.')));
  child.once('close',(code,signal)=>code===0?resolve(output):reject(Error('Storage sandbox setup failed while '+label+' ('+(signal?'signal '+signal:'exit code '+code)+'). See the command output above. Existing daily CMS data was not replaced.')));
 });
}
