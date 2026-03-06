import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3100,
    host: '0.0.0.0',
    open: true,
    proxy: {
      '/api/admin': {
        target: 'http://localhost:8088',
        changeOrigin: true
      },
      '/api': {
        target: 'http://localhost:8088',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:8088',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('element-plus')) {
              return 'element-plus'
            }
            if (id.includes('@element-plus/icons-vue')) {
              return 'element-plus-icons'
            }
            return 'vendor'
          }
        }
      }
    }
  }
})
