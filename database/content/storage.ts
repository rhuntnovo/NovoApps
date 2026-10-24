import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
import {modules} from './schema';
export const mediaAssets=sqliteTable('cms_media_assets',{
 id:text('id').primaryKey(),moduleId:text('module_id').notNull().references(()=>modules.id),
 providerId:text('provider_id').notNull(),courseId:text('course_id').notNull(),locale:text('locale').notNull(),
 pageId:text('page_id').notNull(),blockId:text('block_id').notNull(),path:text('path').notNull().unique(),
 storageKey:text('storage_key').notNull().unique(),contentType:text('content_type').notNull(),
 bytes:integer('bytes').notNull(),sha256:text('sha256').notNull(),source:text('source').notNull(),
 createdBy:text('created_by').notNull(),createdAt:integer('created_at').notNull()
},t=>[index('cms_media_module').on(t.moduleId)]);
export const publications=sqliteTable('cms_publications',{
 id:text('id').primaryKey(),moduleId:text('module_id').notNull().references(()=>modules.id),
 status:text('status',{enum:['preparing','published','failed']}).notNull(),
 snapshot:text('snapshot_json').notNull(),createdBy:text('created_by').notNull(),
 createdAt:integer('created_at').notNull(),completedAt:integer('completed_at'),
 pointerKey:text('pointer_key').notNull(),error:text('error')
},t=>[index('cms_publication_module').on(t.moduleId,t.createdAt)]);
export const publicationLeases=sqliteTable('cms_publication_leases',{
 moduleId:text('module_id').primaryKey().references(()=>modules.id),
 releaseId:text('release_id').notNull(),expiresAt:integer('expires_at').notNull()
});
