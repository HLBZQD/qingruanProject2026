const request = require('supertest')
const path = require('path')
const fs = require('fs')

// 使用临时测试数据库，确保 initDatabase() 已完成
const TEST_DB_PATH = path.resolve(__dirname, '../../data/test_health.sqlite')
process.env.DB_PATH = TEST_DB_PATH
process.env.DB_TYPE = 'sqlite'
process.env.JWT_SECRET = 'test-health-secret-32chars-here!!'

let app = null

beforeAll(async () => {
  // 清理旧测试数据库
  try { if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH) } catch {}
  try { if (fs.existsSync(TEST_DB_PATH + '-wal')) fs.unlinkSync(TEST_DB_PATH + '-wal') } catch {}
  try { if (fs.existsSync(TEST_DB_PATH + '-shm')) fs.unlinkSync(TEST_DB_PATH + '-shm') } catch {}

  // 先初始化数据库
  const { initDatabase } = require('../../server/db/database')
  await initDatabase()

  // 然后再加载 app
  delete require.cache[require.resolve('../../server/app')]
  app = require('../../server/app')
}, 15000)

afterAll(() => {
  try { if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH) } catch {}
  try { if (fs.existsSync(TEST_DB_PATH + '-wal')) fs.unlinkSync(TEST_DB_PATH + '-wal') } catch {}
  try { if (fs.existsSync(TEST_DB_PATH + '-shm')) fs.unlinkSync(TEST_DB_PATH + '-shm') } catch {}
})

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
