import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'sqlite',
  schema: '../../database/content/schema.ts',
  out: '../../database/content/migrations'
});
