import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5000,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5050',
        changeOrigin: true,
        secure: false,
        ws: true,
        // 禁止对 SSE 流式响应进行 gzip 压缩
        // gzip 会导致浏览器缓冲整个响应，无法流式读取
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            const contentType = proxyRes.headers['content-type'] || '';
            if (contentType.includes('text/event-stream')) {
              delete proxyRes.headers['content-encoding'];
              delete proxyRes.headers['content-length'];
            }
          });
        },
      },
      '/uploads': {
        target: 'http://127.0.0.1:5050',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules/iztro')) return 'iztro'
          if (id.includes('node_modules/lunar-javascript')) return 'lunar'
          if (id.includes('node_modules/@mediapipe/tasks-vision')) return 'mediapipe'
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'react-vendor'
          if (id.includes('node_modules/react-markdown') || id.includes('node_modules/remark-gfm')) return 'markdown'
        },
      },
    },
  },
})