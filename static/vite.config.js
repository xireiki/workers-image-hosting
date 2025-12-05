import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // 复制 Service Worker 到 dist 目录
    {
      name: 'copy-sw',
      closeBundle() {
        const swSrc = path.resolve(__dirname, 'public/sw.js');
        const swDest = path.resolve(__dirname, 'dist/sw.js');
        const distDir = path.resolve(__dirname, 'dist');
        
        if (!existsSync(distDir)) {
          mkdirSync(distDir, { recursive: true });
        }
        
        if (existsSync(swSrc)) {
          copyFileSync(swSrc, swDest);
          console.log('Service Worker copied to dist/sw.js');
        }
      }
    }
  ],
  build: {
    rollupOptions: {
        input: {
            index: path.resolve(__dirname, 'index.html'),
            list: path.resolve(__dirname, 'list.html'),
        },
    },
}
})
