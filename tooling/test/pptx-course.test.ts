import test from 'node:test';
import assert from 'node:assert/strict';
import { prepare,importDrafts,type Inventory,type ImportPlan } from '../pptx-course';
import { parseTable,tableCell } from '../../packages/content-runtime/src/tabular';
import type { PublishedCourse } from '@novoapps/content-model';

function fixture(){
  const shape=(id:string,texts:string[],y=0)=>({id,placeholder:null,x:0,y,paragraphs:texts.map((text,index)=>({index,text,level:0,bullet:false}))});
  const slide=(number:number,shapes:ReturnType<typeof shape>[])=>({number,hidden:false,shapes,pictures:[],notes:[],unsupported:[],connectors:0});
  const inventory:Inventory={format:'novoapps-pptx-inventory-1',filename:'source.pptx',sha256:'a'.repeat(64),media:[],slides:[
    slide(10,[shape('1',['Managing Personal Money\n\nModule 2: Saving – Together'])]),
    slide(11,[shape('2',['God’s Word']),shape('3',['Proverbs 13:11','Gather little by little.','Application: Pray – don’t give up!'])])
  ]};
  const plan:ImportPlan={name:'fixture',sourceSha256:inventory.sha256,providerId:'019a0640-0000-7000-8000-000000000001',courseId:'FGMM',language:'en',country:'global',excludeText:[],allowedPictures:[],protectedModules:[1],maxPageCharacters:560,maxPageBlocks:4,modules:[{number:2,slides:[10,11]}],slides:{}};
  const base={schema_version:'0.3',course_id:'FGMM',title:'Foundations',track:'Managing Personal Money',language:'en',country:'global',source_issues:[],module:{id:'old',number:1,title:'First',pages:[]}} as PublishedCourse;
  return {inventory,plan,base};
}

test('Unicode wording, Scripture, source references and versioned IDs survive conversion',()=>{
  const {inventory,plan,base}=fixture();const source=structuredClone(inventory),original=structuredClone(base);
  const result=prepare(inventory,plan,base);
  assert.equal(result.courses[0].module.title,'Saving – Together');
  assert.equal(result.courses[0].module.pages[1].blocks[0].text,'Proverbs 13:11\n\nGather little by little.');
  assert.equal(result.courses[0].module.pages[1].blocks[1].text,'Application: Pray – don’t give up!');
  assert.equal(result.courses[0].module.pages[1].source_slide,11);
  assert.match(result.courses[0].module.id,/^[\da-f]{8}-[\da-f]{4}-7/);
  assert.deepEqual(prepare(inventory,plan,base,result.ids),result);
  assert.deepEqual(inventory,source);assert.deepEqual(base,original);
});

test('unmapped, duplicate, unsafe and unsupported source selections fail before any import',()=>{
  const {inventory,plan,base}=fixture();
  const unmapped=structuredClone(plan);unmapped.slides['11']={sections:[{refs:['3:0-1']}]};
  assert.throws(()=>prepare(inventory,unmapped,base),/Unmapped source text/);
  const duplicate=structuredClone(plan);duplicate.slides['11']={sections:[{refs:['3:0-1']},{refs:['3:1-2']}]};
  assert.throws(()=>prepare(inventory,duplicate,base),/Duplicate source text/);
  assert.throws(()=>prepare(inventory,{...plan,sourceSha256:'wrong'},base),/hash differs/);
  const hidden=structuredClone(inventory);hidden.slides[1].hidden=true;assert.throws(()=>prepare(hidden,plan,base),/Hidden slide/);
  const unsupported=structuredClone(inventory);unsupported.slides[1].unsupported=['graphicFrame'];assert.throws(()=>prepare(unsupported,plan,base),/Unsupported slide objects/);
  const picture=structuredClone(inventory);picture.slides[1].pictures=[{part:'ppt/media/photo.png',external:false}];assert.throws(()=>prepare(picture,plan,base),/Unmapped source picture/);
  const notes=structuredClone(inventory);notes.slides[1].notes=[{id:'4',placeholder:'body',x:0,y:0,paragraphs:[{index:0,text:'Facilitator only',level:0,bullet:false}]}];assert.throws(()=>prepare(notes,plan,base),/Speaker notes/);
  assert.throws(()=>prepare(inventory,{...plan,protectedModules:[2]},base),/protected module/);
});

