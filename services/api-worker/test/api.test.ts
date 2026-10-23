import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { app } from '../src/index';

const source = JSON.parse(await readFile(new URL('../../../newvines-learning/public/courses/nvi-fgmm-m01.en-global.json', import.meta.url), 'utf8'));
const directory = new URL('../../../database/content/migrations/', import.meta.url);
const migrations = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
function binding() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  const prepare = (query: string, values: any[] = []): any => ({
    bind: (...next: any[]) => prepare(query, next),
    async all() { return { success: true, results: sqlite.prepare(query).all(...values), meta: {} }; },
    async raw() { const statement=sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...values); },
    async run() { const result=sqlite.prepare(query).run(...values); return {success:true,results:[],meta:{changes:Number(result.changes)}}; }
  });
  const d1: any = {
    prepare,
    async batch(statements: any[]) {
      sqlite.exec('BEGIN');
      try { const results=[]; for(const statement of statements)results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
      catch(error){sqlite.exec('ROLLBACK');throw error;}
    }
  };
  return { sqlite, d1 };
}
async function setup() {
  const {sqlite,d1}=binding();
  for(const name of migrations)sqlite.exec(await readFile(new URL(name,directory),'utf8'));
  const env={CONTENT_DB:d1,LOCAL_AUTHORING:'true',CMS_ORIGIN:'http://127.0.0.1:5174'};
  const request=(path:string,method='GET',body?:unknown,headers:Record<string,string>={})=>app.fetch(
    new Request('http://127.0.0.1:8787'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined}),env
  );
  return {sqlite,env,request};
}
async function imported() {
  const context=await setup();
  const response=await context.request('/api/v1/cms/import','POST',source);
  assert.equal(response.status,201,await response.clone().text());
  const {moduleId}=await response.json() as any;
  const draft=await(await context.request('/api/v1/cms/modules/'+moduleId)).json() as any;
  return {...context,moduleId,draft};
}
test('an imported module exports exactly the same JSON values and existing IDs',async()=>{
  const context=await imported();
  try {
    const response=await context.request('/api/v1/cms/modules/'+context.moduleId+'/export');
    assert.deepEqual(await response.json(),source);
    assert.equal(context.draft.pages.length,20);
    assert.match(context.moduleId,/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    assert.equal(response.headers.get('Cache-Control'),'no-store');
  }finally{context.sqlite.close();}
});
test('re-import cannot replace existing drafts or their baseline',async()=>{
  const context=await imported();
  try{
    const response=await context.request('/api/v1/cms/import','POST',source);
    assert.equal(response.status,409);
    assert.equal(context.sqlite.prepare('select count(*) as count from cms_page_revisions').get()!.count,20);
  }finally{context.sqlite.close();}
});

test('source-mapped imports can require review on every page without changing the source snapshot',async()=>{
  const context=await setup();
  try{
    const response=await context.request('/api/v1/cms/import','POST',{
      providerId:'019a0640-0000-7000-8000-000000000001',reviewRequired:true,course:source
    });
    assert.equal(response.status,201,await response.clone().text());
    const {moduleId}=await response.json() as any;
    const draft=await(await context.request('/api/v1/cms/modules/'+moduleId)).json() as any;
    assert.deepEqual(draft.course,source);
    assert.equal(draft.pages.length,20);
    assert.ok(draft.pages.every((page:any)=>page.wordingReviewRequired));
    assert.equal((await context.request('/api/v1/cms/import','POST',source)).status,409);
    const unchanged=await(await context.request('/api/v1/cms/modules/'+moduleId)).json() as any;
    assert.ok(unchanged.pages.every((page:any)=>page.wordingReviewRequired));
  }finally{context.sqlite.close();}
});
test('a draft reflection saves as a new revision without changing original content',async()=>{
  const context=await imported();
  try{
    const page=structuredClone(context.draft.course.module.pages[4]);
    page.reflection={title:'Review activity',prompt:'Local test activity'};
    const response=await context.request('/api/v1/cms/pages/'+context.draft.pages[4].id+'/draft','PUT',{expectedRevision:1,page});
    assert.equal(response.status,200,await response.clone().text());
    assert.equal((await response.json() as any).revision,2);
    const latest=await(await context.request('/api/v1/cms/modules/'+context.moduleId)).json() as any;
    assert.deepEqual(latest.course.module.pages[4].blocks,source.module.pages[4].blocks);
    assert.deepEqual(JSON.parse(context.sqlite.prepare('select source_document_json from cms_modules').get()!.source_document_json as string),source);
  }finally{context.sqlite.close();}
});
test('concurrent saves from the same revision cannot overwrite each other',async()=>{
  const context=await imported();
  try{
    const page=structuredClone(context.draft.course.module.pages[4]);
    const url='/api/v1/cms/pages/'+context.draft.pages[4].id+'/draft';
    const responses=await Promise.all([context.request(url,'PUT',{expectedRevision:1,page}),context.request(url,'PUT',{expectedRevision:1,page})]);
    assert.deepEqual(responses.map(response=>response.status).sort(),[200,409]);
    assert.equal(context.sqlite.prepare('select count(*) as count from cms_page_revisions').get()!.count,21);
  }finally{context.sqlite.close();}
});
test('wording changes require an explicit unlock and are marked for review',async()=>{
  const context=await imported();
  try{
    const page=structuredClone(context.draft.course.module.pages[4]);
    page.blocks[0].text+=' [draft review test]';
    const url='/api/v1/cms/pages/'+context.draft.pages[4].id+'/draft';
    assert.equal((await context.request(url,'PUT',{expectedRevision:1,page})).status,400);
    const saved=await context.request(url,'PUT',{expectedRevision:1,page,allowWordingChanges:true});
    assert.equal(saved.status,200);
    assert.equal((await saved.json() as any).wordingReviewRequired,true);
  }finally{context.sqlite.close();}
});
test('changing stable IDs is rejected before a revision is written',async()=>{
  const context=await imported();
  try{
    const page=structuredClone(context.draft.course.module.pages[4]);page.blocks[0].id='changed';
    assert.equal((await context.request('/api/v1/cms/pages/'+context.draft.pages[4].id+'/draft','PUT',{expectedRevision:1,page})).status,400);
  }finally{context.sqlite.close();}
});
test('local pilot denies production hosts, absent opt-in, and untrusted browser origins',async()=>{
  const context=await setup();
  try{
    assert.equal((await app.fetch(new Request('https://api.example.com/health'),context.env)).status,403);
    assert.equal((await app.fetch(new Request('http://127.0.0.1:8787/health'),{...context.env,LOCAL_AUTHORING:undefined})).status,403);
    assert.equal((await context.request('/health','GET',undefined,{Origin:'https://untrusted.test'})).status,403);
    assert.equal((await context.request('/health','GET',undefined,{Origin:context.env.CMS_ORIGIN})).status,200);
  }finally{context.sqlite.close();}
});

test('providers own independent courses even when their codes and locales match',async()=>{
  const context=await imported();
  try{
    const provider=await(await context.request('/api/v1/cms/providers','POST',{name:'Partner provider',slug:'partner'})).json() as any;
    const imported=await context.request('/api/v1/cms/import','POST',{providerId:provider.id,course:source});
    assert.equal(imported.status,201,await imported.clone().text());
    const rows=await(await context.request('/api/v1/cms/modules')).json() as any[];
    assert.equal(rows.length,2);assert.equal(new Set(rows.map(row=>row.providerId)).size,2);
    assert.deepEqual(await(await context.request('/api/v1/cms/modules/'+context.moduleId+'/export')).json(),source);
  }finally{context.sqlite.close();}
});
test('authors can create a course, seven modules, a page, blocks and narration without changing existing content',async()=>{
  const context=await imported();
  try{
    const providerId=context.draft.provider.id;
    const created=await context.request('/api/v1/cms/courses','POST',{providerId,code:'new-course',title:'New course',track:'Program',language:'en',region:'global'});
    assert.equal(created.status,201);
    const {courseId}=await created.json() as any;
    let moduleId='';
    for(let number=1;number<=7;number++){
      const result=await context.request('/api/v1/cms/modules','POST',{courseId,title:'Module '+number,number});
      assert.equal(result.status,201,await result.clone().text());
      moduleId=(await result.json() as any).moduleId;
    }
    const result=await context.request('/api/v1/cms/modules/'+moduleId+'/pages','POST',{title:'Added page',template:'teaching'});
    assert.equal(result.status,201);
    const target=await(await context.request('/api/v1/cms/modules/'+moduleId)).json() as any;
    const page=target.course.module.pages.at(-1);
    const {newAuthoringId,appendBlock}=await import('../../../packages/content-model/src/index');
    const extended=appendBlock(page,newAuthoringId(),'paragraph','New teaching');
    extended.guided={narration:'',narration_mode:'browser_tts',segments:extended.blocks.map((block:any)=>({block_id:block.id,text:block.text}))};
    const saved=await context.request('/api/v1/cms/pages/'+target.pages.at(-1).id+'/draft','PUT',{
      expectedRevision:1,page:extended,allowWordingChanges:true,allowStructureChanges:true});
    assert.equal(saved.status,200,await saved.clone().text());
    const exported=await(await context.request('/api/v1/cms/modules/'+moduleId+'/export')).json() as any;
    assert.deepEqual(exported.module.pages.at(-1),extended);
    assert.deepEqual(await(await context.request('/api/v1/cms/modules/'+context.moduleId+'/export')).json(),source);
  }finally{context.sqlite.close();}
});
async function spanish(context:Awaited<ReturnType<typeof imported>>){
  const response=await context.request('/api/v1/cms/modules/'+context.moduleId+'/editions','POST',{language:'es',region:'NI'});
  assert.equal(response.status,201,await response.clone().text());
  const {moduleId}=await response.json() as any;
  return await(await context.request('/api/v1/cms/modules/'+moduleId)).json() as any;
}
test('Spanish/Nicaragua editions retain source identities, detach English audio and preserve source revisions',async()=>{
  const context=await imported();
  try{
    const target=await spanish(context);
    assert.equal(target.course.language,'es');assert.equal(target.course.country,'NI');
    assert.equal(target.pages.length,20);assert.equal(target.pages[4].translationStatus,'untranslated');
    assert.equal(target.pages[4].sourcePageId,context.draft.pages[4].id);
    assert.equal(target.course.module.pages[4].guided.narration_mode,'browser_tts');
    assert.equal(target.course.module.pages[4].guided.segments.some((segment:any)=>segment.audio),false);
    assert.deepEqual(target.course.module.pages[4].blocks,source.module.pages[4].blocks);
    assert.equal((await context.request('/api/v1/cms/modules/'+context.moduleId+'/editions','POST',{language:'es',region:'NI'})).status,409);
    assert.equal((await context.request('/api/v1/cms/modules/'+target.id+'/pages','POST',{title:'Wrong place'})).status,400);
  }finally{context.sqlite.close();}
});
test('reviewed translations become stale after source edits and new source pages can be synchronized',async()=>{
  const context=await imported();
  try{
    const target=await spanish(context),page=structuredClone(target.course.module.pages[4]);
    page.title='Texto revisado';
    const pageUrl='/api/v1/cms/pages/'+target.pages[4].id+'/draft';
    assert.equal((await context.request(pageUrl,'PUT',{expectedRevision:1,page,allowWordingChanges:true,translationStatus:'reviewed',sourceRevision:1,reviewNote:'Checked Scripture'})).status,200);
    const english=structuredClone(context.draft.course.module.pages[4]);english.title+=' source draft';
    assert.equal((await context.request('/api/v1/cms/pages/'+context.draft.pages[4].id+'/draft','PUT',{expectedRevision:1,page:english,allowWordingChanges:true})).status,200);
    const refreshed=await(await context.request('/api/v1/cms/modules/'+target.id)).json() as any;
    assert.equal(refreshed.pages[4].needsUpdate,true);assert.equal(refreshed.pages[4].reviewNote,'Checked Scripture');
    assert.equal((await context.request(pageUrl,'PUT',{expectedRevision:2,page,allowWordingChanges:true,translationStatus:'reviewed',sourceRevision:1})).status,409);
    await context.request('/api/v1/cms/modules/'+context.moduleId+'/pages','POST',{title:'Later source page'});
    const sync=await context.request('/api/v1/cms/modules/'+target.id+'/sync-source','POST',{});
    assert.deepEqual(await sync.json(),{added:1});
    assert.deepEqual(await(await context.request('/api/v1/cms/modules/'+target.id+'/sync-source','POST',{})).json(),{added:0});
    const final=await(await context.request('/api/v1/cms/modules/'+target.id)).json() as any;
    assert.equal(final.pages.length,21);assert.equal(final.course.module.pages[4].title,'Texto revisado');
  }finally{context.sqlite.close();}
});
test('AI translation accepts only source text fields, saves a review draft and never changes the source',async()=>{
  const context=await imported(),originalFetch=globalThis.fetch;
  try{
    const target=await spanish(context);
    await context.request('/api/v1/cms/translation-settings','PUT',{apiKey:'test-key-not-a-real-secret',model:'gpt-5-mini'});
    globalThis.fetch=async(_url,init)=>{
      const request=JSON.parse(init!.body as string),input=JSON.parse(request.input);
      assert.equal(request.store,false);assert.equal(request.text.format.strict,true);
      assert.equal(input.language,'es');assert.equal(input.region,'NI');
      assert.equal(Object.keys(input.fields).some(key=>key.includes('audio')),false);
      const fields=Object.fromEntries(Object.entries(input.fields).map(([key,text])=>[key,text?'ES: '+text:'']));
      return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(fields)}]}]}),{status:200});
    };
    const url='/api/v1/cms/pages/'+target.pages[4].id+'/translate';
    const response=await context.request(url,'POST',{expectedRevision:1});
    assert.equal(response.status,200,await response.clone().text());
    const translated=await(await context.request('/api/v1/cms/modules/'+target.id)).json() as any;
    assert.match(translated.course.module.pages[4].title,/^ES:/);assert.equal(translated.pages[4].translationStatus,'draft');
    assert.equal((await context.request(url,'POST',{expectedRevision:2})).status,409);
    assert.deepEqual(await(await context.request('/api/v1/cms/modules/'+context.moduleId+'/export')).json(),source);
    const status=await context.request('/api/v1/cms/translation-settings');
    const text=await status.text();assert.equal(text.includes('test-key'),false);assert.equal(JSON.parse(text).configured,true);
    // Failed/refused generation preserves the current target revision.
    globalThis.fetch=async()=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'refusal'}]}]}));
    assert.equal((await context.request(url,'POST',{expectedRevision:2,overwrite:true})).status,422);
    const kept=await(await context.request('/api/v1/cms/modules/'+target.id)).json() as any;
    assert.equal(kept.pages[4].revision,2);
  }finally{globalThis.fetch=originalFetch;await context.request('/api/v1/cms/translation-settings','PUT',{forget:true});context.sqlite.close();}
});
test('module headings use optimistic revisions',async()=>{
  const context=await imported();
  try{
    const input={expectedRevision:1,headings:{courseTitle:'Course draft',moduleTitle:'Module draft',track:'Program'}};
    const url='/api/v1/cms/modules/'+context.moduleId+'/headings';
    assert.equal((await context.request(url,'PUT',input)).status,200);
    assert.equal((await context.request(url,'PUT',input)).status,409);
    const draft=await(await context.request('/api/v1/cms/modules/'+context.moduleId)).json() as any;
    assert.equal(draft.course.module.title,'Module draft');
  }finally{context.sqlite.close();}
});
test('provider migration preserves existing local draft history and backfills New Vines ownership',async()=>{
  const {sqlite}=binding();
  try{
    sqlite.exec(await readFile(new URL(migrations[0],directory),'utf8'));
    sqlite.prepare('INSERT INTO cms_courses (id,canonical_id,locale,metadata_json) VALUES (?,?,?,?)').run('old-course','original','en-global','{}');
    sqlite.prepare('INSERT INTO cms_modules (id,course_id,canonical_id,metadata_json,source_document_json,source_hash) VALUES (?,?,?,?,?,?)').run('old-module','old-course','module','{}','{}','hash');
    sqlite.prepare('INSERT INTO cms_pages (id,module_id,canonical_id,position) VALUES (?,?,?,?)').run('old-page','old-module','page',0);
    sqlite.prepare('INSERT INTO cms_page_revisions (id,page_id,revision,document_json,wording_review_required,created_at) VALUES (?,?,?,?,?,?)').run('old-revision','old-page',4,'{"original":"draft"}',1,'original-time');
    for(const name of migrations.slice(1))sqlite.exec(await readFile(new URL(name,directory),'utf8'));
    assert.equal(sqlite.prepare('SELECT provider_id FROM cms_courses').get()!.provider_id,'019a0640-0000-7000-8000-000000000001');
    const row=sqlite.prepare('SELECT * FROM cms_page_revisions').get()!;
    assert.equal(row.document_json,'{"original":"draft"}');assert.equal(row.revision,4);assert.equal(row.created_at,'original-time');
  }finally{sqlite.close();}
});

