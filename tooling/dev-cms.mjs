import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this command using npm run dev:cms');
const children = new Set();
let stopping = false;
function start(args) {
  const child = spawn(process.execPath, [npmCli, ...args], { cwd: root, stdio: 'inherit', windowsHide: true });
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}
const run = args => new Promise((resolve, reject) => {
  const child = start(args);
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error('CMS command failed: ' + args.join(' '))));
});
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32' && child.pid)
      execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
    else child.kill('SIGTERM');
  }
}
process.on('SIGINT', () => { stop(); process.exitCode=0; });
process.on('SIGTERM', () => { stop(); process.exitCode=0; });
try {
  await run(['run','cms:migrate']);
  const api = start(['run','dev','--workspace','@novoapps/api-worker']);
  api.on('exit', code => { if (!stopping) { console.error('CMS API stopped:', code); stop(); process.exitCode=1; } });
  const deadline = Date.now() + 60000;
  let ready = false;
  while (!stopping && Date.now() < deadline) {
    try { ready = (await fetch('http://127.0.0.1:8787/health', { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error('Local API did not start. Check that ports 8787, 5174 and 5175 are free.');
  await run(['run','cms:import']);
  for (const workspace of ['@novoapps/cms-web','@novoapps/cms-preview']) {
    const child = start(['run','dev','--workspace',workspace]);
    child.on('exit', code => { if (!stopping) { console.error(workspace+' stopped:', code); stop(); process.exitCode=1; } });
  }
  console.log('\nContent Studio: http://127.0.0.1:5174/\nPreview: http://127.0.0.1:5175/\nDrafts are stored in local D1. Nothing is published.\n');
} catch (error) { console.error(error); stop(); process.exitCode=1; }
