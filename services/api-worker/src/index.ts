import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { courseSchema, savePageSchema } from '@novoapps/content-model';
import { ContentError, contentRepository } from './repository';
type Bindings = { CONTENT_DB: D1Database; LOCAL_AUTHORING?: string; CMS_ORIGIN?: string };
export const app = new Hono<{ Bindings: Bindings }>();
app.onError((error, c) => {
  if (error instanceof ContentError) return c.json({ error: error.message }, error.status);
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  console.error('CMS request failed', { route: c.req.path });
  return c.json({ error: 'The CMS could not complete this request.' }, 500);
});
app.use('*', async (c, next) => {
  // Temporary local pilot only. Deploying the unconfigured Worker cannot expose authoring.
  const host = new URL(c.req.url).hostname;
  if (c.env.LOCAL_AUTHORING !== 'true' || !['127.0.0.1', 'localhost'].includes(host))
    return c.json({ error: 'Local authoring only. Authenticated deployment is not configured.' }, 403);
  const origin = c.req.header('Origin');
  if (origin && origin !== c.env.CMS_ORIGIN) return c.json({ error: 'Origin not allowed' }, 403);
  c.header('Cache-Control', 'no-store');
  if (origin) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
  }
  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type');
    return c.body(null, 204);
  }
  await next();
});
async function jsonBody(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 1000000) throw new HTTPException(413, { message: 'Course input is too large' });
  try { return JSON.parse(raw); } catch { throw new HTTPException(400, { message: 'Invalid JSON' }); }
}
app.get('/health', c => c.json({ status: 'ok', mode: 'local-authoring' }));
app.get('/api/v1/cms/modules', async c => c.json(await contentRepository(c.env.CONTENT_DB).listModules()));
app.post('/api/v1/cms/import', async c => {
  const parsed = courseSchema.safeParse(await jsonBody(c.req.raw));
  if (!parsed.success) return c.json({ error: 'Invalid course', issues: parsed.error.issues.map(issue => issue.message) }, 400);
  return c.json(await contentRepository(c.env.CONTENT_DB).importCourse(parsed.data), 201);
});
app.get('/api/v1/cms/modules/:id', async c => c.json(await contentRepository(c.env.CONTENT_DB).getModule(c.req.param('id'))));
app.put('/api/v1/cms/pages/:id/draft', async c => {
  const parsed = savePageSchema.safeParse(await jsonBody(c.req.raw));
  if (!parsed.success) return c.json({ error: 'Invalid page', issues: parsed.error.issues.map(issue => issue.message) }, 400);
  const body = parsed.data;
  return c.json(await contentRepository(c.env.CONTENT_DB).savePage(c.req.param('id'), body.expectedRevision, body.page, body.allowWordingChanges));
});
app.get('/api/v1/cms/modules/:id/export', async c => {
  const draft = await contentRepository(c.env.CONTENT_DB).getModule(c.req.param('id'));
  c.header('Content-Disposition', 'attachment; filename="' + draft.course.module.id + '.draft.json"');
  return c.json(draft.course);
});
export default app;
