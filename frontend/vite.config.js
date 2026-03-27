import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:3847',
        ws: true
      },
      '/api': {
        target: 'http://localhost:3847'
      }
    }
  }
})
