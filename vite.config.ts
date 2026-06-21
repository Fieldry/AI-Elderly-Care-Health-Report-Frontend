import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const proxyTarget = process.env.VITE_DEV_PROXY_TARGET || 'http://82.156.24.217:8080'
const apiProxy = {
  target: proxyTarget,
  changeOrigin: true,
  bypass(req: { headers: { accept?: string }, url?: string }) {
    if (req.headers.accept?.includes('text/html')) {
      return req.url || '/'
    }

    return undefined
  }
}

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
      '/api': apiProxy,
      '/auth': apiProxy,
      '/chat': apiProxy,
      '/counseling': apiProxy,
      '/family': apiProxy,
      '/report': apiProxy,
      '/elderly/me': apiProxy,
      '/doctor/elderly-list': apiProxy,
      '/doctor/elderly': apiProxy,
      '/ws': {
        target: proxyTarget,
        changeOrigin: true,
        ws: true
      },
      '/tts': { 
        target: proxyTarget,
        changeOrigin: true 
      } 
    }
  }
})
