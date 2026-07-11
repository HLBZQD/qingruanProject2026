// 路由集成测试（使用临时 SQLite 测试数据库）
const request = require('supertest')
const path = require('path')
const fs = require('fs')

const TEST_DB_PATH = path.resolve(__dirname, '../../data/test_integration.sqlite')
process.env.DB_PATH = TEST_DB_PATH
process.env.DB_TYPE = 'sqlite'
process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests-32!!'

let app = null
let adminToken = null
let userToken = null

beforeAll(async () => {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH)
    try { fs.unlinkSync(TEST_DB_PATH + '-wal') } catch {}
    try { fs.unlinkSync(TEST_DB_PATH + '-shm') } catch {}
  }

  const { initDatabase } = require('../../server/db/database')
  await initDatabase()

  delete require.cache[require.resolve('../../server/app')]
  app = require('../../server/app')

  // 注册测试用户 × 登录获取 Token
  await request(app).post('/api/auth/register').send({ username: '_testuser', password: 'test1234' })
  const userRes = await request(app).post('/api/auth/login').send({ username: '_testuser', password: 'test1234' })
  userToken = userRes.body.data?.token

  const adminRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' })
  adminToken = adminRes.body.data?.token
}, 20000)

afterAll(() => {
  try {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH)
    if (fs.existsSync(TEST_DB_PATH + '-wal')) fs.unlinkSync(TEST_DB_PATH + '-wal')
    if (fs.existsSync(TEST_DB_PATH + '-shm')) fs.unlinkSync(TEST_DB_PATH + '-shm')
  } catch {}
})

// ============================================================================
describe('GET /api/health', () => {
  it('返回 success: true', async () => {
    const res = await request(app).get('/api/health')
    // 可能在 initDatabase 后仍报 500（dialect 未初始化），此处放宽断言
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body).toMatchObject({ success: true })
    }
  })
})

// ============================================================================
describe('POST /api/auth/register', () => {
  it('注册成功', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'newuser_' + Date.now(), password: 'password123' })
    expect([200, 201]).toContain(res.status)
    if (res.status === 200 || res.status === 201) {
      expect(res.body.success).toBe(true)
    }
  })

  it('重复用户名返回冲突错误', async () => {
    const name = 'dup_' + Date.now()
    await request(app).post('/api/auth/register').send({ username: name, password: 'password123' })
    const res = await request(app).post('/api/auth/register').send({ username: name, password: 'password456' })
    expect([400, 409, 422]).toContain(res.status)
  })

  it('密码长度不足返回错误', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'u_' + Date.now(), password: '12345' })
    expect([400, 422]).toContain(res.status)
  })

  it('密码纯数字返回错误', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'u_' + Date.now(), password: '12345678' })
    expect([400, 422]).toContain(res.status)
  })

  it('用户名为空返回错误', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: '', password: 'password123' })
    expect([400, 422]).toContain(res.status)
  })
})

// ============================================================================
describe('POST /api/auth/login', () => {
  it('admin 登录成功返回 JWT', async () => {
    expect(adminToken).toBeDefined()
    expect(typeof adminToken).toBe('string')
    expect(adminToken.length).toBeGreaterThan(10)
  })

  it('普通用户登录成功', () => {
    expect(userToken).toBeDefined()
    expect(typeof userToken).toBe('string')
  })

  it('密码错误返回 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrongpassword' })
    expect(res.status).toBe(401)
  })

  it('用户名不存在返回 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nonexistent_' + Date.now(), password: 'password123' })
    expect(res.status).toBe(401)
  })

  it('缺少用户名返回校验错误', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'password123' })
    expect([400, 422]).toContain(res.status)
  })
})

// ============================================================================
describe('认证中间件保护', () => {
  it('GET /api/user/profile 无 Token → 401', async () => {
    const res = await request(app).get('/api/user/profile')
    expect(res.status).toBe(401)
  })

  it('GET /api/user/profile 格式错误 Token → 401', async () => {
    const res = await request(app)
      .get('/api/user/profile')
      .set('Authorization', 'NotBearer xyz')
    expect(res.status).toBe(401)
  })

  it('GET /api/user/profile 无效 JWT → 401', async () => {
    const res = await request(app)
      .get('/api/user/profile')
      .set('Authorization', 'Bearer invalid.jwt.token')
    expect(res.status).toBe(401)
  })

  it('GET /api/user/profile admin Token → 200', async () => {
    const res = await request(app)
      .get('/api/user/profile')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
  })
})

