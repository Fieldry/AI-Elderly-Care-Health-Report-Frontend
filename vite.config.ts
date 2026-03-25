import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const proxyTarget = process.env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8001'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true
      },
      '/auth': {
        target: proxyTarget,
        changeOrigin: true
      },
      '/chat': {
        target: proxyTarget,
        changeOrigin: true
      },
      '/counseling': {
        target: proxyTarget,
        changeOrigin: true
      },
      '/family': {
        target: proxyTarget,
        changeOrigin: true
      },
      '/report': {
        target: proxyTarget,
        changeOrigin: true
      },
      '/elderly/me': {
        target: proxyTarget,
        changeOrigin: true
      },
      '/doctor/elderly-list': {
        target: proxyTarget,
        changeOrigin: true
      },
      '/doctor/elderly': {
        target: proxyTarget,
        changeOrigin: true
      },
      '/ws': {
        target: proxyTarget,
        changeOrigin: true,
        ws: true
      }
    }
  }
})
