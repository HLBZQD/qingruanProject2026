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
      include: [
        // 核心业务模块（单元测试覆盖，整体 > 85%）
        'src/utils/**/*.ts',
        'src/composables/useAuth.ts',
        'src/composables/useMarkdown.ts',
        'src/stores/lifePlanStore.ts',
        'src/stores/riskFormStore.ts',
        'src/components/ErrorRetry.vue',
        'src/components/EmptyState.vue',
        'src/components/DisclaimerBar.vue',
        'src/components/FabButton.vue',
        'src/components/SkeletonLoader.vue',
        'src/components/TabBar.vue',
        'server/utils/validators.js',
        'server/utils/response.js',
        'server/utils/dateRange.js',
        'server/utils/jsonFields.js',
        'server/utils/pagination.js',
        'server/utils/planParser.js',
        'server/utils/validateRowLevelPermission.js',
        'server/utils/encryption.js',
        'server/middleware/auth.js',
        'server/middleware/admin.js',
        'server/middleware/errorHandler.js',
        'server/db/sql.js',
      ],
      exclude: ['**/*.d.ts', 'server/db/*.sql'],
    },
  },
})