test('malformed or stale AI results leave the translation revision unchanged',async()=>{
  const context=await imported(),originalFetch=globalThis.fetch;
  try{
    const target=await spanish(context),url='/api/v1/cms/pages/'+target.pages[4].id+'/translate';
    await context.request('/api/v1/cms/translation-settings','PUT',{apiKey:'test-key-not-a-real-secret'});
    globalThis.fetch=async()=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:'{"unexpected":"wrong fields"}'}]}]}));
    assert.equal((await context.request(url,'POST',{expectedRevision:1})).status,502);
    globalThis.fetch=async(_url,init)=>{
      const request=JSON.parse(init!.body as string),fields=JSON.parse(request.input).fields;
      const sourcePage=structuredClone(context.draft.course.module.pages[4]);sourcePage.title+=' changed while generating';
      assert.equal((await context.request('/api/v1/cms/pages/'+context.draft.pages[4].id+'/draft','PUT',{expectedRevision:1,page:sourcePage,allowWordingChanges:true})).status,200);
      return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(fields)}]}]}));
    };
    assert.equal((await context.request(url,'POST',{expectedRevision:1})).status,409);
    const kept=await(await context.request('/api/v1/cms/modules/'+target.id)).json() as any;
    assert.equal(kept.pages[4].revision,1);assert.equal(kept.pages[4].translationStatus,'untranslated');assert.equal(kept.pages[4].needsUpdate,true);
  }finally{globalThis.fetch=originalFetch;await context.request('/api/v1/cms/translation-settings','PUT',{forget:true});context.sqlite.close();}
});
test('concurrent module creation cannot duplicate a presentation number',async()=>{
  const context=await imported();
  try{
    const input={courseId:context.draft.courseId,title:'Concurrent new module',number:2};
    const responses=await Promise.all([context.request('/api/v1/cms/modules','POST',input),context.request('/api/v1/cms/modules','POST',input)]);
    assert.deepEqual(responses.map(response=>response.status).sort(),[201,409]);
  }finally{context.sqlite.close();}
});
test('existing block IDs cannot be replaced even during an explicit structure addition',async()=>{
  const context=await imported();
  try{
    const {newAuthoringId}=await import('../../../packages/content-model/src/index');
    const page=structuredClone(context.draft.course.module.pages[4]);page.blocks[0].id=newAuthoringId();
    assert.equal((await context.request('/api/v1/cms/pages/'+context.draft.pages[4].id+'/draft','PUT',{
      expectedRevision:1,page,allowWordingChanges:true,allowStructureChanges:true})).status,400);
  }finally{context.sqlite.close();}
});
test('localhost alias supports the editor origin but other local ports and form posts are denied',async()=>{
  const context=await setup();
  try{
    assert.equal((await context.request('/api/v1/cms/providers','GET',undefined,{Origin:'http://localhost:5174'})).status,200);
    assert.equal((await context.request('/api/v1/cms/providers','GET',undefined,{Origin:'http://localhost:9999'})).status,403);
    const response=await app.fetch(new Request('http://127.0.0.1:8787/api/v1/cms/translation-settings',{
      method:'PUT',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'apiKey=bad'}),context.env);
    assert.equal(response.status,415);
  }finally{context.sqlite.close();}
});

