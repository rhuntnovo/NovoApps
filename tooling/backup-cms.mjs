import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('..',import.meta.url));
const script=fileURLToPath(new URL('./backup_cms.py',import.meta.url));
const python=process.env.CMS_BACKUP_PYTHON||(process.platform==='win32'?'python':'python3');
const child=spawn(python,['-B','-u',script,'--repo-root',repo,...process.argv.slice(2)],{
  stdio:'inherit',windowsHide:true,shell:false
});
child.on('error',()=>{console.error('Python 3 is required. Set CMS_BACKUP_PYTHON to its executable path if needed.');process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=code??(signal?130:1);});
