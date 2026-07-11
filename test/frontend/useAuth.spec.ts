import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseToken, isTokenExpired, getTokenRemainingTime } from '@/composables/useAuth'

// ---------------------------------------------------------------
// 辅助：构造 JWT token
// ---------------------------------------------------------------

/**
 * 将字符串转为 base64Url（支持 Unicode）。
 * btoa 不直接支持非 Latin-1 字符，需先 encodeURIComponent 转义。
 */
function toBase64Url(str: string): string {
  const utf8Bytes = new TextEncoder().encode(str)
  let binary = ''
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * 构造一个伪 JWT token（不校验签名，仅 Payload 部分可解析）。
 * @param payload - Payload 对象
 * @returns base64Url 编码的三段 token 字符串
 */
function makeToken(payload: Record<string, unknown>): string {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = toBase64Url(JSON.stringify(payload))
  const sig = toBase64Url('fake-signature')
  return `${header}.${body}.${sig}`
}

// ---------------------------------------------------------------
// parseToken
// ---------------------------------------------------------------

describe('parseToken', () => {
  it('正确解析标准 JWT Payload', () => {
    const token = makeToken({ sub: 'user-1', username: 'alice', role: 'user', id: 1, exp: 2000000000, iat: 1700000000 })
    const payload = parseToken(token)
    expect(payload).not.toBeNull()
    expect(payload!.sub).toBe('user-1')
    expect(payload!.username).toBe('alice')
    expect(payload!.role).toBe('user')
    expect(payload!.id).toBe(1)
  })

  it('正确解析含特殊字符的 Payload（email/特殊符号）', () => {
    const token = makeToken({ sub: 'user-2', email: 'test@example.com', role: 'admin' })
    const payload = parseToken(token)
    expect(payload).not.toBeNull()
    expect(payload!.email).toBe('test@example.com')
    expect(payload!.role).toBe('admin')
  })

  it('解析含额外自定义字段的 Payload', () => {
    const token = makeToken({ sub: 'user-3', custom_field: 'custom_value', nested: { key: 'val' } })
    const payload = parseToken(token)
    expect(payload).not.toBeNull()
    expect(payload!.custom_field).toBe('custom_value')
  })

  it('空字符串返回 null', () => {
    expect(parseToken('')).toBeNull()
  })

  it('null 输入返回 null', () => {
    // @ts-expect-error 测试非法输入
    expect(parseToken(null)).toBeNull()
  })

  it('undefined 输入返回 null', () => {
    // @ts-expect-error 测试非法输入
    expect(parseToken(undefined)).toBeNull()
  })

  it('非字符串类型返回 null', () => {
    // @ts-expect-error 测试非法输入
    expect(parseToken(12345)).toBeNull()
  })

  it('格式非法 — 仅有一段（缺少 . 分隔符）', () => {
    const token = 'just-one-part'
    expect(parseToken(token)).toBeNull()
  })

  it('格式非法 — 两段（缺少签名段）', () => {
    const token = 'header.payload'
    expect(parseToken(token)).toBeNull()
  })

  it('格式非法 — 超过三段', () => {
    const token = 'a.b.c.d'
    expect(parseToken(token)).toBeNull()
  })

  it('Payload 不是有效 JSON 时返回 null', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256' })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const body = btoa('not-valid-json!!!').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const sig = btoa('sig').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(parseToken(`${header}.${body}.${sig}`)).toBeNull()
  })

  it('Payload 为 base64 编码的数字（非对象 JSON）时返回数字', () => {
    // atob('NDI=') = '42' — JSON.parse('42') = 42，但返回类型会经过 as JwtPayload
    const header = btoa(JSON.stringify({})).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const body = btoa('42').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const sig = btoa('sig').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    // 即使 JSON.parse 成功，返回的是 number，不是 null
    const result = parseToken(`${header}.${body}.${sig}`)
    // 返回了数字 42（JSON.parse('42') 的结果），函数本身不验证是否为对象
    expect(result).toBe(42)
  })
})

// ---------------------------------------------------------------
// isTokenExpired
// ---------------------------------------------------------------

describe('isTokenExpired', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('已过期的 token 返回 true', () => {
    // exp 在过去（1000 秒前）
    const pastExp = Math.floor(Date.now() / 1000) - 1000
    const token = makeToken({ sub: 'user-1', exp: pastExp })
    expect(isTokenExpired(token)).toBe(true)
  })

  it('未过期的 token 返回 false', () => {
    // exp 在未来（3600 秒后）
    const futureExp = Math.floor(Date.now() / 1000) + 3600
    const token = makeToken({ sub: 'user-1', exp: futureExp })
    expect(isTokenExpired(token)).toBe(false)
  })

  it('刚好到期的 token 返回 true（>= 判断）', () => {
    const nowExp = Math.floor(Date.now() / 1000)
    const token = makeToken({ sub: 'user-1', exp: nowExp })
    expect(isTokenExpired(token)).toBe(true)
  })

  it('无 exp 字段的 token 视为过期', () => {
    const token = makeToken({ sub: 'user-1', username: 'alice' })
    expect(isTokenExpired(token)).toBe(true)
  })

  it('非法 token 返回 true', () => {
    expect(isTokenExpired('invalid-token')).toBe(true)
  })

  it('空字符串返回 true', () => {
    expect(isTokenExpired('')).toBe(true)
  })
})

// ---------------------------------------------------------------
// getTokenRemainingTime
// ---------------------------------------------------------------

describe('getTokenRemainingTime', () => {
  it('未过期的 token 返回正数秒数', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600
    const token = makeToken({ sub: 'user-1', exp: futureExp })
    const remaining = getTokenRemainingTime(token)
    expect(remaining).toBeGreaterThan(0)
    expect(remaining).toBeLessThanOrEqual(3600)
  })

  it('已过期的 token 返回 0', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 1000
    const token = makeToken({ sub: 'user-1', exp: pastExp })
    expect(getTokenRemainingTime(token)).toBe(0)
  })

  it('刚好到期的 token 返回 0', () => {
    const nowExp = Math.floor(Date.now() / 1000)
    const token = makeToken({ sub: 'user-1', exp: nowExp })
    expect(getTokenRemainingTime(token)).toBe(0)
  })

  it('无 exp 字段的 token 返回 0', () => {
    const token = makeToken({ sub: 'user-1' })
    expect(getTokenRemainingTime(token)).toBe(0)
  })

  it('非法 token 返回 0', () => {
    expect(getTokenRemainingTime('invalid')).toBe(0)
  })

  it('exp 为非数字类型时返回 0', () => {
    const token = makeToken({ sub: 'user-1', exp: 'not-a-number' })
    expect(getTokenRemainingTime(token)).toBe(0)
  })
})