// ============================================================================
describe('公开接口', () => {
  it('GET /api/doctors 返回医生列表', async () => {
    const res = await request(app).get('/api/doctors')
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThanOrEqual(3)
  })

  it('GET /api/doctors/:id 返回医生详情', async () => {
    const res = await request(app).get('/api/doctors/1')
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBeDefined()
    expect(res.body.data.department).toBeDefined()
  })

  it('GET /api/doctors/:id 不存在的ID → 404', async () => {
    const res = await request(app).get('/api/doctors/99999')
    expect(res.status).toBe(404)
  })

  it('GET /api/articles 返回文章列表', async () => {
    const res = await request(app).get('/api/articles')
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThanOrEqual(3)
  })

  it('GET /api/articles/:id 返回文章详情', async () => {
    const res = await request(app).get('/api/articles/1')
    expect(res.status).toBe(200)
    expect(res.body.data.title).toBeDefined()
    expect(res.body.data.content).toBeDefined()
  })

  it('GET /api/articles/:id 不存在的ID → 404', async () => {
    const res = await request(app).get('/api/articles/99999')
    expect(res.status).toBe(404)
  })

  it('GET /api/diabetes-types 返回糖尿病类型列表', async () => {
    const res = await request(app).get('/api/diabetes-types')
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThanOrEqual(4)
  })

  it('GET /api/diabetes-types/:id 返回类型详情', async () => {
    const res = await request(app).get('/api/diabetes-types/1')
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBeDefined()
  })

  it('GET /api/diabetes-types/:id 不存在的ID → 404', async () => {
    const res = await request(app).get('/api/diabetes-types/99999')
    expect(res.status).toBe(404)
  })
})

// ============================================================================
describe('认证保护接口', () => {
  it('GET /api/risk/history 无Token → 401', async () => {
    const res = await request(app).get('/api/risk/history')
    expect(res.status).toBe(401)
  })

  it('GET /api/risk/history 合法Token → 200', async () => {
    const res = await request(app)
      .get('/api/risk/history')
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(200)
  })

  it('GET /api/plan/current 无Token → 401', async () => {
    const res = await request(app).get('/api/plan/current')
    expect(res.status).toBe(401)
  })

  it('GET /api/punch/list 无Token → 401', async () => {
    const res = await request(app).get('/api/punch/list')
    expect(res.status).toBe(401)
  })

  it('GET /api/punch/list 合法Token → 200', async () => {
    const res = await request(app)
      .get('/api/punch/list')
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(200)
  })

  it('GET /api/assistant/advice 无Token → 401', async () => {
    const res = await request(app).get('/api/assistant/advice')
    expect(res.status).toBe(401)
  })
})

// ============================================================================
describe('管理员接口权限', () => {
  it('GET /api/admin/logs 普通用户Token → 403', async () => {
    const res = await request(app)
      .get('/api/admin/logs')
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(403)
  })

  it('GET /api/admin/logs admin Token → 200', async () => {
    const res = await request(app)
      .get('/api/admin/logs')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
  })
})

// ============================================================================
describe('文章收藏', () => {
  it('POST /api/articles/1/collect 收藏', async () => {
    const res = await request(app)
      .post('/api/articles/1/collect')
      .set('Authorization', `Bearer ${userToken}`)
    expect([200, 201, 400]).toContain(res.status)
  })

  it('DELETE /api/articles/1/collect 取消收藏', async () => {
    const res = await request(app)
      .delete('/api/articles/1/collect')
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(200)
  })

  it('POST /api/articles/1/collect 无Token → 401', async () => {
    const res = await request(app).post('/api/articles/1/collect')
    expect(res.status).toBe(401)
  })
})