test('page insertion, ordering and deletion retain revisions and protect linked editions',async()=>{
 const context=await imported();
 try{
  const route='/api/v1/cms/modules/'+context.moduleId;
  const editionResponse=await context.request(route+'/editions','POST',{language:'es',region:'NI'});
  assert.equal(editionResponse.status,201);const edition=await editionResponse.json() as any;
  const order=context.draft.pages.map((page:any)=>page.id).reverse();
  assert.equal((await context.request(route+'/page-order','PUT',{expectedStructureRevision:1,pageIds:order})).status,200);
  assert.equal((await context.request(route+'/page-order','PUT',{expectedStructureRevision:1,pageIds:order})).status,409);
  let current=await(await context.request(route)).json() as any;
  assert.equal(current.pages[0].id,order[0]);assert.equal(current.structureRevision,2);
  const reorderedEdition=await(await context.request('/api/v1/cms/modules/'+edition.moduleId)).json() as any;assert.deepEqual(reorderedEdition.pages.map((page:any)=>page.sourcePageId),order);
  const addedResponse=await context.request(route+'/pages','POST',{title:'Inserted Test Page',template:'teaching',afterPageId:order[0],expectedStructureRevision:2});
  assert.equal(addedResponse.status,201);const added=await addedResponse.json() as any;
  current=await(await context.request(route)).json() as any;assert.equal(current.pages[1].id,added.pageId);
  assert.equal((await context.request('/api/v1/cms/modules/'+edition.moduleId+'/sync-source','POST',{})).status,200);
  const synchronized=await(await context.request('/api/v1/cms/modules/'+edition.moduleId)).json() as any;assert.deepEqual(synchronized.course.module.pages.map((page:any)=>page.id),current.course.module.pages.map((page:any)=>page.id));
  const removed=current.pages[0];
  assert.equal((await context.request(route+'/pages/'+removed.id+'/delete','POST',{expectedStructureRevision:3})).status,200);
  current=await(await context.request(route)).json() as any;assert.equal(current.pages.length,20);assert.equal(current.pages.some((page:any)=>page.id===removed.id),false);
  const target=await(await context.request('/api/v1/cms/modules/'+edition.moduleId)).json() as any;assert.equal(target.pages.length,20);assert.equal(target.pages.some((page:any)=>page.sourcePageId===removed.id),false);
  assert.equal(context.sqlite.prepare('select count(*) as count from cms_page_revisions where page_id=?').get(removed.id)!.count,1);
  assert.equal((await context.request('/api/v1/cms/pages/'+removed.id+'/draft','PUT',{expectedRevision:1,page:context.draft.course.module.pages.at(-1)})).status,404);
 }finally{context.sqlite.close();}
});
test('explicit block deletion retains prior text and removes its narration mapping',async()=>{
 const context=await imported();
 try{
  const before=context.draft.course.module.pages[4],page=structuredClone(before),removed=page.blocks[0].id;
  page.blocks=page.blocks.slice(1);page.guided.segments=page.guided.segments.filter((segment:any)=>segment.block_id!==removed);
  const path='/api/v1/cms/pages/'+context.draft.pages[4].id+'/draft';
  assert.equal((await context.request(path,'PUT',{expectedRevision:1,page,allowWordingChanges:true,allowStructureChanges:true})).status,400);
  const saved=await context.request(path,'PUT',{expectedRevision:1,page,allowWordingChanges:true,allowStructureChanges:true,removedBlockIds:[removed]});
  assert.equal(saved.status,200,await saved.clone().text());
  const latest=await(await context.request('/api/v1/cms/modules/'+context.moduleId)).json() as any;assert.equal(latest.course.module.pages[4].blocks.length,before.blocks.length-1);
  const original=JSON.parse(context.sqlite.prepare('select document_json from cms_page_revisions where page_id=? and revision=1').get(context.draft.pages[4].id)!.document_json as string);assert.deepEqual(original,before);
 }finally{context.sqlite.close();}
});
test('narration and images use scoped ownership and explicit AI payloads without calling OpenAI',async()=>{
 const context=await imported(),previousFetch=globalThis.fetch;
 try{
  let requests:any[]=[];
  globalThis.fetch=async(input:any,init:any)=>{
   const url=String(input),payload=JSON.parse(init.body);requests.push({url,payload});
   if(url.endsWith('/audio/speech'))return new Response(new Uint8Array([1,2,3]));
   if(url.endsWith('/images/generations'))return Response.json({data:[{b64_json:'aW1hZ2U='}]});
   if(url.endsWith('/audio'))return Response.json({audio:'/audio/cms/test.opus'},{status:201});
   if(url.endsWith('/image'))return Response.json({image:{src:'/assets/cms/test.webp'}},{status:201});
   throw Error('Unexpected network request '+url);
  };
  await context.request('/api/v1/cms/translation-settings','PUT',{apiKey:'test-only-key-for-media-no-real-account'});
  const page=context.draft.pages[4],block=context.draft.course.module.pages[4].blocks[0].id;
  const route='/api/v1/cms/modules/'+context.moduleId+'/pages/'+page.id+'/media/';
  assert.equal((await context.request(route+'speech','POST',{expectedRevision:99,blockId:block,script:'Test'})).status,409);assert.equal(requests.length,0);
  const speech=await context.request(route+'speech','POST',{expectedRevision:1,blockId:block,script:'Read this test text'});
  assert.equal(speech.status,201,await speech.clone().text());assert.equal(requests[0].payload.voice,'marin');assert.equal(requests[0].payload.response_format,'opus');
  assert.equal(requests[1].payload.context.provider,'new-vines');assert.equal(requests[1].payload.context.locale,'en-global');assert.ok(requests[1].payload.context.course.includes(context.draft.courseId));assert.ok(requests[1].payload.context.page.includes(page.id));
  const image=await context.request(route+'image-generate','POST',{expectedRevision:1,blockId:block,description:'A family eating food'});
  assert.equal(image.status,201,await image.clone().text());assert.equal(requests[2].payload.output_format,'webp');assert.ok(requests[2].payload.prompt.includes('A family eating food'));
  const refreshed=await(await context.request('/api/v1/cms/modules/'+context.moduleId)).json() as any;assert.equal(refreshed.pages[4].revision,1,'Media generation returns an asset for the unsaved draft, without overwriting content');
 }finally{globalThis.fetch=previousFetch;await context.request('/api/v1/cms/translation-settings','PUT',{forget:true});context.sqlite.close();}
});
test('publication checks the complete snapshot and translation review before any upload',async()=>{
 const context=await imported(),previousFetch=globalThis.fetch;let uploaded=0;
 try{
  globalThis.fetch=async()=>{uploaded++;return Response.json({url:'https://content.example/course.json'});};
  const path='/api/v1/cms/modules/'+context.moduleId+'/publish';
  const body={confirm:true,approvePrimaryWording:true,structureRevision:1,metadataRevision:1,pages:Object.fromEntries(context.draft.pages.map((page:any)=>[page.id,page.revision]))};
  assert.equal((await context.request(path,'POST',{...body,structureRevision:999})).status,409);assert.equal(uploaded,0);
  const edition=await(await context.request('/api/v1/cms/modules/'+context.moduleId+'/editions','POST',{language:'es',region:'NI'})).json() as any;
  const target=await(await context.request('/api/v1/cms/modules/'+edition.moduleId)).json() as any;
  const translated={...body,pages:Object.fromEntries(target.pages.map((page:any)=>[page.id,page.revision]))};
  assert.equal((await context.request('/api/v1/cms/modules/'+edition.moduleId+'/publish','POST',translated)).status,400);assert.equal(uploaded,0);
  assert.equal((await context.request(path,'POST',body)).status,201);assert.equal(uploaded,1);
 }finally{globalThis.fetch=previousFetch;context.sqlite.close();}
});

