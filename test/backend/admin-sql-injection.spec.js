// Vitest globals（describe/it/expect）已通过 vitest.config.ts 的 globals:true 注入
const fs = require('fs')
const path = require('path')

const ADMIN_SOURCE_PATH = path.resolve(__dirname, '../../server/routes/admin.js')

// ---------------------------------------------------------------
// 辅助：从源码中提取模块私有函数用于测试
// 不修改源码文件，仅在测试上下文中 eval 函数定义
// ---------------------------------------------------------------

/**
 * 从 JS 源码中提取具名函数定义的完整文本
 * @param {string} source - 源码全文
 * @param {string} funcName - 函数名
 * @returns {string} 函数定义文本
 */
function extractFunctionSource(source, funcName) {
  const headerRegex = new RegExp(
    `function ${funcName}\\s*\\([^)]*\\)\\s*\\{`,
    'm'
  )
  const match = source.match(headerRegex)
  if (!match) {
    throw new Error(`函数 ${funcName} 在源码中未找到`)
  }

  const startIndex = match.index
  let braceCount = 0
  let inFunction = false
  let endIndex = startIndex

  for (let i = startIndex; i < source.length; i++) {
    if (source[i] === '{') {
      braceCount++
      inFunction = true
    } else if (source[i] === '}') {
      braceCount--
    }
    if (inFunction && braceCount === 0) {
      endIndex = i + 1
      break
    }
  }

  return source.substring(startIndex, endIndex)
}

const adminSource = fs.readFileSync(ADMIN_SOURCE_PATH, 'utf-8')

// 提取并创建可测试的函数引用
const splitByAnd = eval(`(${extractFunctionSource(adminSource, 'splitByAnd')})`)
const parseWhereClause = eval(`(${extractFunctionSource(adminSource, 'parseWhereClause')})`)

// ---------------------------------------------------------------
// S5 — SQL 注入修复验证
// ---------------------------------------------------------------

