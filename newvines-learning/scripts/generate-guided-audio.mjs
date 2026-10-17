import fs from 'node:fs/promises';
import path from 'node:path';
import OpenAI from 'openai';

const apiKey=process.env.OPENAI_API_KEY;
if(!apiKey){console.error('\nOPENAI_API_KEY is missing. Add it to .env and try again.\n');process.exit(1)}
const client=new OpenAI({apiKey});
const coursePath=path.resolve('public/courses/nvi-fgmm-m01.en-global.json');
const course=JSON.parse(await fs.readFile(coursePath,'utf8'));
const instructions=`Speak as a warm, experienced Christian financial educator addressing adults in East Africa. Use clear international English with a natural Kenyan-influenced British English accent. Speak calmly and conversationally, with warmth, humility, and quiet authority. Avoid sounding theatrical, commercial, overly polished, or like a news announcer. Use a moderate teaching pace. Give important biblical principles a little additional emphasis and allow brief natural pauses after important ideas.`;
let count=0;
console.log('\nNew Vines Guided Presentation — Marin narration\n');
for(const page of course.module.pages.filter(p=>p.guided?.narration_mode==='marin_opus')){
 const segments=page.guided?.narration_segments||[];const assets=page.guided?.audio_segments||[];
 if(segments.length!==assets.length)throw new Error(`${page.id}: narration/audio segment counts do not match`);
 for(let i=0;i<segments.length;i++){
  const output=path.resolve('public',assets[i].replace(/^\//,''));await fs.mkdir(path.dirname(output),{recursive:true});
  process.stdout.write(`${page.id} segment ${i+1}/${segments.length}... `);
  const response=await client.audio.speech.create({model:'gpt-4o-mini-tts',voice:'marin',input:segments[i],instructions,response_format:'opus',speed:1.0});
  const buffer=Buffer.from(await response.arrayBuffer());await fs.writeFile(output,buffer);count++;console.log(`${Math.round(buffer.length/1024)} KB`);
 }
}
console.log(`\nCreated ${count} Marin Opus files in public/audio/guided-demo.`);console.log('Now run: npm run build\n');