test('AI settings survive separate requests and replacement, never return credentials, and preserve a saved key on invalid input',async()=>{
 const context=await imported(),originalFetch=globalThis.fetch;
 const path='/api/v1/cms/translation-settings';
 try{
  await context.request(path,'PUT',{forget:true});
  const initial=await(await context.request(path)).json() as any;assert.equal(initial.configured,false);
  const first='test-first-settings-key-not-real',replacement='test-replacement-settings-key-not-real';
  assert.equal((await context.request(path,'PUT',{apiKey:first,model:'gpt-5-mini'})).status,200);
  const status=await(await context.request(path)).text();assert.equal(JSON.parse(status).configured,true);assert.equal(status.includes(first),false);
  assert.equal((await context.request(path,'PUT',{apiKey:replacement})).status,200);
  assert.equal((await context.request(path,'PUT',{apiKey:'short'})).status,400);
  assert.equal((await(await context.request(path)).json() as any).configured,true);
  let usedSavedKey=false;
  globalThis.fetch=async(url:any,init:any)=>{
   if(String(url).endsWith('/images/generations')){usedSavedKey=init.headers.Authorization==='Bearer '+replacement;return Response.json({data:[{b64_json:'aW1hZ2U='}]});}
   if(String(url).endsWith('/image'))return Response.json({image:{src:'/assets/cms/test.webp'}});
   throw Error('Unexpected network request');
  };
  const page=context.draft.pages[4],block=context.draft.course.module.pages[4].blocks[0];
  const route='/api/v1/cms/modules/'+context.moduleId+'/pages/'+page.id+'/media/image-generate';
  const body={expectedRevision:page.revision,blockId:block.id,description:'Test educational illustration'};
  assert.equal((await context.request(route,'POST',body)).status,201);assert.equal(usedSavedKey,true);
  await context.request(path,'PUT',{forget:true});usedSavedKey=false;
  const missing=await context.request(route,'POST',body);assert.equal(missing.status,503);assert.ok((await missing.json() as any).error.includes('click Save Settings'));assert.equal(usedSavedKey,false);
 }finally{globalThis.fetch=originalFetch;await context.request(path,'PUT',{forget:true});context.sqlite.close();}
});