describe('admin.js S5 SQL注入修复 — parseWhereClause 行为矩阵', () => {
  // ====================
  // 正向用例 — 合法输入
  // ====================
  describe('合法输入（正常路径）', () => {
    it("单条件字符串值: \"username = 'admin'\"", () => {
      const result = parseWhereClause("username = 'admin'")
      expect(result.isValid).toBe(true)
      expect(result.conditions).toHaveLength(1)
      expect(result.conditions[0]).toEqual({ column: 'username', value: 'admin' })
    })

    it("数值条件: \"id = 42\"", () => {
      const result = parseWhereClause('id = 42')
      expect(result.isValid).toBe(true)
      expect(result.conditions).toHaveLength(1)
      expect(result.conditions[0]).toEqual({ column: 'id', value: 42 })
      expect(typeof result.conditions[0].value).toBe('number')
    })

    it("多条件 AND: \"role = 'user' AND status = 'active'\"", () => {
      const result = parseWhereClause("role = 'user' AND status = 'active'")
      expect(result.isValid).toBe(true)
      expect(result.conditions).toHaveLength(2)
      expect(result.conditions[0]).toEqual({ column: 'role', value: 'user' })
      expect(result.conditions[1]).toEqual({ column: 'status', value: 'active' })
    })

    it("浮点数值: \"score = 3.14\"", () => {
      const result = parseWhereClause('score = 3.14')
      expect(result.isValid).toBe(true)
      expect(result.conditions).toHaveLength(1)
      expect(result.conditions[0].value).toBe(3.14)
    })

    it("值中含 AND 字面量: \"name = 'ANDERSON'\"", () => {
      const result = parseWhereClause("name = 'ANDERSON'")
      expect(result.isValid).toBe(true)
      expect(result.conditions).toHaveLength(1)
      expect(result.conditions[0].value).toBe('ANDERSON')
    })
  })

  // ====================
  // 边界条件
  // ====================
  describe('边界条件', () => {
    it('空字符串返回 isValid: false', () => {
      const result = parseWhereClause('')
      expect(result.isValid).toBe(false)
      expect(result.conditions).toEqual([])
    })

    it('null 返回 isValid: false', () => {
      const result = parseWhereClause(null)
      expect(result.isValid).toBe(false)
    })

    it('undefined 返回 isValid: false', () => {
      const result = parseWhereClause(undefined)
      expect(result.isValid).toBe(false)
    })

    it('非字符串类型（数字 123）返回 isValid: false', () => {
      // @ts-ignore 测试非法输入
      const result = parseWhereClause(123)
      expect(result.isValid).toBe(false)
    })

    it('仅含空格的字符串返回 isValid: false', () => {
      const result = parseWhereClause('   ')
      expect(result.isValid).toBe(false)
    })

    it('单个合法条件（无 AND）', () => {
      const result = parseWhereClause("role = 'user'")
      expect(result.isValid).toBe(true)
      expect(result.conditions).toHaveLength(1)
    })

    it('三个 AND 条件', () => {
      const result = parseWhereClause("a = '1' AND b = '2' AND c = '3'")
      expect(result.isValid).toBe(true)
      expect(result.conditions).toHaveLength(3)
    })
  })

  // ====================
  // 错误路径 — 不支持的操作符
  // ====================
  describe('不支持的操作符（应拒绝）', () => {
    it('> 操作符: "id > 1"', () => {
      const result = parseWhereClause('id > 1')
      expect(result.isValid).toBe(false)
    })

    it('< 操作符: "id < 10"', () => {
      const result = parseWhereClause('id < 10')
      expect(result.isValid).toBe(false)
    })

    it('!= 操作符: "id != 5"', () => {
      const result = parseWhereClause('id != 5')
      expect(result.isValid).toBe(false)
    })

    it('LIKE 操作符', () => {
      const result = parseWhereClause("name LIKE '%admin%'")
      expect(result.isValid).toBe(false)
    })

    it('IN 操作符', () => {
      const result = parseWhereClause('id IN (1, 2, 3)')
      expect(result.isValid).toBe(false)
    })

    it('OR 连接符（仅允许 AND）', () => {
      const result = parseWhereClause("id = 1 OR role = 'admin'")
      expect(result.isValid).toBe(false)
    })
  })

  // ====================
  // 错误路径 — SQL 注入攻击
  // ====================
  describe('SQL 注入攻击尝试（应拒绝）', () => {
    it('永真式注入: "1=1"（列名 1 非法）', () => {
      const result = parseWhereClause('1=1')
      expect(result.isValid).toBe(false)
    })

    it('DROP TABLE 注入: "id = 1; DROP TABLE users"', () => {
      const result = parseWhereClause('id = 1; DROP TABLE users')
      expect(result.isValid).toBe(false)
    })

    it('子查询注入: "id = (SELECT id FROM users)"', () => {
      const result = parseWhereClause('id = (SELECT id FROM users)')
      expect(result.isValid).toBe(false)
    })

    it('UNION 注入: "id = 1 UNION SELECT * FROM users"', () => {
      const result = parseWhereClause('id = 1 UNION SELECT * FROM users')
      expect(result.isValid).toBe(false)
    })

    it("注释注入: \"id = 1 --\"", () => {
      const result = parseWhereClause('id = 1 --')
      expect(result.isValid).toBe(false)
    })

    it('空字符串值（单引号内为空）: "col = \'\'"', () => {
      const result = parseWhereClause("col = ''")
      expect(result.isValid).toBe(false)
    })
  })

  // ====================
  // 错误路径 — 非法列名
  // ====================
  describe('非法列名（应拒绝）', () => {
    it('列名含连字符', () => {
      const result = parseWhereClause("user-id = 'test'")
      expect(result.isValid).toBe(false)
    })

    it('列名含空格', () => {
      const result = parseWhereClause("user id = 'test'")
      expect(result.isValid).toBe(false)
    })

    it('列名为 SQL 关键字', () => {
      const result = parseWhereClause("SELECT = 'test'")
      // SELECT 作为列名通过正则 [a-zA-Z_][a-zA-Z0-9_]*，但这是合法列名模式
      // parseWhereClause 不禁止 SQL 关键字作为列名（白名单表名校验在调用处完成）
      expect(result.isValid).toBe(true)
    })
  })
})