test('continuation pages balance content and keep complete tables together',()=>{
  const {inventory,plan,base}=fixture();inventory.slides[1].shapes[1].paragraphs=Array.from({length:5},(_,index)=>({index,text:'Item '+index+'.',level:0,bullet:false}));
  const result=prepare(inventory,plan,base);
  assert.deepEqual(result.courses[0].module.pages.slice(1).map(page=>page.blocks.length),[3,2]);
  assert.deepEqual(result.courses[0].module.pages.slice(1).map(page=>page.source_slide),[11,11]);
});

test('table conversion preserves empty KEEP/GO cells and every original marker',()=>{
  const {inventory,plan,base}=fixture();inventory.slides[1].shapes[1].paragraphs=[
    {index:0,text:'\tKEEP        GO',level:0,bullet:false},
    {index:1,text:'Basic Food …………\tx',level:0,bullet:false},
    {index:2,text:'Treats …………\t\tx',level:0,bullet:false}];
  plan.slides['11']={sections:[{refs:['3:0-2'],type:'table',format:'keep-go'}]};
  const block=prepare(inventory,plan,base).courses[0].module.pages[1].blocks[0];
  assert.deepEqual(parseTable(block.text),{header:['','KEEP','GO'],rows:[['Basic Food …………','x',''],['Treats …………','','x']]});
  assert.equal(tableCell('Basic Food …………'),'Basic Food');assert.equal(block.text.includes('…………'),true);
  assert.equal(parseTable('plain text'),null);
  assert.deepEqual(parseTable('Income\t10,000\nRent\t7,500'),{header:null,rows:[['Income','10,000'],['Rent','7,500']]});
});

test('source slices cannot add words or reuse the same text',()=>{
  const {inventory,plan,base}=fixture();inventory.slides[1].shapes=[{id:'2',placeholder:null,x:0,y:0,paragraphs:[{index:0,text:'Heading\n\nExact Scripture.',level:0,bullet:false}]}];
  plan.slides['11']={title:['2:0@0:7'],sections:[{refs:['2:0@9:25'],type:'scripture'}]};
  assert.equal(prepare(inventory,plan,base).courses[0].module.pages[1].blocks[0].text,'Exact Scripture.');
  plan.slides['11'].sections![0].refs=['2:0@5:25'];assert.throws(()=>prepare(inventory,plan,base),/Duplicate source/);
});

test('import allows loopback only, marks drafts for review, verifies saves, and is idempotent',async()=>{
  const {inventory,plan,base}=fixture();const prepared=prepare(inventory,plan,base);let posts=0;let stored:any;
  const request=async(input:any,init:any)=>{
    const url=new URL(String(input));
    if(url.pathname==='/health')return Response.json({mode:'local-authoring'});
    if(url.pathname==='/api/v1/cms/modules')return Response.json(stored?[{id:'saved',canonicalId:stored.course.module.id,providerId:plan.providerId,locale:'en-global',course:stored.course,module:stored.course.module}]:[]);
    if(url.pathname==='/api/v1/cms/import'){posts++;stored=JSON.parse(init.body);assert.equal(stored.reviewRequired,true);return Response.json({moduleId:'saved'},{status:201});}
    return Response.json({course:stored.course,pages:stored.course.module.pages.map(()=>({wordingReviewRequired:true}))});
  };
  await assert.rejects(importDrafts(prepared,inventory,'https://example.com',request as any),/loopback/);assert.equal(posts,0);
  const changed=structuredClone(prepared);changed.courses[0].module.pages[1].blocks[0].text='Rewritten';
  await assert.rejects(importDrafts(changed,inventory,'http://127.0.0.1:8787',request as any),/differs from verified source/);assert.equal(posts,0);
  assert.equal((await importDrafts(prepared,inventory,'http://127.0.0.1:8787',request as any))[0].status,'imported');
  assert.equal((await importDrafts(prepared,inventory,'http://127.0.0.1:8787',request as any))[0].status,'already-imported');assert.equal(posts,1);
  stored.course.module.pages[1].title='Later edit';
  await assert.rejects(importDrafts(prepared,inventory,'http://127.0.0.1:8787',request as any),/has edits/);assert.equal(posts,1);
});
