// Vitest globals（describe/it/expect）已通过 vitest.config.ts 的 globals:true 注入
const path = require('path')

const MODULE_PATH = path.resolve(__dirname, '../../server/db/sql.js')

// 辅助：清除模块缓存并重新加载
function reloadSql() {
  delete require.cache[require.resolve(MODULE_PATH)]
  return require(MODULE_PATH)
}

describe('sql 方言模块', () => {
  // ---------------------------------------------------------------
  // setDialect / getDialect
  // ---------------------------------------------------------------
  describe('setDialect / getDialect', () => {
    beforeEach(() => {
      delete require.cache[require.resolve(MODULE_PATH)]
    })

    it('setDialect("sqlite") 后 getDialect 返回 "sqlite"', () => {
      const sql = reloadSql()
      sql.setDialect('sqlite')
      expect(sql.getDialect()).toBe('sqlite')
    })

    it('setDialect("kingbase") 后 getDialect 返回 "kingbase"', () => {
      const sql = reloadSql()
      sql.setDialect('kingbase')
      expect(sql.getDialect()).toBe('kingbase')
    })

    it('未调用 setDialect 时 getDialect 抛出异常', () => {
      const sql = reloadSql()
      expect(() => sql.getDialect()).toThrow(/方言未初始化/)
    })

    it('setDialect 传入不支持的类型抛出异常', () => {
      const sql = reloadSql()
      expect(() => sql.setDialect('mysql')).toThrow(/不支持的数据库类型/)
    })

    it('setDialect 传入空字符串抛出异常', () => {
      const sql = reloadSql()
      expect(() => sql.setDialect('')).toThrow(/不支持的数据库类型/)
    })
  })

  // ---------------------------------------------------------------
  // now()
  // ---------------------------------------------------------------
  describe('now()', () => {
    it('始终返回 CURRENT_TIMESTAMP', () => {
      const sql = reloadSql()
      sql.setDialect('sqlite')
      expect(sql.now()).toBe('CURRENT_TIMESTAMP')

      sql.setDialect('kingbase')
      expect(sql.now()).toBe('CURRENT_TIMESTAMP')
    })
  })

  // ---------------------------------------------------------------
  // date() — dateExpr
  // ---------------------------------------------------------------
  describe('date()', () => {
    it('sqlite 方言返回 date(\'now\',\'localtime\')', () => {
      const sql = reloadSql()
      sql.setDialect('sqlite')
      expect(sql.date()).toBe("date('now','localtime')")
    })

    it('kingbase 方言返回 CURRENT_DATE::text', () => {
      const sql = reloadSql()
      sql.setDialect('kingbase')
      expect(sql.date()).toBe('CURRENT_DATE::text')
    })
  })

  // ---------------------------------------------------------------
  // jsonField()
  // ---------------------------------------------------------------
  describe('jsonField()', () => {
    it('sqlite 方言使用 json_extract', () => {
      const sql = reloadSql()
      sql.setDialect('sqlite')
      expect(sql.jsonField('extra', 'risk_score')).toBe("json_extract(extra, '$.risk_score')")
    })

    it('kingbase 方言使用 ::jsonb->>', () => {
      const sql = reloadSql()
      sql.setDialect('kingbase')
      expect(sql.jsonField('extra', 'risk_score')).toBe("extra::jsonb->>'risk_score'")
    })

    it('支持嵌套路径', () => {
      const sql = reloadSql()
      sql.setDialect('sqlite')
      expect(sql.jsonField('data', 'address.city')).toBe("json_extract(data, '$.address.city')")
    })
  })

  // ---------------------------------------------------------------
  // jsonFieldAs()
  // ---------------------------------------------------------------
  describe('jsonFieldAs()', () => {
    it('sqlite 方言带 INTEGER 类型转换', () => {
      const sql = reloadSql()
      sql.setDialect('sqlite')
      expect(sql.jsonFieldAs('extra', 'score', 'INTEGER'))
        .toBe("CAST(json_extract(extra, '$.score') AS INTEGER)")
    })

    it('kingbase 方言带 INTEGER 类型转换', () => {
      const sql = reloadSql()
      sql.setDialect('kingbase')
      expect(sql.jsonFieldAs('extra', 'score', 'INTEGER'))
        .toBe("(extra::jsonb->>'score')::INTEGER")
    })

    it('支持 TEXT 类型转换', () => {
      const sql = reloadSql()
      sql.setDialect('sqlite')
      expect(sql.jsonFieldAs('data', 'name', 'TEXT'))
        .toBe("CAST(json_extract(data, '$.name') AS TEXT)")
    })
  })

  // ---------------------------------------------------------------
  // formatDateParam()
  // ---------------------------------------------------------------
  describe('formatDateParam()', () => {
    it('将 JS Date 格式化为 YYYY-MM-DD HH:MM:SS UTC 字符串', () => {
      const sql = reloadSql()
      // 2024-06-15T08:30:45.000Z → "2024-06-15 08:30:45"
      const date = new Date('2024-06-15T08:30:45.000Z')
      expect(sql.formatDateParam(date)).toBe('2024-06-15 08:30:45')
    })

    it('正确处理午夜', () => {
      const sql = reloadSql()
      const date = new Date('2024-01-01T00:00:00.000Z')
      expect(sql.formatDateParam(date)).toBe('2024-01-01 00:00:00')
    })

    it('正确处理年末边界', () => {
      const sql = reloadSql()
      const date = new Date('2024-12-31T23:59:59.000Z')
      expect(sql.formatDateParam(date)).toBe('2024-12-31 23:59:59')
    })

    it('月份和日期始终补零到 2 位', () => {
      const sql = reloadSql()
      // 1月1日 → 01-01
      const date = new Date('2024-01-01T01:02:03.000Z')
      const result = sql.formatDateParam(date)
      expect(result).toBe('2024-01-01 01:02:03')
    })

    it('输出格式与 CURRENT_TIMESTAMP 兼容（不含 T）', () => {
      const sql = reloadSql()
      const date = new Date('2025-03-15T12:00:00.000Z')
      const result = sql.formatDateParam(date)
      expect(result).not.toContain('T')
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    })
  })

  // ---------------------------------------------------------------
  // 方言切换后各函数输出正确
  // ---------------------------------------------------------------
  describe('方言切换完整性', () => {
    it('从 sqlite 切换到 kingbase 后所有函数返回 kingbase 方言', () => {
      const sql = reloadSql()
      sql.setDialect('sqlite')
      expect(sql.date()).toBe("date('now','localtime')")

      sql.setDialect('kingbase')
      expect(sql.date()).toBe('CURRENT_DATE::text')
      expect(sql.jsonField('col', 'path')).toBe("col::jsonb->>'path'")
    })

    it('从 kingbase 切换到 sqlite 后所有函数返回 sqlite 方言', () => {
      const sql = reloadSql()
      sql.setDialect('kingbase')
      expect(sql.date()).toBe('CURRENT_DATE::text')

      sql.setDialect('sqlite')
      expect(sql.date()).toBe("date('now','localtime')")
      expect(sql.jsonField('col', 'path')).toBe("json_extract(col, '$.path')")
    })
  })
})
