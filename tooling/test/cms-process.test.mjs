import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Writable} from 'node:stream';
import net from 'node:net';
import {reservePort,releasePort,runSetupCommand} from '../cms-process.mjs';

test('a real editor-port reservation blocks a concurrent launcher and is released for the editor',async()=>{
 const guard=await reservePort(0),port=guard.address().port;
 try{await assert.rejects(reservePort(port),/already running or starting/);}
 finally{await releasePort(guard);}
 const editor=await reservePort(port);await releasePort(editor);await releasePort(editor);
});

test('only one simultaneous setup can reserve the same port',async()=>{
 const probe=await reservePort(0),port=probe.address().port;await releasePort(probe);
 const results=await Promise.allSettled([reservePort(port),reservePort(port)]);
 try{assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected').length,1);}
 finally{await Promise.all(results.filter(result=>result.status==='fulfilled').map(result=>releasePort(result.value)));}
});

test('captured setup stdout stays valid JSON while stderr diagnostics remain visible',async()=>{
 let diagnostics='';const stderr=new Writable({write(chunk,encoding,done){diagnostics+=chunk;done();}});
 const output=await runSetupCommand(process.execPath,['-e',`process.stderr.write('Visible setup diagnostic\\n');console.log(JSON.stringify({ok:true}));`],{capture:true,label:'creating backup',stderr});
 assert.deepEqual(JSON.parse(output),{ok:true});assert.match(diagnostics,/Visible setup diagnostic/);
});

test('setup failures identify the failed database command and preserve its diagnostics',async()=>{
 let diagnostics='';const stderr=new Writable({write(chunk,encoding,done){diagnostics+=chunk;done();}});
 await assert.rejects(runSetupCommand(process.execPath,['-e',`process.stderr.write('D1 internal error\\n');process.exitCode=7;`],{capture:true,label:'applying CONTROL_DB migrations',stderr}),/applying CONTROL_DB migrations \(exit code 7\)/);
 assert.match(diagnostics,/D1 internal error/);
});

test('an unavailable setup executable reports its stage instead of an unexplained child failure',async()=>{
 const stderr=new Writable({write(chunk,encoding,done){done();}});
 await assert.rejects(runSetupCommand('novoapps-missing-test-executable',[],{capture:true,label:'creating the verified backup',stderr}),/creating the verified backup.*ENOENT/);
});

test('a browser connection during initialization cannot hold the reservation open',async()=>{
 const guard=await reservePort(0);
 try{
  await new Promise((resolve,reject)=>{const socket=net.connect({host:'127.0.0.1',port:guard.address().port});socket.once('error',reject);socket.once('close',resolve);});
 }finally{await releasePort(guard);}
});
