import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { CoursePage, PublishedCourse, ModuleHeadings } from '@novoapps/content-model';

export const providers = sqliteTable('cms_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  defaultLocale: text('default_locale').notNull().default('en-global'),
  createdAt: text('created_at').notNull()
}, table => [uniqueIndex('cms_provider_slug').on(table.slug)]);
export const courses = sqliteTable('cms_courses', {
  id: text('id').primaryKey(),
  canonicalId: text('canonical_id').notNull(),
  locale: text('locale').notNull(),
  metadata: text('metadata_json', { mode: 'json' }).$type<Omit<PublishedCourse, 'module'>>().notNull(),
  // Nullable only to permit an additive migration; migration backfills all existing courses.
  providerId: text('provider_id').references(() => providers.id),
  sourceCourseId: text('source_course_id').references((): AnySQLiteColumn => courses.id)
}, table => [uniqueIndex('cms_course_provider_locale').on(table.providerId, table.canonicalId, table.locale)]);
export const modules = sqliteTable('cms_modules', {
  id: text('id').primaryKey(),
  courseId: text('course_id').notNull().references(() => courses.id),
  canonicalId: text('canonical_id').notNull(),
  metadata: text('metadata_json', { mode: 'json' }).$type<Omit<PublishedCourse['module'], 'pages'>>().notNull(),
  sourceDocument: text('source_document_json', { mode: 'json' }).$type<PublishedCourse>().notNull(),
  sourceHash: text('source_hash').notNull(),
  sourceModuleId: text('source_module_id').references((): AnySQLiteColumn => modules.id),
  headings: text('headings_json', { mode: 'json' }).$type<ModuleHeadings>(),
  metadataRevision: integer('metadata_revision').notNull().default(1)
}, table => [uniqueIndex('cms_module_identity').on(table.courseId, table.canonicalId),
  uniqueIndex('cms_module_edition').on(table.sourceModuleId, table.courseId),
  uniqueIndex('cms_module_number').on(table.courseId, sql`json_extract(${table.metadata}, '$.number')`)]);
export const pages = sqliteTable('cms_pages', {
  id: text('id').primaryKey(),
  moduleId: text('module_id').notNull().references(() => modules.id),
  canonicalId: text('canonical_id').notNull(),
  position: integer('position').notNull(),
  sourcePageId: text('source_page_id').references((): AnySQLiteColumn => pages.id)
}, table => [uniqueIndex('cms_page_identity').on(table.moduleId, table.canonicalId),
  uniqueIndex('cms_page_position').on(table.moduleId, table.position)]);
export const pageRevisions = sqliteTable('cms_page_revisions', {
  id: text('id').primaryKey(),
  pageId: text('page_id').notNull().references(() => pages.id),
  revision: integer('revision').notNull(),
  document: text('document_json', { mode: 'json' }).$type<CoursePage>().notNull(),
  wordingReviewRequired: integer('wording_review_required', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  sourceRevision: integer('source_revision'),
  translationStatus: text('translation_status', {enum:['untranslated','draft','reviewed']}),
  reviewNote: text('review_note').notNull().default('')
}, table => [uniqueIndex('cms_page_revision').on(table.pageId, table.revision)]);
