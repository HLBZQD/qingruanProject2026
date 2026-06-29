import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    // 全局 jsdom 环境：Vue 组件挂载需要 DOM，后端 Node 代码不受影响
    environment: 'jsdom',
    globals: true,
    include: [
      'test/frontend/**/*.spec.ts',
      'test/backend/**/*.spec.js',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,vue}', 'server/**/*.js'],
      exclude: ['**/*.d.ts', 'server/db/*.sql'],
    },
  },
})
