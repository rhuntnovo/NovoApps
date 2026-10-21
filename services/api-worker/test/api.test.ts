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
