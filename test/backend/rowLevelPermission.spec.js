const validateRowLevelPermission = require('../../server/utils/validateRowLevelPermission')

describe('validateRowLevelPermission — 基础校验', () => {
  it('非法 SQL 语法返回 false', () => {
    expect(validateRowLevelPermission('NOT A VALID SQL STATEMENT !!!', 1)).toBe(false)
  })

  it('空字符串返回 false', () => {
    expect(validateRowLevelPermission('', 1)).toBe(false)
  })

  it('null/undefined 返回 false', () => {
    expect(validateRowLevelPermission(null, 1)).toBe(false)
  })
})

describe('validateRowLevelPermission — 禁止操作 users 表', () => {
  it('SELECT users 表返回 false', () => {
    expect(validateRowLevelPermission('SELECT * FROM users', 1)).toBe(false)
  })

  it('DELETE users 表返回 false', () => {
    expect(validateRowLevelPermission("DELETE FROM users WHERE id = 1", 1)).toBe(false)
  })

  it('UPDATE users 表返回 false', () => {
    expect(validateRowLevelPermission("UPDATE users SET username = 'test' WHERE id = 1", 1)).toBe(false)
  })
})

describe('validateRowLevelPermission — 公开只读表', () => {
  it('SELECT articles 表返回 true', () => {
    expect(validateRowLevelPermission('SELECT * FROM articles', 1)).toBe(true)
  })

  it('SELECT doctor_information 表返回 true', () => {
    expect(validateRowLevelPermission('SELECT * FROM doctor_information', 1)).toBe(true)
  })

  it('SELECT diabetes_types 表返回 true', () => {
    expect(validateRowLevelPermission('SELECT * FROM diabetes_types', 1)).toBe(true)
  })

  it('INSERT articles 表（写操作）返回 false', () => {
    expect(validateRowLevelPermission("INSERT INTO articles (title) VALUES ('test')", 1)).toBe(false)
  })

  it('UPDATE articles 表（写操作）返回 false', () => {
    expect(validateRowLevelPermission("UPDATE articles SET title = 'test'", 1)).toBe(false)
  })

  it('DELETE articles 表（写操作）返回 false', () => {
    expect(validateRowLevelPermission('DELETE FROM articles WHERE id = 1', 1)).toBe(false)
  })
})

describe('validateRowLevelPermission — 审计日志表只读', () => {
  it('SELECT admin_logs 表返回 true', () => {
    expect(validateRowLevelPermission('SELECT * FROM admin_logs', 1)).toBe(true)
  })

  it('INSERT admin_logs 表返回 false', () => {
    expect(validateRowLevelPermission("INSERT INTO admin_logs (admin_user_id) VALUES (1)", 1)).toBe(false)
  })
})

describe('validateRowLevelPermission — 用户域表 SELECT（需 user_id 约束）', () => {
  it('SELECT user_risk_info WHERE user_id = 正确值 返回 true', () => {
    expect(validateRowLevelPermission('SELECT * FROM user_risk_info WHERE user_id = 5', 5)).toBe(true)
  })

  it('SELECT user_risk_info WHERE user_id = 错误值 返回 false', () => {
    expect(validateRowLevelPermission('SELECT * FROM user_risk_info WHERE user_id = 5', 999)).toBe(false)
  })

  it('SELECT user_risk_info 无 WHERE 子句 返回 false', () => {
    expect(validateRowLevelPermission('SELECT * FROM user_risk_info', 1)).toBe(false)
  })

  it('SELECT life_plans WHERE user_id = 正确值 返回 true', () => {
    expect(validateRowLevelPermission('SELECT * FROM life_plans WHERE user_id = 3', 3)).toBe(true)
  })

  it('SELECT life_advice WHERE user_id = 正确值 返回 true', () => {
    expect(validateRowLevelPermission('SELECT * FROM life_advice WHERE user_id = 1', 1)).toBe(true)
  })

  it('SELECT punch_in WHERE user_id = 正确值 返回 true', () => {
    expect(validateRowLevelPermission('SELECT * FROM punch_in WHERE user_id = 2', 2)).toBe(true)
  })

  it('SELECT article_collections WHERE user_id = 正确值 返回 true', () => {
    expect(validateRowLevelPermission('SELECT * FROM article_collections WHERE user_id = 1', 1)).toBe(true)
  })
})

describe('validateRowLevelPermission — 用户域表 UPDATE（需 user_id 约束）', () => {
  it('UPDATE user_risk_info WHERE user_id = 正确值 返回 true', () => {
    expect(validateRowLevelPermission("UPDATE user_risk_info SET weight = 70 WHERE user_id = 1", 1)).toBe(true)
  })

  it('UPDATE user_risk_info WHERE user_id = 错误值 返回 false', () => {
    expect(validateRowLevelPermission("UPDATE user_risk_info SET weight = 70 WHERE user_id = 1", 999)).toBe(false)
  })
})

describe('validateRowLevelPermission — 用户域表 DELETE（需 user_id 约束）', () => {
  it('DELETE life_plans WHERE user_id = 正确值 返回 true', () => {
    expect(validateRowLevelPermission('DELETE FROM life_plans WHERE user_id = 1', 1)).toBe(true)
  })

  it('DELETE life_plans WHERE user_id = 错误值 返回 false', () => {
    expect(validateRowLevelPermission('DELETE FROM life_plans WHERE user_id = 1', 2)).toBe(false)
  })
})

describe('validateRowLevelPermission — 用户域表 INSERT（需 user_id 列匹配）', () => {
  it('INSERT user_risk_info 含 user_id = 正确值 返回 true', () => {
    expect(validateRowLevelPermission(
      'INSERT INTO user_risk_info (user_id, age, gender) VALUES (1, 30, "male")', 1
    )).toBe(true)
  })

  it('INSERT user_risk_info 含 user_id = 错误值 返回 false', () => {
    expect(validateRowLevelPermission(
      'INSERT INTO user_risk_info (user_id, age, gender) VALUES (1, 30, "male")', 999
    )).toBe(false)
  })

  it('INSERT life_plans 含 user_id = 正确值 返回 true', () => {
    expect(validateRowLevelPermission(
      "INSERT INTO life_plans (user_id, type, title) VALUES (3, '饮食', '早餐')", 3
    )).toBe(true)
  })
})

describe('validateRowLevelPermission — 多表查询', () => {
  it('JOIN 含 users 表返回 false', () => {
    const sql = 'SELECT * FROM user_risk_info JOIN users ON user_risk_info.user_id = users.id WHERE user_risk_info.user_id = 1'
    expect(validateRowLevelPermission(sql, 1)).toBe(false)
  })
})

describe('validateRowLevelPermission — 未知表', () => {
  it('操作不在白名单中的表返回 false', () => {
    expect(validateRowLevelPermission('SELECT * FROM unknown_table', 1)).toBe(false)
  })
})
