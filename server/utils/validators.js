function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    return '用户名不能为空';
  }
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 50) {
    return '用户名长度需在3-50个字符之间';
  }
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(trimmed)) {
    return '用户名仅允许字母、数字、下划线和汉字';
  }
  return null;
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return '密码不能为空';
  }
  if (password.length < 8) {
    return '密码长度不少于8位';
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return '密码需包含字母和数字';
  }
  return null;
}

function validateRegister(username, password) {
  const usernameError = validateUsername(username);
  if (usernameError) return usernameError;
  const passwordError = validatePassword(password);
  if (passwordError) return passwordError;
  return null;
}

function validateLogin(username, password) {
  if (!username || typeof username !== 'string') {
    return '用户名不能为空';
  }
  if (!password || typeof password !== 'string') {
    return '密码不能为空';
  }
  return null;
}

function validateProfile(username, avatar) {
  const hasUsername = typeof username === 'string' && username.trim().length > 0;
  const hasAvatar = typeof avatar === 'string' && avatar.trim().length > 0;

  if (hasUsername) {
    const usernameError = validateUsername(username);
    if (usernameError) return usernameError;
  }

  if (!hasUsername && !hasAvatar) {
    return '至少需要修改一个字段';
  }

  return null;
}

function validateRiskPredict(body) {
  if (!body || typeof body !== 'object') {
    return '请求体不能为空';
  }
  if (typeof body.age !== 'number' || !Number.isInteger(body.age) || body.age <= 0) {
    return '年龄必须为正整数';
  }
  if (typeof body.gender !== 'string' || !['male', 'female'].includes(body.gender)) {
    return '性别必须为 male 或 female';
  }
  if (typeof body.height !== 'number' || body.height <= 0) {
    return '身高必须为正数';
  }
  if (typeof body.weight !== 'number' || body.weight <= 0) {
    return '体重必须为正数';
  }
  if (typeof body.family_history !== 'string' || !['yes', 'no'].includes(body.family_history)) {
    return '家族史必须为 yes 或 no';
  }
  if (typeof body.diabetes_history !== 'string' || !['healthy', 'prediabetes', 'diagnosed'].includes(body.diabetes_history)) {
    return '糖尿病史必须为 healthy、prediabetes 或 diagnosed';
  }
  if (body.waist !== undefined && body.waist !== null) {
    if (typeof body.waist !== 'number' || body.waist <= 0) {
      return '腰围必须为正数';
    }
  }
  if (body.systolic_bp !== undefined && body.systolic_bp !== null) {
    if (typeof body.systolic_bp !== 'number' || body.systolic_bp <= 0) {
      return '收缩压必须为正数';
    }
  }
  if (body.diabetes_type !== undefined && body.diabetes_type !== null) {
    if (typeof body.diabetes_type !== 'string' || !['type1', 'type2', 'gestational', 'other'].includes(body.diabetes_type)) {
      return '糖尿病类型必须为 type1、type2、gestational 或 other';
    }
  }
  return null;
}

function validatePlanGenerate(body) {
  if (!body || typeof body !== 'object') {
    return '请求体不能为空';
  }
  const { health_info, preferences } = body;
  if (!health_info || typeof health_info !== 'object') {
    return 'health_info 不能为空';
  }
  if (typeof health_info.age !== 'number' || health_info.age <= 0) {
    return 'health_info.age 必须为正数';
  }
  if (typeof health_info.gender !== 'string' || !['male', 'female'].includes(health_info.gender)) {
    return 'health_info.gender 必须为 male 或 female';
  }
  if (typeof health_info.height !== 'number' || health_info.height <= 0) {
    return 'health_info.height 必须为正数';
  }
  if (typeof health_info.weight !== 'number' || health_info.weight <= 0) {
    return 'health_info.weight 必须为正数';
  }
  if (!preferences || typeof preferences !== 'object') {
    return 'preferences 不能为空';
  }
  if (typeof preferences.dietary !== 'string' || preferences.dietary.trim().length === 0) {
    return 'preferences.dietary 不能为空';
  }
  if (typeof preferences.activity !== 'string' || preferences.activity.trim().length === 0) {
    return 'preferences.activity 不能为空';
  }
  return null;
}

function validatePunch(body) {
  if (!body || typeof body !== 'object') {
    return '请求体不能为空';
  }
  if (!body.plan_id || !(Number.isInteger(body.plan_id) && body.plan_id > 0)) {
    return 'plan_id 必须为正整数';
  }
  if (!body.punch_type || !['diet', 'exercise'].includes(body.punch_type)) {
    return 'punch_type 必须为 diet 或 exercise';
  }
  if (!body.completion_status || !['completed', 'uncompleted'].includes(body.completion_status)) {
    return 'completion_status 必须为 completed 或 uncompleted';
  }
  if (body.remarks !== undefined && typeof body.remarks !== 'string') {
    return 'remarks 必须为字符串';
  }
  return null;
}

function validatePlanAdjust(body) {
  if (!body || typeof body !== 'object') {
    return '请求体不能为空';
  }
  if (typeof body.plan_id !== 'number' || !Number.isInteger(body.plan_id) || body.plan_id <= 0) {
    return 'plan_id 必须为正整数';
  }
  if (typeof body.feedback !== 'string' || body.feedback.trim().length === 0) {
    return 'feedback 不能为空';
  }
  return null;
}

function validateArticleGenerate(body) {
  if (!body || typeof body !== 'object') {
    return '请求体不能为空';
  }
  if (body.category !== undefined) {
    if (typeof body.category !== 'string' || body.category.trim().length === 0) {
      return 'category 必须为非空字符串';
    }
  }
  return null;
}

module.exports = {
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
};
