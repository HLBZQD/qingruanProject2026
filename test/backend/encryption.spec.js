// Vitest globals（describe/it/expect/beforeAll/afterEach）已通过 vitest.config.ts 的 globals:true 注入
const crypto = require('crypto')
const path = require('path')

const MODULE_PATH = path.resolve(__dirname, '../../server/utils/encryption.js')

// 辅助：清除模块缓存
function clearEncryptionCache() {
  delete require.cache[require.resolve(MODULE_PATH)]
}

// 辅助：安全加载加密模块
function loadEncryptionModule() {
  clearEncryptionCache()
  return require(MODULE_PATH)
}

describe('encryption 模块 — S6 硬编码密钥修复验证', () => {
  // 保存原始环境变量，测试结束后恢复
  const savedJwtSecret = process.env.JWT_SECRET

  afterAll(() => {
    process.env.JWT_SECRET = savedJwtSecret
  })

  // ---------------------------------------------------------------
  // 行为契约 1: JWT_SECRET 已设置 → 模块正常加载
  // ---------------------------------------------------------------
  describe('模块加载 — JWT_SECRET 已设置', () => {
    beforeEach(() => {
      process.env.JWT_SECRET = 'test-load-secret-at-least-32-chars!!!'
      clearEncryptionCache()
    })

    it('require() 不抛出异常', () => {
      expect(() => require(MODULE_PATH)).not.toThrow()
    })

    it('导出 encryptChatToken, decryptChatToken, deriveKey, getSalt 四个函数', () => {
      const mod = require(MODULE_PATH)
      expect(typeof mod.encryptChatToken).toBe('function')
      expect(typeof mod.decryptChatToken).toBe('function')
      expect(typeof mod.deriveKey).toBe('function')
      expect(typeof mod.getSalt).toBe('function')
    })
  })

  // ---------------------------------------------------------------
  // 行为契约 2: JWT_SECRET 未设置 → 模块加载时抛出明确错误
  // ---------------------------------------------------------------
  describe('模块加载 — JWT_SECRET 未设置', () => {
    beforeEach(() => {
      clearEncryptionCache()
    })

    it('JWT_SECRET 为 undefined → throw Error 包含 [encryption] 标识', () => {
      delete process.env.JWT_SECRET
      try {
        expect(() => require(MODULE_PATH)).toThrow('[encryption]')
      } finally {
        process.env.JWT_SECRET = 'test-load-secret-at-least-32-chars!!!'
      }
    })

    it('JWT_SECRET 为空字符串 → throw Error（falsy 值被视为未设置）', () => {
      process.env.JWT_SECRET = ''
      try {
        expect(() => require(MODULE_PATH)).toThrow('[encryption]')
      } finally {
        process.env.JWT_SECRET = 'test-load-secret-at-least-32-chars!!!'
      }
    })

    it('错误消息明确指向 JWT_SECRET 环境变量', () => {
      delete process.env.JWT_SECRET
      try {
        expect(() => require(MODULE_PATH)).toThrow(/JWT_SECRET/)
      } finally {
        process.env.JWT_SECRET = 'test-load-secret-at-least-32-chars!!!'
      }
    })
  })

  // ---------------------------------------------------------------
  // 行为契约 3: deriveKey() 移除硬编码回退
  // ---------------------------------------------------------------
  describe('deriveKey() — 无硬编码默认密钥', () => {
    beforeAll(() => {
      process.env.JWT_SECRET = 'test-derivekey-secret-at-least-32-chars!!'
    })

    it('相同 salt 产生确定性的相同派生密钥', () => {
      const { deriveKey } = loadEncryptionModule()
      const salt = crypto.randomBytes(16)
      const key1 = deriveKey(salt)
      const key2 = deriveKey(salt)
      expect(Buffer.isBuffer(key1)).toBe(true)
      expect(key1.equals(key2)).toBe(true)
    })

    it('不同 salt 产生不同派生密钥', () => {
      const { deriveKey } = loadEncryptionModule()
      const salt1 = crypto.randomBytes(16)
      const salt2 = crypto.randomBytes(16)
      // 确保 salt 确实不同
      if (salt1.equals(salt2)) salt2.writeUInt8(salt2.readUInt8(0) ^ 1, 0)
      const key1 = deriveKey(salt1)
      const key2 = deriveKey(salt2)
      expect(key1.equals(key2)).toBe(false)
    })

    it('派生密钥长度为 32 字节 (256 位 AES-256)', () => {
      const { deriveKey } = loadEncryptionModule()
      const salt = crypto.randomBytes(16)
      const key = deriveKey(salt)
      expect(key.length).toBe(32)
    })

    it('源码中不含硬编码字符串 default_secret_change_me', () => {
      const fs = require('fs')
      const source = fs.readFileSync(MODULE_PATH, 'utf-8')
      expect(source).not.toContain('default_secret_change_me')
    })
  })

  // ---------------------------------------------------------------
  // 行为契约 4: encryptChatToken / decryptChatToken 往返正确性
  // ---------------------------------------------------------------
  describe('encryptChatToken / decryptChatToken 往返', () => {
    beforeAll(() => {
      process.env.JWT_SECRET = 'test-crypto-secret-at-least-32-chars-ok!!'
    })

    it('加密后解密应恢复原始 ASCII token', () => {
      const { encryptChatToken, decryptChatToken } = loadEncryptionModule()
      const original = 'sk-test-chat-token-12345'
      const encrypted = encryptChatToken(original)
      expect(typeof encrypted).toBe('string')
      expect(encrypted).not.toBe(original)
      const decrypted = decryptChatToken(encrypted)
      expect(decrypted).toBe(original)
    })

    it('加密后解密应恢复含 Unicode 字符的 token', () => {
      const { encryptChatToken, decryptChatToken } = loadEncryptionModule()
      const original = 'token-中文-テスト-😊'
      const encrypted = encryptChatToken(original)
      const decrypted = decryptChatToken(encrypted)
      expect(decrypted).toBe(original)
    })

    it('加密后解密应恢复长 token（>200 字符）', () => {
      const { encryptChatToken, decryptChatToken } = loadEncryptionModule()
      const original = 'sk-' + 'a'.repeat(250)
      const encrypted = encryptChatToken(original)
      const decrypted = decryptChatToken(encrypted)
      expect(decrypted).toBe(original)
    })

    it('每次加密相同明文产生不同密文（随机 IV）', () => {
      const { encryptChatToken } = loadEncryptionModule()
      const plain = 'same-token-value'
      const enc1 = encryptChatToken(plain)
      const enc2 = encryptChatToken(plain)
      expect(enc1).not.toBe(enc2)
    })

    it('解密被篡改的数据抛出异常', () => {
      const { encryptChatToken, decryptChatToken } = loadEncryptionModule()
      const encrypted = encryptChatToken('original-token')
      // 翻转最后一个字符制造篡改
      const tampered = encrypted.slice(0, -1) + (encrypted.slice(-1) === 'A' ? 'B' : 'A')
      expect(() => decryptChatToken(tampered)).toThrow()
    })

    it('解密格式错误的字符串抛出异常', () => {
      const { decryptChatToken } = loadEncryptionModule()
      expect(() => decryptChatToken('not-a-valid-format')).toThrow()
    })

    it('解密空字符串抛出异常', () => {
      const { decryptChatToken } = loadEncryptionModule()
      expect(() => decryptChatToken('')).toThrow()
    })
  })

  // ---------------------------------------------------------------
  // 行为契约 5: getSalt() 行为不变（自动生成 + 警告）
  // ---------------------------------------------------------------
  describe('getSalt() — 行为保持不变', () => {
    beforeAll(() => {
      process.env.JWT_SECRET = 'test-salt-secret-at-least-32-chars-here!!'
    })

    it('在同一模块实例中返回一致的 salt', () => {
      const { getSalt } = loadEncryptionModule()
      const salt1 = getSalt()
      const salt2 = getSalt()
      expect(salt1.equals(salt2)).toBe(true)
    })

    it('返回 16 字节 Buffer', () => {
      const { getSalt } = loadEncryptionModule()
      const salt = getSalt()
      expect(Buffer.isBuffer(salt)).toBe(true)
      expect(salt.length).toBe(16)
    })
  })
})
