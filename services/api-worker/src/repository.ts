import { moduleStructures } from '../../../database/content/structure';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { v7 } from 'uuid';
import { courses, modules, pages, pageRevisions, providers } from '../../../database/content/schema';
import { courseSchema, canonicalChanged, sameBlockIds, withoutAudio, localeKey, NVI_PROVIDER_ID,
  type PublishedCourse, type CoursePage, type AuthoringModule, type ModuleHeadings } from '@novoapps/content-model';

export class ContentError extends Error {
  constructor(public status:400|403|404|409|422|502|503, message:string) { super(message); }
}
const digest = async (value:unknown) => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))]
  .map(byte=>byte.toString(16).padStart(2,'0')).join('');
export function contentRepository(binding:D1Database,actorUserId?:string) {
  const db=drizzle(binding);
  const latest=db.select({pageId:pageRevisions.pageId,revision:sql<number>`max(${pageRevisions.revision})`.as('latest_revision')})
    .from(pageRevisions).groupBy(pageRevisions.pageId).as('latest');
  const currentPages=(moduleId:string)=>db.select({
    id:pages.id,canonicalId:pages.canonicalId,sourcePageId:pages.sourcePageId,
    revision:pageRevisions.revision,wordingReviewRequired:pageRevisions.wordingReviewRequired,
    document:pageRevisions.document,sourceRevision:pageRevisions.sourceRevision,
    translationStatus:pageRevisions.translationStatus,reviewNote:pageRevisions.reviewNote
  }).from(pages).innerJoin(latest,eq(latest.pageId,pages.id))
    .innerJoin(pageRevisions,and(eq(pageRevisions.pageId,pages.id),eq(pageRevisions.revision,latest.revision)))
    .where(eq(pages.moduleId,moduleId)).orderBy(asc(pages.position));
  const currentPage=(pageId:string)=>db.select().from(pageRevisions).where(eq(pageRevisions.pageId,pageId))
    .orderBy(desc(pageRevisions.revision)).limit(1).get();
  const moduleRow=(id:string)=>db.select({module:modules,course:courses,provider:providers}).from(modules)
    .innerJoin(courses,eq(courses.id,modules.courseId)).innerJoin(providers,eq(providers.id,courses.providerId))
    .where(eq(modules.id,id)).get();
  async function structure(moduleId:string){
    const row=await db.select().from(moduleStructures).where(eq(moduleStructures.moduleId,moduleId)).orderBy(desc(moduleStructures.revision)).limit(1).get();
    return row?{revision:row.revision,pageIds:row.pageIds}:{revision:1,pageIds:(await currentPages(moduleId)).map(page=>page.id)};
  }
  function structureInsert(moduleId:string,revision:number,pageIds:string[]){
    return db.insert(moduleStructures).values({id:v7(),moduleId,revision,pageIds,createdAt:new Date().toISOString()});
  }
  async function getModule(moduleId:string):Promise<AuthoringModule> {
    const row=await moduleRow(moduleId);
    if(!row)throw new ContentError(404,'Module not found');
    const order=await structure(moduleId), all=await currentPages(moduleId);
    const saved=order.pageIds.map(id=>all.find(page=>page.id===id)).filter((page):page is typeof all[number]=>!!page);
    const source=row.module.sourceModuleId?await getModule(row.module.sourceModuleId):null;
    const headings=row.module.headings;
    const course=courseSchema.parse({...row.course.metadata,
      ...(headings?{title:headings.courseTitle,track:headings.track}:{}),
      module:{...row.module.metadata,...(headings?{title:headings.moduleTitle}:{}),pages:saved.map(page=>page.document)}});
    return {id:moduleId,courseId:row.course.id,structureRevision:order.revision,provider:row.provider,course,sourceModuleId:row.module.sourceModuleId,
      sourceCourse:source?.course||null,metadataRevision:row.module.metadataRevision,
      missingSourcePages:source?source.pages.filter(page=>!saved.some(target=>target.sourcePageId===page.id)).length:0,
      pages:saved.map(({document:_document,...summary})=>{
        const original=source?.pages.find(page=>page.id===summary.sourcePageId);
        return {...summary,sourceCurrentRevision:original?.revision||null,
          needsUpdate:!!original&&original.revision!==summary.sourceRevision};
      })};
  }
  async function importCourse(course:PublishedCourse,providerId=NVI_PROVIDER_ID,source?:AuthoringModule,reviewRequired=false) {
    const provider=await db.select().from(providers).where(eq(providers.id,providerId)).get();
    if(!provider)throw new ContentError(404,'Provider not found');
    const locale=localeKey(course.language,course.country);
    const existing=await db.select().from(courses).where(and(eq(courses.providerId,providerId),eq(courses.canonicalId,course.course_id),eq(courses.locale,locale))).get();
    const courseId=existing?.id||v7();
    if(existing && await db.select().from(modules).where(and(eq(modules.courseId,courseId),eq(modules.canonicalId,course.module.id))).get())
      throw new ContentError(409,'This module/edition is already imported. Existing drafts were not overwritten.');
    const {module,...metadata}=course;
    const {pages:sourcePages,...moduleMetadata}=module;
    if(existing && !source && JSON.stringify(existing.metadata)!==JSON.stringify(metadata))
      throw new ContentError(409,'Course metadata differs from the existing edition. Import requires review.');
    if(source&&existing&&existing.sourceCourseId!==source.courseId)
      throw new ContentError(409,'That edition belongs to a different source course.');
    const moduleId=v7(),createdAt=new Date().toISOString();
    const pageRows=sourcePages.map((page,position)=>({id:v7(),moduleId,canonicalId:page.id,position,
      sourcePageId:source?.pages.find(item=>item.canonicalId===page.id)?.id||null}));
    const revisions=pageRows.map((page,index)=>({id:v7(),pageId:page.id,revision:1,document:sourcePages[index],
      wordingReviewRequired:reviewRequired,createdAt,createdBy:actorUserId||null,sourceRevision:source?.pages[index]?.revision||null,
      translationStatus:source?'untranslated' as const:null,reviewNote:''}));
    const sourceHash=await digest(course);
    try {
      await db.batch([
        db.insert(courses).values({id:courseId,canonicalId:course.course_id,locale,metadata,providerId,sourceCourseId:source?.courseId||null}).onConflictDoNothing(),
        db.insert(modules).values({id:moduleId,courseId,canonicalId:module.id,metadata:moduleMetadata,sourceDocument:course,sourceHash,sourceModuleId:source?.id||null}),
        ...pageRows.map(page=>db.insert(pages).values(page)),
        ...revisions.map(revision=>db.insert(pageRevisions).values(revision))
      ]);
    }catch(error) {
      if((await db.select().from(modules).where(eq(modules.courseId,courseId))).some(item=>item.canonicalId===module.id||item.metadata.number===module.number))
        throw new ContentError(409,'This module/edition was already created. Reload the library.');
      throw error;
    }
    return {moduleId,sourceHash};
  }
  async function appendPage(moduleId:string,page:CoursePage,sourcePageId:string|null=null,sourceRevision:number|null=null,afterPageId?:string,expectedStructureRevision?:number) {
    const module=await getModule(moduleId);
    if(module.sourceModuleId&&!sourcePageId)throw new ContentError(400,'Add pages to the source module, then synchronize this edition.');
    courseSchema.parse({...module.course,module:{...module.course.module,pages:[...module.course.module.pages,page]}});
    if(expectedStructureRevision!==undefined&&module.structureRevision!==expectedStructureRevision)throw new ContentError(409,'Page order changed. Reload before adding a page.');
    const pageId=v7(),order=module.pages.map(item=>item.id);
    const after=afterPageId?order.indexOf(afterPageId):order.length-1;
    if(afterPageId&&after<0)throw new ContentError(409,'The selected page is no longer present.');
    order.splice(after+1,0,pageId);
    const last=await db.select({position:sql<number>`coalesce(max(${pages.position}),-1)`}).from(pages).where(eq(pages.moduleId,moduleId)).get();
    try {
      await db.batch([
        db.insert(pages).values({id:pageId,moduleId,canonicalId:page.id,position:(last?.position??-1)+1,sourcePageId}),
        db.insert(pageRevisions).values({id:v7(),pageId,revision:1,document:page,wordingReviewRequired:!sourcePageId,
          createdAt:new Date().toISOString(),createdBy:actorUserId||null,sourceRevision,translationStatus:sourcePageId?'untranslated':null,reviewNote:''}),
        structureInsert(moduleId,module.structureRevision+1,order)
      ]);
    }catch(error) {
      if((await currentPages(moduleId)).length!==module.pages.length)
        throw new ContentError(409,'Another page was added. Reload before trying again.');
      throw error;
    }
    return {pageId};
  }
  function blankPage(title:string,template:CoursePage['template']='teaching'):CoursePage {
    return {id:v7(),source_slide:0,title,layout:template||'teaching',template,
      presentation:{reveal_blocks:template!=='title'&&template!=='prayer'},
      blocks:[{id:v7(),type:template==='title'?'title':template==='prayer'?'prayer':'paragraph',
        text:title,localization_policy:'TRANSLATE'}]};
  }
  return {
    getModule,importCourse,
    async reorderPages(moduleId:string,expectedRevision:number,pageIds:string[]){
      const current=await getModule(moduleId);
      if(current.structureRevision!==expectedRevision)throw new ContentError(409,'Page order changed. Reload first.');
      if(pageIds.length!==current.pages.length||new Set(pageIds).size!==pageIds.length||current.pages.some(page=>!pageIds.includes(page.id)))throw new ContentError(400,'Supply each active page exactly once.');
      if(current.sourceModuleId)throw new ContentError(400,'Change page order in the primary language. Linked editions follow it.');
      const changes=[structureInsert(moduleId,expectedRevision+1,pageIds)];
      const editions=await db.select().from(modules).where(eq(modules.sourceModuleId,moduleId));
      for(const edition of editions){const target=await getModule(edition.id);const ordered=pageIds.flatMap(id=>{const page=target.pages.find(page=>page.sourcePageId===id);return page?[page.id]:[];});changes.push(structureInsert(edition.id,target.structureRevision+1,ordered));}
      try{await db.batch([changes[0],...changes.slice(1)]);}catch{throw new ContentError(409,'A linked page order changed. Reload first.');}
      return {revision:expectedRevision+1};
    },
    async deletePage(moduleId:string,pageId:string,expectedRevision:number){
      const current=await getModule(moduleId);
      if(current.structureRevision!==expectedRevision)throw new ContentError(409,'Page order changed. Reload first.');
      if(!current.pages.some(page=>page.id===pageId))throw new ContentError(404,'Page not found.');
      if(current.pages.length<2)throw new ContentError(400,'Keep at least one page in a module.');
      const changes=[structureInsert(moduleId,expectedRevision+1,current.pages.filter(page=>page.id!==pageId).map(page=>page.id))];
      if(!current.sourceModuleId){
        const editions=await db.select().from(modules).where(eq(modules.sourceModuleId,moduleId));
        for(const edition of editions){const target=await getModule(edition.id);const remaining=target.pages.filter(page=>page.sourcePageId!==pageId);
          if(remaining.length!==target.pages.length){if(!remaining.length)throw new ContentError(400,'A linked language edition would have no pages.');changes.push(structureInsert(edition.id,target.structureRevision+1,remaining.map(page=>page.id)));}}
      }
      try{await db.batch([changes[0],...changes.slice(1)]);}catch{throw new ContentError(409,'A linked page order changed. Reload before deleting.');}
      return {archived:true};
    },
    async listProviders(){return db.select().from(providers).orderBy(asc(providers.name));},
    async createProvider(input:{name:string;slug:string}) {
      const row={id:v7(),...input,defaultLocale:'en-global',createdAt:new Date().toISOString()};
      if(await db.select().from(providers).where(eq(providers.slug,input.slug)).get())throw new ContentError(409,'Provider slug is already in use.');
      await db.insert(providers).values(row);return row;
    },
    async listCourses(){return db.select({id:courses.id,providerId:courses.providerId,canonicalId:courses.canonicalId,
      locale:courses.locale,metadata:courses.metadata,sourceCourseId:courses.sourceCourseId}).from(courses).orderBy(asc(courses.canonicalId));},
    async createCourse(input:{providerId:string;title:string;code:string;track:string;language:string;region:string}){
      const provider=await db.select().from(providers).where(eq(providers.id,input.providerId)).get();
      if(!provider)throw new ContentError(404,'Provider not found');
      const locale=localeKey(input.language,input.region);
      if(await db.select().from(courses).where(and(eq(courses.providerId,input.providerId),eq(courses.canonicalId,input.code),eq(courses.locale,locale))).get())
        throw new ContentError(409,'That course code and edition already exist for this provider.');
      const row={id:v7(),providerId:input.providerId,canonicalId:input.code,locale,
        metadata:{provider:{id:provider.id,name:provider.name},schema_version:'0.3' as const,course_id:input.code,title:input.title,track:input.track,
          language:input.language,country:input.region,source_issues:[]}};
      await db.insert(courses).values(row);return {courseId:row.id};
    },
    async listModules(){
      const rows=await db.select({id:modules.id,canonicalId:modules.canonicalId,courseId:courses.id,providerId:providers.id,
        providerName:providers.name,locale:courses.locale,course:courses.metadata,module:modules.metadata,
        sourceModuleId:modules.sourceModuleId,headings:modules.headings})
        .from(modules).innerJoin(courses,eq(courses.id,modules.courseId)).innerJoin(providers,eq(providers.id,courses.providerId))
        .orderBy(asc(courses.canonicalId));
      return rows.map(row=>({...row,course:{...row.course,...(row.headings?{title:row.headings.courseTitle}:{})},
        module:{...row.module,...(row.headings?{title:row.headings.moduleTitle}:{})}}));
    },
    async createModule(input:{courseId:string;title:string;number:number}){
      const course=await db.select().from(courses).where(eq(courses.id,input.courseId)).get();
      if(!course?.providerId)throw new ContentError(404,'Course not found');
      if(course.sourceCourseId)throw new ContentError(400,'Create modules in the canonical source course, then create their editions.');
      const existing=await db.select().from(modules).where(eq(modules.courseId,course.id));
      if(existing.some(item=>item.metadata.number===input.number))throw new ContentError(409,'That module number already exists.');
      return importCourse(courseSchema.parse({...course.metadata,module:{id:v7(),number:input.number,title:input.title,pages:[blankPage('New page')]}}),course.providerId);
    },
    async createPage(moduleId:string,input:{title:string;template:CoursePage['template'];afterPageId?:string;expectedStructureRevision?:number}){
      return appendPage(moduleId,blankPage(input.title,input.template),null,null,input.afterPageId,input.expectedStructureRevision);
    },
    async createEdition(moduleId:string,input:{language:string;region:string}){
      const source=await getModule(moduleId);
      if(source.sourceModuleId)throw new ContentError(400,'Create an edition from the canonical source module.');
      if(localeKey(source.course.language,source.course.country)===localeKey(input.language,input.region))
        throw new ContentError(400,'Choose a different language or region.');
      const course=structuredClone(source.course);
      course.language=input.language;course.country=input.region;course.provider={id:source.provider.id,name:source.provider.name};
      course.module.pages=course.module.pages.map(page=>{
        const translated=withoutAudio(page),issue=course.source_issues.find(item=>item.source_slide===page.source_slide);
        if(issue)translated.presentation={...translated.presentation,source_note:issue.note};
        return translated;
      });
      // Source issues are retained as provenance; they are not AI translation instructions.
      return importCourse(course,source.provider.id,source);
    },
    async syncEdition(moduleId:string){
      const target=await getModule(moduleId);
      if(!target.sourceModuleId)throw new ContentError(400,'This is a source module.');
      const source=await getModule(target.sourceModuleId);
      let added=0;
      for(const page of source.pages)if(!target.pages.some(item=>item.sourcePageId===page.id)){
        const document=source.course.module.pages.find(item=>item.id===page.canonicalId)!;
        await appendPage(moduleId,withoutAudio(document),page.id,page.revision);added++;
      }
      if(added){const latest=await getModule(moduleId);const order=source.pages.flatMap(page=>{const target=latest.pages.find(item=>item.sourcePageId===page.id);return target?[target.id]:[];});if(order.some((id,index)=>id!==latest.pages[index]?.id)){try{await structureInsert(moduleId,latest.structureRevision+1,order);}catch{throw new ContentError(409,'Page order changed during synchronization. Reload this edition.');}}}
      return {added};
    },
    async saveHeadings(moduleId:string,expectedRevision:number,headings:ModuleHeadings){
      const saved=await db.update(modules).set({headings,metadataRevision:expectedRevision+1})
        .where(and(eq(modules.id,moduleId),eq(modules.metadataRevision,expectedRevision))).returning({revision:modules.metadataRevision}).get();
      if(!saved)throw new ContentError(409,'Module headings changed. Reload before saving.');
      return saved;
    },
    async savePage(pageId:string,expectedRevision:number,page:CoursePage,allowWordingChanges:boolean,
      options:{removedBlockIds?:string[];allowStructureChanges?:boolean;translationStatus?:'untranslated'|'draft'|'reviewed';reviewNote?:string;sourceRevision?:number}={}) {
      const identity=await db.select().from(pages).where(eq(pages.id,pageId)).get();
      if(!identity)throw new ContentError(404,'Page not found');
      const before=await currentPage(pageId);
      if(!before||before.revision!==expectedRevision)throw new ContentError(409,'Another editor saved this page. Reload the latest draft before saving again.');
      if(page.id!==identity.canonicalId)throw new ContentError(400,'Published page IDs must be preserved.');
      const owner=await getModule(identity.moduleId);
      if(!owner.pages.some(item=>item.id===pageId))throw new ContentError(404,'This page was deleted. Its earlier revisions are retained.');
      const source=owner.sourceCourse?.module.pages.find(item=>item.id===page.id);
      const newBlocks=page.blocks.filter(block=>!before.document.blocks.some(item=>item.id===block.id));
      if(!sameBlockIds(before.document,page)) {
                const removed=before.document.blocks.filter(block=>!page.blocks.some(item=>item.id===block.id)).map(block=>block.id);
        const oldKept=removed.length===0||(removed.length===(options.removedBlockIds?.length||0)&&removed.every(id=>options.removedBlockIds?.includes(id)));
        const validAdditions=newBlocks.every(block=>/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(block.id));
        const generatedStructure=identity.sourcePageId && source && source.blocks.every(block=>page.blocks.some(item=>item.id===block.id)) && page.blocks.length===source.blocks.length;
        if(!(generatedStructure || options.allowStructureChanges&&oldKept&&validAdditions&&!identity.sourcePageId))
          throw new ContentError(400,'Existing block IDs must be preserved; new source blocks require UUIDv7 IDs and an explicit structure change.');
      }
      const textChanged=canonicalChanged(before.document,page);
      if(textChanged&&!allowWordingChanges)throw new ContentError(400,'Unlock draft wording changes explicitly before editing canonical text.');
      // Validate against the entire module: a page save cannot introduce cross-page ID collisions.
      courseSchema.parse({...owner.course,module:{...owner.course.module,pages:owner.course.module.pages.map(item=>item.id===page.id?page:item)}});
      const baseline=await db.select().from(pageRevisions).where(and(eq(pageRevisions.pageId,pageId),eq(pageRevisions.revision,1))).get();
      let sourceRevision=before.sourceRevision;
      let translationStatus=before.translationStatus;
      if(identity.sourcePageId) {
        const original=await currentPage(identity.sourcePageId);
        if(!original)throw new ContentError(409,'Source page is unavailable.');
        if(options.sourceRevision!==undefined&&options.sourceRevision!==original.revision)
          throw new ContentError(409,'English/source content changed during review or generation. Reload and compare again.');
        sourceRevision=options.sourceRevision??before.sourceRevision;
        translationStatus=options.translationStatus||'draft';
        if(translationStatus==='reviewed' && sourceRevision!==original.revision)
          throw new ContentError(409,'Compare against the latest source before marking this translation reviewed.');
      } else if(options.translationStatus)throw new ContentError(400,'Only editions have translation status.');
      try {
        await db.insert(pageRevisions).values({id:v7(),pageId,revision:expectedRevision+1,document:page,
          wordingReviewRequired:canonicalChanged(baseline!.document,page),createdAt:new Date().toISOString(),createdBy:actorUserId||null,
          sourceRevision,translationStatus,reviewNote:options.reviewNote??before.reviewNote});
      }catch(error){
        if((await currentPage(pageId))?.revision!==expectedRevision)throw new ContentError(409,'Another editor saved this page. Reload the latest draft before saving again.');
        throw error;
      }
      return {revision:expectedRevision+1,wordingReviewRequired:canonicalChanged(baseline!.document,page)};
    }
  };
}
