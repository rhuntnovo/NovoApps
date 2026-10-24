import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{host:'127.0.0.1',port:5176,strictPort:true,
 headers:{'X-Robots-Tag':'noindex, nofollow, nosnippet, noimageindex'},proxy:{'/api':process.env.CMS_API_TARGET||'http://127.0.0.1:8787'}},
 preview:{headers:{'X-Robots-Tag':'noindex, nofollow, nosnippet, noimageindex'}}});
