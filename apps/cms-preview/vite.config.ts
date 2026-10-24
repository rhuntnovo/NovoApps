import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { cp, readFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const project = fileURLToPath(new URL('.', import.meta.url));
const repository = resolve(project, '../..');
const learnerPublic = resolve(repository, 'newvines-learning/public');
const mime: Record<string,string> = { '.webp':'image/webp','.png':'image/png','.opus':'audio/ogg' };
function existingMedia(): Plugin {
  return {
    name: 'existing-learner-media',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        let path: string;
        try { path = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname); }
        catch { response.statusCode = 400; response.end(); return; }
        if (!['/assets/', '/audio/', '/icons/'].some(prefix => path.startsWith(prefix))) return next();
        const target = resolve(learnerPublic, '.' + path);
        if (!target.startsWith(learnerPublic + sep)) { response.statusCode=403; response.end(); return; }
        try { const bytes=await readFile(target); response.setHeader('Content-Type',mime[extname(target)] || 'application/octet-stream'); response.end(bytes); }
        catch { next(); }
      });
    },
    async closeBundle() {
      for (const folder of ['assets','audio','icons']) {
        await mkdir(resolve(project,'dist',folder), {recursive:true});
        await cp(resolve(learnerPublic,folder),resolve(project,'dist',folder),{recursive:true});
      }
    }
  };
}
export default defineConfig({
  preview:{headers:{'X-Robots-Tag':'noindex, nofollow, nosnippet, noimageindex'}},
  plugins: [preact(), existingMedia()], publicDir: 'public',
  resolve: { dedupe: ['preact'] },
  server: { headers:{'X-Robots-Tag':'noindex, nofollow, nosnippet, noimageindex'}, proxy:{'/assets/cms/':(process.env.CMS_AUTH_MODE==='true'?(process.env.CMS_API_TARGET||'http://127.0.0.1:8787'):(process.env.CMS_MEDIA_TARGET||'http://127.0.0.1:8789')),'/audio/cms/':(process.env.CMS_AUTH_MODE==='true'?(process.env.CMS_API_TARGET||'http://127.0.0.1:8787'):(process.env.CMS_MEDIA_TARGET||'http://127.0.0.1:8789'))}, host:'127.0.0.1', port:5175, strictPort:true, fs:{allow:[repository]} }
});
