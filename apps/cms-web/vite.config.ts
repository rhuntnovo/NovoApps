import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  preview:{headers:{'X-Robots-Tag':'noindex, nofollow, nosnippet, noimageindex'}},
  plugins: [react()],
  server: { headers:{'X-Robots-Tag':'noindex, nofollow, nosnippet, noimageindex'},
    host: '127.0.0.1', port: 5174, strictPort: true,
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
    proxy: { '/assets/cms/':process.env.CMS_MEDIA_TARGET||'http://127.0.0.1:8789','/audio/cms/':process.env.CMS_MEDIA_TARGET||'http://127.0.0.1:8789', '/assets/':process.env.CMS_PREVIEW_TARGET||'http://127.0.0.1:5175','/audio/':process.env.CMS_PREVIEW_TARGET||'http://127.0.0.1:5175', '/api': process.env.CMS_API_TARGET || 'http://127.0.0.1:8787' }
  }
});
