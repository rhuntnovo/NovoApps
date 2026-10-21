import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { v7 } from 'uuid';
import { courses, modules, pages, pageRevisions } from '../../../database/content/schema';
import { courseSchema, wordingChanged, sameBlockIds, type PublishedCourse, type CoursePage, type ModuleDraft } from '@novoapps/content-model';

export class ContentError extends Error {
  constructor(public status: 400 | 404 | 409, message: string) { super(message); }
}
export function contentRepository(binding: D1Database) {
  const db = drizzle(binding);
  const latest = db.select({ pageId: pageRevisions.pageId, revision: sql<number>`max(${pageRevisions.revision})`.as('latest_revision') })
    .from(pageRevisions).groupBy(pageRevisions.pageId).as('latest');
  const currentPages = (moduleId: string) => db.select({
    id: pages.id, canonicalId: pages.canonicalId, revision: pageRevisions.revision,
    wordingReviewRequired: pageRevisions.wordingReviewRequired, document: pageRevisions.document
  }).from(pages).innerJoin(latest, eq(latest.pageId, pages.id))
    .innerJoin(pageRevisions, and(eq(pageRevisions.pageId, pages.id), eq(pageRevisions.revision, latest.revision)))
    .where(eq(pages.moduleId, moduleId)).orderBy(asc(pages.position));
  return {
    async listModules() {
      return db.select({ id: modules.id, canonicalId: modules.canonicalId, locale: courses.locale, course: courses.metadata, module: modules.metadata })
        .from(modules).innerJoin(courses, eq(courses.id, modules.courseId)).orderBy(asc(courses.canonicalId));
    },
    async importCourse(course: PublishedCourse) {
      const locale = course.language + '-' + course.country.toLowerCase();
      const existingCourse = await db.select().from(courses).where(and(eq(courses.canonicalId, course.course_id), eq(courses.locale, locale))).get();
      const courseId = existingCourse?.id || v7();
      if (existingCourse && await db.select().from(modules).where(and(eq(modules.courseId, courseId), eq(modules.canonicalId, course.module.id))).get())
        throw new ContentError(409, 'This module/locale is already imported. Existing drafts were not overwritten.');
      const { module, ...metadata } = course;
      const { pages: sourcePages, ...moduleMetadata } = module;
      if (existingCourse && JSON.stringify(existingCourse.metadata) !== JSON.stringify(metadata))
        throw new ContentError(409, 'Course metadata differs from the existing locale. Import requires review.');
      const moduleId = v7();
      const pageRows = sourcePages.map((page, position) => ({ id: v7(), moduleId, canonicalId: page.id, position }));
      const createdAt = new Date().toISOString();
      const revisionRows = pageRows.map((page, index) => ({
        id: v7(), pageId: page.id, revision: 1, document: sourcePages[index], wordingReviewRequired: false, createdAt
      }));
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(course)));
      const sourceHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      const revisionChunks = [];
      for (let index = 0; index < revisionRows.length; index += 10) revisionChunks.push(revisionRows.slice(index, index + 10));
      await db.batch([
        db.insert(courses).values({ id: courseId, canonicalId: course.course_id, locale, metadata }).onConflictDoNothing(),
        db.insert(modules).values({ id: moduleId, courseId, canonicalId: module.id, metadata: moduleMetadata, sourceDocument: course, sourceHash }),
        db.insert(pages).values(pageRows),
        ...revisionChunks.map(chunk => db.insert(pageRevisions).values(chunk))
      ]);
      return { moduleId, sourceHash };
    },
    async getModule(moduleId: string): Promise<ModuleDraft> {
      const row = await db.select({ module: modules, course: courses }).from(modules)
        .innerJoin(courses, eq(courses.id, modules.courseId)).where(eq(modules.id, moduleId)).get();
      if (!row) throw new ContentError(404, 'Module not found');
      const savedPages = await currentPages(moduleId);
      const course = courseSchema.parse({ ...row.course.metadata, module: { ...row.module.metadata, pages: savedPages.map(page => page.document) } });
      return { id: moduleId, course, pages: savedPages.map(({ document: _document, ...summary }) => summary) };
    },
    async savePage(pageId: string, expectedRevision: number, page: CoursePage, allowWordingChanges: boolean) {
      const identity = await db.select().from(pages).where(eq(pages.id, pageId)).get();
      if (!identity) throw new ContentError(404, 'Page not found');
      const before = await db.select().from(pageRevisions).where(eq(pageRevisions.pageId, pageId)).orderBy(desc(pageRevisions.revision)).limit(1).get();
      if (!before || before.revision !== expectedRevision) throw new ContentError(409, 'Another editor saved this page. Reload the latest draft before saving again.');
      if (page.id !== identity.canonicalId || !sameBlockIds(before.document, page))

        throw new ContentError(400, 'Published page/block IDs must be preserved. Adding/removing blocks is a later workflow.');
      if (wordingChanged(before.document, page) && !allowWordingChanges)
        throw new ContentError(400, 'Unlock draft wording changes explicitly before editing canonical text.');
      const baseline = await db.select().from(pageRevisions).where(and(eq(pageRevisions.pageId, pageId), eq(pageRevisions.revision, 1))).get();
      const review = wordingChanged(baseline!.document, page);
      try {
        // The unique (page_id, revision) constraint is the atomic concurrency check.
        // Concurrent saves from the same version cannot both succeed.
        await db.insert(pageRevisions).values({
          id: v7(), pageId, revision: expectedRevision + 1, document: page,
          wordingReviewRequired: review, createdAt: new Date().toISOString()
        });
      } catch {
        const latestRow = await db.select().from(pageRevisions).where(eq(pageRevisions.pageId, pageId)).orderBy(desc(pageRevisions.revision)).limit(1).get();
        if (latestRow && latestRow.revision !== expectedRevision) throw new ContentError(409, 'Another editor saved this page. Reload the latest draft before saving again.');
        throw new Error('Could not save the draft');
      }
      return { revision: expectedRevision + 1, wordingReviewRequired: review };
    }
  };
}
