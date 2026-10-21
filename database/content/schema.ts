import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { CoursePage, PublishedCourse } from '@novoapps/content-model';

export const courses = sqliteTable('cms_courses', {
  id: text('id').primaryKey(),
  canonicalId: text('canonical_id').notNull(),
  locale: text('locale').notNull(),
  metadata: text('metadata_json', { mode: 'json' }).$type<Omit<PublishedCourse, 'module'>>().notNull()
}, table => [uniqueIndex('cms_course_locale').on(table.canonicalId, table.locale)]);
export const modules = sqliteTable('cms_modules', {
  id: text('id').primaryKey(),
  courseId: text('course_id').notNull().references(() => courses.id),
  canonicalId: text('canonical_id').notNull(),
  metadata: text('metadata_json', { mode: 'json' }).$type<Omit<PublishedCourse['module'], 'pages'>>().notNull(),
  sourceDocument: text('source_document_json', { mode: 'json' }).$type<PublishedCourse>().notNull(),
  sourceHash: text('source_hash').notNull()
}, table => [uniqueIndex('cms_module_identity').on(table.courseId, table.canonicalId)]);
export const pages = sqliteTable('cms_pages', {
  id: text('id').primaryKey(),
  moduleId: text('module_id').notNull().references(() => modules.id),
  canonicalId: text('canonical_id').notNull(),
  position: integer('position').notNull()
}, table => [uniqueIndex('cms_page_identity').on(table.moduleId, table.canonicalId),
  uniqueIndex('cms_page_position').on(table.moduleId, table.position)]);
// Each page is a versioned authoring aggregate. Its stable block IDs survive revisions.
// Revision 1 and the source document are immutable; no UPDATE/DELETE routes are exposed.
export const pageRevisions = sqliteTable('cms_page_revisions', {
  id: text('id').primaryKey(),
  pageId: text('page_id').notNull().references(() => pages.id),
  revision: integer('revision').notNull(),
  document: text('document_json', { mode: 'json' }).$type<CoursePage>().notNull(),
  wordingReviewRequired: integer('wording_review_required', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull()
}, table => [uniqueIndex('cms_page_revision').on(table.pageId, table.revision)]);
