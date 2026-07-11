const {
  validateUsername,
  validatePassword,
  validateRegister,
  validateLogin,
  validateProfile,
  validateRiskPredict,
  validatePlanGenerate,
  validatePunch,
  validatePlanAdjust,
  validateArticleGenerate
} = require('../../server/utils/validators')

// ============================================================================
// validateUsername
// ============================================================================
describe('validateUsername', () => {
  it('合法中文用户名返回 null', () => {
    expect(validateUsername('郭宜铼')).toBe(null)
  })

  it('合法英文用户名返回 null', () => {
    expect(validateUsername('test_user123')).toBe(null)
  })

  it('纯数字用户名返回 null', () => {
    expect(validateUsername('12345')).toBe(null)
  })

  it('空字符串返回错误', () => {
    expect(validateUsername('')).toBe('用户名不能为空')
  })

  it('undefined 返回错误', () => {
    expect(validateUsername(undefined)).toBe('用户名不能为空')
  })

  it('null 返回错误', () => {
    expect(validateUsername(null)).toBe('用户名不能为空')
  })

  it('非字符串类型（数字）返回错误', () => {
    expect(validateUsername(123)).toBe('用户名不能为空')
  })

  it('长度不足 3 位返回错误', () => {
    expect(validateUsername('ab')).toBe('用户名长度需在3-50个字符之间')
  })

  it('仅 2 个汉字返回错误', () => {
    expect(validateUsername('用户')).toBe('用户名长度需在3-50个字符之间')
  })

  it('长度超过 50 位返回错误', () => {
    expect(validateUsername('a'.repeat(51))).toBe('用户名长度需在3-50个字符之间')
  })

  it('正好 3 位返回 null', () => {
    expect(validateUsername('abc')).toBe(null)
  })

  it('正好 50 位返回 null', () => {
    expect(validateUsername('a'.repeat(50))).toBe(null)
  })

  it('含特殊字符返回错误', () => {
    expect(validateUsername('user@name')).toBe('用户名仅允许字母、数字、下划线和汉字')
  })

  it('含空格返回错误', () => {
    expect(validateUsername('user name')).toBe('用户名仅允许字母、数字、下划线和汉字')
  })

  it('含 emoji 返回错误', () => {
    expect(validateUsername('user😊name')).toBe('用户名仅允许字母、数字、下划线和汉字')
  })

  it('首尾空格被 trim 后校验', () => {
    expect(validateUsername('  abc  ')).toBe(null)
  })
})

// ============================================================================
// validatePassword
// ============================================================================
describe('validatePassword', () => {
  it('合法密码（字母+数字，>=8位）返回 null', () => {
    expect(validatePassword('abc12345')).toBe(null)
  })

  it('大写字母+数字返回 null', () => {
    expect(validatePassword('PASSWORD123')).toBe(null)
  })

  it('密码长度正好 8 位返回 null', () => {
    expect(validatePassword('abcd1234')).toBe(null)
  })

  it('空字符串返回错误', () => {
    expect(validatePassword('')).toBe('密码不能为空')
  })

  it('undefined 返回错误', () => {
    expect(validatePassword(undefined)).toBe('密码不能为空')
  })

  it('长度不足 8 位返回错误', () => {
    expect(validatePassword('ab12')).toBe('密码长度不少于8位')
  })

  it('仅字母无数字返回错误', () => {
    expect(validatePassword('abcdefgh')).toBe('密码需包含字母和数字')
  })

  it('仅数字无字母返回错误', () => {
    expect(validatePassword('12345678')).toBe('密码需包含字母和数字')
  })

  it('仅特殊字符返回错误', () => {
    expect(validatePassword('!@#$%^&*')).toBe('密码需包含字母和数字')
  })
})

// ============================================================================
// validateRegister
// ============================================================================
describe('validateRegister', () => {
  it('合法用户名+密码返回 null', () => {
    expect(validateRegister('testuser', 'password123')).toBe(null)
  })

  it('用户名不合法时返回用户名错误', () => {
    expect(validateRegister('ab', 'password123')).toBe('用户名长度需在3-50个字符之间')
  })

  it('密码不合法时返回密码错误', () => {
    expect(validateRegister('testuser', 'short')).toBe('密码长度不少于8位')
  })

  it('两者都不合法时返回用户名错误（先校验用户名）', () => {
    const result = validateRegister('ab', 'short')
    expect(result).toBe('用户名长度需在3-50个字符之间')
  })
})

