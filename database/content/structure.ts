import {sqliteTable,text,integer,uniqueIndex} from 'drizzle-orm/sqlite-core';
import {modules} from './schema';
export const moduleStructures=sqliteTable('cms_module_structures',{
 id:text('id').primaryKey(),moduleId:text('module_id').notNull().references(()=>modules.id),
 revision:integer('revision').notNull(),pageIds:text('page_ids_json',{mode:'json'}).$type<string[]>().notNull(),
 createdAt:text('created_at').notNull()
},table=>[uniqueIndex('cms_structure_revision').on(table.moduleId,table.revision)]);
