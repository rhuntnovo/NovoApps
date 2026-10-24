import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const python=process.env.CMS_BACKUP_PYTHON||(process.platform==='win32'?'python':'python3');
const child=spawn(python,['-B',fileURLToPath(new URL('./prepare_cms_cloud.py',import.meta.url)),...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});
child.on('error',()=>{console.error('Python 3 is required for the cloud restore rehearsal.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