// ============================================================================
// validateLogin
// ============================================================================
describe('validateLogin', () => {
  it('合法用户名+密码返回 null', () => {
    expect(validateLogin('admin', 'admin123')).toBe(null)
  })

  it('用户名为空返回错误', () => {
    expect(validateLogin('', 'password')).toBe('用户名不能为空')
  })

  it('密码为空返回错误', () => {
    expect(validateLogin('admin', '')).toBe('密码不能为空')
  })

  it('用户名非字符串返回错误', () => {
    expect(validateLogin(123, 'password')).toBe('用户名不能为空')
  })

  it('密码非字符串返回错误', () => {
    expect(validateLogin('admin', 123)).toBe('密码不能为空')
  })
})

// ============================================================================
// validateProfile
// ============================================================================
describe('validateProfile', () => {
  it('仅修改用户名（合法）返回 null', () => {
    expect(validateProfile('newuser', undefined)).toBe(null)
  })

  it('仅修改头像返回 null', () => {
    expect(validateProfile(undefined, '/static/uploads/avatars/1.jpg')).toBe(null)
  })

  it('同时修改用户名和头像返回 null', () => {
    expect(validateProfile('newuser', '/static/uploads/avatars/1.jpg')).toBe(null)
  })

  it('两者都为空字符串时返回错误', () => {
    expect(validateProfile('', '')).toBe('至少需要修改一个字段')
  })

  it('两者都为 undefined 时返回错误', () => {
    expect(validateProfile(undefined, undefined)).toBe('至少需要修改一个字段')
  })

  it('用户名不合法时返回用户名错误', () => {
    expect(validateProfile('ab', undefined)).toBe('用户名长度需在3-50个字符之间')
  })
})

// ============================================================================
// validateRiskPredict
// ============================================================================
describe('validateRiskPredict', () => {
  const validBody = {
    age: 45,
    gender: 'male',
    height: 170,
    weight: 70,
    family_history: 'yes',
    diabetes_history: 'healthy'
  }

  it('合法请求体返回 null', () => {
    expect(validateRiskPredict(validBody)).toBe(null)
  })

  it('包含可选字段 waist 和 systolic_bp 返回 null', () => {
    expect(validateRiskPredict({ ...validBody, waist: 85, systolic_bp: 120 })).toBe(null)
  })

  it('包含可选 diabetes_type 返回 null', () => {
    expect(validateRiskPredict({ ...validBody, diabetes_history: 'diagnosed', diabetes_type: 'type2' })).toBe(null)
  })

  it('请求体为 null 返回错误', () => {
    expect(validateRiskPredict(null)).toBe('请求体不能为空')
  })

  it('age 不是整数返回错误', () => {
    expect(validateRiskPredict({ ...validBody, age: 45.5 })).toBe('年龄必须为正整数')
  })

  it('age <= 0 返回错误', () => {
    expect(validateRiskPredict({ ...validBody, age: 0 })).toBe('年龄必须为正整数')
  })

  it('gender 非法值返回错误', () => {
    expect(validateRiskPredict({ ...validBody, gender: 'unknown' })).toBe('性别必须为 male 或 female')
  })

  it('height <= 0 返回错误', () => {
    expect(validateRiskPredict({ ...validBody, height: 0 })).toBe('身高必须为正数')
  })

  it('weight <= 0 返回错误', () => {
    expect(validateRiskPredict({ ...validBody, weight: -1 })).toBe('体重必须为正数')
  })

  it('family_history 非法值返回错误', () => {
    expect(validateRiskPredict({ ...validBody, family_history: 'maybe' })).toBe('家族史必须为 yes 或 no')
  })

  it('diabetes_history 非法值返回错误', () => {
    expect(validateRiskPredict({ ...validBody, diabetes_history: 'unknown' }))
      .toBe('糖尿病史必须为 healthy、prediabetes 或 diagnosed')
  })

  it('waist <= 0 返回错误', () => {
    expect(validateRiskPredict({ ...validBody, waist: 0 })).toBe('腰围必须为正数')
  })

  it('systolic_bp <= 0 返回错误', () => {
    expect(validateRiskPredict({ ...validBody, systolic_bp: -5 })).toBe('收缩压必须为正数')
  })

  it('diabetes_type 非法值返回错误', () => {
    expect(validateRiskPredict({ ...validBody, diabetes_type: 'type99' }))
      .toBe('糖尿病类型必须为 type1、type2、gestational 或 other')
  })

  it('waist 为 null 时不校验（可选字段）', () => {
    expect(validateRiskPredict({ ...validBody, waist: null })).toBe(null)
  })

  it('systolic_bp 为 undefined 时不校验（可选字段）', () => {
    expect(validateRiskPredict({ ...validBody })).toBe(null)
  })
})

