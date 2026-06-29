// Vitest globals（describe/it/expect/beforeAll）已通过 vitest.config.ts 的 globals:true 注入，
// 后端 .js 文件无需、也不能 require('vitest')。
const request = require('supertest')
const app = require('../../server/app')

// 说明：本组测试只验证无需数据库的端点。
// /api/health 不读取 db，故可在不初始化 SQLite 的情况下通过。
// 涉及 db 的路由（auth/user/...）需要先 initDatabase()，建议另起
// 专用集成测试文件并指向临时数据库（process.env.DB_PATH）。

describe('GET /api/health', () => {
  it('返回 success: true', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ success: true })
    expect(res.body.message).toBe('服务运行正常')
  })
})

describe('未知路由 404', () => {
  it('未注册的 /api 路径返回 NOT_FOUND', async () => {
    const res = await request(app).get('/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})