// ---------------------------------------------------------------
// splitByAnd 辅助函数专项测试
// ---------------------------------------------------------------
describe('splitByAnd — 按 AND 关键字分割（尊重引号边界）', () => {
  it('单个条件不分割', () => {
    expect(splitByAnd("a = '1'")).toEqual(["a = '1'"])
  })

  it('两个条件用 AND 分割', () => {
    expect(splitByAnd("a = '1' AND b = '2'")).toEqual(["a = '1'", "b = '2'"])
  })

  it('三个条件', () => {
    const result = splitByAnd("a = '1' AND b = '2' AND c = '3'")
    expect(result).toHaveLength(3)
  })

  it('值中含 AND 字面量不错误分割', () => {
    const result = splitByAnd("name = 'ANDERSON' AND status = 'active'")
    expect(result).toEqual(["name = 'ANDERSON'", "status = 'active'"])
  })

  it('值中含小写 and 字面量不错误分割（大小写敏感）', () => {
    // AND 检查是 toUpperCase() 后比较，小写 and 也会匹配
    const result = splitByAnd("name = 'anderson' AND status = 'active'")
    expect(result).toEqual(["name = 'anderson'", "status = 'active'"])
  })
})

// ---------------------------------------------------------------
// 源码结构验证 — 确认三处工具操作使用参数化查询
// ---------------------------------------------------------------
describe('源码结构验证 — WHERE 子句参数化', () => {
  it('query_table case 使用 parseWhereClause + ? 占位符', () => {
    // 提取 query_table case 代码块
    const caseStart = adminSource.indexOf("case 'query_table':")
    const caseEnd = adminSource.indexOf("case 'insert_record':")
    const caseBlock = adminSource.substring(caseStart, caseEnd)

    expect(caseBlock).toContain('parseWhereClause')
    expect(caseBlock).toContain('?')
    // 不应直接拼接 params.where 到 SQL
    expect(caseBlock).not.toContain('WHERE ${params.where}')
  })

  it('update_record case 使用 parseWhereClause + ? 占位符', () => {
    const caseStart = adminSource.indexOf("case 'update_record':")
    const caseEnd = adminSource.indexOf("case 'delete_record':")
    const caseBlock = adminSource.substring(caseStart, caseEnd)

    expect(caseBlock).toContain('parseWhereClause')
    expect(caseBlock).toContain('?')
    expect(caseBlock).not.toContain('WHERE ${params.where}')
  })

  it('delete_record case 使用 parseWhereClause + ? 占位符', () => {
    const caseStart = adminSource.indexOf("case 'delete_record':")
    const caseEnd = adminSource.indexOf("case 'get_table_schema':")
    const caseBlock = adminSource.substring(caseStart, caseEnd)

    expect(caseBlock).toContain('parseWhereClause')
    expect(caseBlock).toContain('?')
    expect(caseBlock).not.toContain('WHERE ${params.where}')
  })

  it('query_table/update_record/delete_record 均返回 VALIDATION_ERROR 处理非法 WHERE', () => {
    // 统计 VALIDATION_ERROR 出现次数（三处各一次 + insert_record 中一处 = 至少 4 次）
    const matches = adminSource.match(/VALIDATION_ERROR/g)
    expect(matches).not.toBeNull()
    expect(matches.length).toBeGreaterThanOrEqual(4)
  })

  it('splitByAnd 和 parseWhereClause 函数定义存在于模块中', () => {
    expect(adminSource).toContain('function splitByAnd(')
    expect(adminSource).toContain('function parseWhereClause(')
  })
})
