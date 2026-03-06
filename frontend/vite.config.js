import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5200,
    open: true,
    allowedHosts: true,
    hmr: {
      overlay: false  // 禁用错误覆盖层，避免URI malformed错误
    },
    fs: {
      strict: false,  // 允许访问工作区外的文件
      allow: ['..']   // 允许访问上级目录
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8088',
        changeOrigin: true,
        secure: false
      },
      '/uploads': {
        target: 'http://localhost:8088',
        changeOrigin: true,
        secure: false
      }
    }
  },
  base: './',  // 使用相对路径，避免路径编码问题
  build: {
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