// ============================================================================
// validatePlanGenerate
// ============================================================================
describe('validatePlanGenerate', () => {
  const validBody = {
    health_info: { age: 45, gender: 'male', height: 170, weight: 70 },
    preferences: { dietary: '低糖饮食', activity: '每日散步' }
  }

  it('合法请求体返回 null', () => {
    expect(validatePlanGenerate(validBody)).toBe(null)
  })

  it('health_info 缺失返回错误', () => {
    expect(validatePlanGenerate({ preferences: validBody.preferences }))
      .toBe('health_info 不能为空')
  })

  it('health_info.age 非正数返回错误', () => {
    expect(validatePlanGenerate({
      health_info: { age: -1, gender: 'male', height: 170, weight: 70 },
      preferences: validBody.preferences
    })).toBe('health_info.age 必须为正数')
  })

  it('health_info.gender 非法值返回错误', () => {
    expect(validatePlanGenerate({
      health_info: { age: 45, gender: 'other', height: 170, weight: 70 },
      preferences: validBody.preferences
    })).toBe('health_info.gender 必须为 male 或 female')
  })

  it('preferences 缺失返回错误', () => {
    expect(validatePlanGenerate({ health_info: validBody.health_info }))
      .toBe('preferences 不能为空')
  })

  it('preferences.dietary 为空字符串返回错误', () => {
    expect(validatePlanGenerate({
      health_info: validBody.health_info,
      preferences: { dietary: '', activity: '跑步' }
    })).toBe('preferences.dietary 不能为空')
  })

  it('preferences.activity 为空字符串返回错误', () => {
    expect(validatePlanGenerate({
      health_info: validBody.health_info,
      preferences: { dietary: '低糖', activity: '' }
    })).toBe('preferences.activity 不能为空')
  })
})

// ============================================================================
// validatePunch
// ============================================================================
describe('validatePunch', () => {
  const validBody = {
    plan_id: 1,
    punch_type: 'diet',
    completion_status: 'completed'
  }

  it('合法请求体返回 null', () => {
    expect(validatePunch(validBody)).toBe(null)
  })

  it('含 remarks 返回 null', () => {
    expect(validatePunch({ ...validBody, remarks: '感觉不错' })).toBe(null)
  })

  it('plan_id 不是整数返回错误', () => {
    expect(validatePunch({ ...validBody, plan_id: 1.5 })).toBe('plan_id 必须为正整数')
  })

  it('plan_id <= 0 返回错误', () => {
    expect(validatePunch({ ...validBody, plan_id: 0 })).toBe('plan_id 必须为正整数')
  })

  it('punch_type 非法值返回错误', () => {
    expect(validatePunch({ ...validBody, punch_type: 'sleep' })).toBe('punch_type 必须为 diet 或 exercise')
  })

  it('completion_status 非法值返回错误', () => {
    expect(validatePunch({ ...validBody, completion_status: 'pending' }))
      .toBe('completion_status 必须为 completed 或 uncompleted')
  })

  it('remarks 非字符串返回错误', () => {
    expect(validatePunch({ ...validBody, remarks: 123 })).toBe('remarks 必须为字符串')
  })
})

// ============================================================================
// validatePlanAdjust
// ============================================================================
describe('validatePlanAdjust', () => {
  it('合法请求体返回 null', () => {
    expect(validatePlanAdjust({ plan_id: 1, feedback: '减少晚餐碳水' })).toBe(null)
  })

  it('plan_id 非整数返回错误', () => {
    expect(validatePlanAdjust({ plan_id: 'abc', feedback: '修改' })).toBe('plan_id 必须为正整数')
  })

  it('feedback 为空返回错误', () => {
    expect(validatePlanAdjust({ plan_id: 1, feedback: '' })).toBe('feedback 不能为空')
  })

  it('feedback 仅空格返回错误', () => {
    expect(validatePlanAdjust({ plan_id: 1, feedback: '   ' })).toBe('feedback 不能为空')
  })
})

// ============================================================================
// validateArticleGenerate
// ============================================================================
describe('validateArticleGenerate', () => {
  it('无 category 返回 null', () => {
    expect(validateArticleGenerate({})).toBe(null)
  })

  it('合法 category 返回 null', () => {
    expect(validateArticleGenerate({ category: '饮食指导' })).toBe(null)
  })

  it('category 为空字符串返回错误', () => {
    expect(validateArticleGenerate({ category: '' })).toBe('category 必须为非空字符串')
  })

  it('category 为非字符串返回错误', () => {
    expect(validateArticleGenerate({ category: 123 })).toBe('category 必须为非空字符串')
  })
})
