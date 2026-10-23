import { h,render } from 'preact';
import { courseSchema } from '@novoapps/content-model';
import { PreviewHost } from './PreviewHost';
import '@novoapps/content-runtime/styles.css';
const configured=new URL(import.meta.env.VITE_CMS_ORIGIN||'http://127.0.0.1:5174');
const allowed=new Set([configured.origin]);
if(['127.0.0.1','localhost'].includes(configured.hostname)){
  for(const name of ['127.0.0.1','localhost']){const origin=new URL(configured);origin.hostname=name;allowed.add(origin.origin);}
}
let lastPayload='';let revision=0;let previewMode:'self-paced'|'guided'='self-paced';
window.addEventListener('message',event=>{
  if(!allowed.has(event.origin)||event.source!==window.parent||event.data?.type!=='NOVOAPPS_CMS_PREVIEW')return;
  const parsed=courseSchema.safeParse(event.data.course);
  if(!parsed.success||!['self-paced','guided'].includes(event.data.mode)||
    !parsed.data.module.pages.some(page=>page.id===event.data.pageId))return;
  const fingerprint=JSON.stringify({course:parsed.data,pageId:event.data.pageId,provider:event.data.provider});if(fingerprint===lastPayload)return;lastPayload=fingerprint;
  const provider=event.data.provider;
  const brandName=provider?.slug==='new-vines'?'New Vines Learning':typeof provider?.name==='string'?provider.name:'NovoApps Learning';
  document.documentElement.lang=parsed.data.language;
  const mount=document.getElementById('app')!;
  if(revision===0)mount.replaceChildren();
  render(h(PreviewHost,{key:++revision,course:parsed.data,pageId:event.data.pageId,initialMode:previewMode,onModeChange:(value:'self-paced'|'guided')=>{previewMode=value;},brandName}),mount);
});
