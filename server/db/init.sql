-- 1. 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    avatar TEXT DEFAULT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
    password_changed INTEGER NOT NULL DEFAULT 0 CHECK(password_changed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 2. 医生信息表
CREATE TABLE IF NOT EXISTS doctor_information (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    avatar TEXT DEFAULT NULL,
    chat_token TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 3. 科普文章表
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER DEFAULT NULL,
    title TEXT NOT NULL,
    cover TEXT DEFAULT NULL,
    author TEXT NOT NULL DEFAULT 'AI健康助手',
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '糖尿病知识科普',
    tags TEXT NOT NULL DEFAULT '[]',
    summary TEXT NOT NULL DEFAULT '',
    views INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. 糖尿病类型表
CREATE TABLE IF NOT EXISTS diabetes_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    image TEXT DEFAULT NULL,
    pathogenesis TEXT NOT NULL,
    manifestation TEXT NOT NULL,
    treatment TEXT NOT NULL
);

-- 5. 文章收藏表
CREATE TABLE IF NOT EXISTS article_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    article_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
    UNIQUE(user_id, article_id)
);

-- 6. 用户风险信息表
CREATE TABLE IF NOT EXISTS user_risk_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    age INTEGER NOT NULL,
    gender TEXT NOT NULL CHECK(gender IN ('male', 'female')),
    height REAL NOT NULL,
    weight REAL NOT NULL,
    family_history TEXT NOT NULL CHECK(family_history IN ('yes', 'no')),
    waist REAL DEFAULT NULL,
    systolic_bp REAL DEFAULT NULL,
    pregnancy INTEGER DEFAULT NULL CHECK(pregnancy IN (0, 1) OR pregnancy IS NULL),
    raw_input TEXT DEFAULT NULL,
    diabetes_history TEXT NOT NULL CHECK(diabetes_history IN ('healthy', 'prediabetes', 'diagnosed')),
    diabetes_type TEXT DEFAULT NULL CHECK(diabetes_type IN ('type1', 'type2', 'gestational', 'other') OR diabetes_type IS NULL),
    result TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 7. 生活方案表
CREATE TABLE IF NOT EXISTS life_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    plan_type TEXT NOT NULL CHECK(plan_type IN ('diet', 'exercise', 'other')),
    order_num INTEGER NOT NULL DEFAULT 0,
    time_desc TEXT DEFAULT '',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 8. 生活建议表
CREATE TABLE IF NOT EXISTS life_advice (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 9. 打卡记录表
CREATE TABLE IF NOT EXISTS punch_in (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan_item_id INTEGER DEFAULT NULL,
    punch_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    punch_type TEXT NOT NULL CHECK(punch_type IN ('diet', 'exercise')),
    completion_status TEXT NOT NULL CHECK(completion_status IN ('completed', 'uncompleted')),
    remarks TEXT DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_item_id) REFERENCES life_plans(id) ON DELETE SET NULL
);

-- 10. 管理员操作日志表
CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_id INTEGER NOT NULL,
    operation_type TEXT NOT NULL,
    operation_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    operation_content TEXT NOT NULL,
    operation_result TEXT DEFAULT '',
    FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_collections_user ON article_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_collections_article ON article_collections(article_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_user_article ON article_collections(user_id, article_id);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_created ON articles(created_at);
CREATE INDEX IF NOT EXISTS idx_risk_user ON user_risk_info(user_id);
CREATE INDEX IF NOT EXISTS idx_risk_user_created ON user_risk_info(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_plans_user ON life_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_plans_user_type ON life_plans(user_id, plan_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_user_plan ON life_plans(user_id, plan_id);
CREATE INDEX IF NOT EXISTS idx_advice_user ON life_advice(user_id);
CREATE INDEX IF NOT EXISTS idx_punch_user ON punch_in(user_id);
CREATE INDEX IF NOT EXISTS idx_punch_user_time ON punch_in(user_id, punch_time);
CREATE INDEX IF NOT EXISTS idx_punch_plan ON punch_in(plan_item_id);
CREATE INDEX IF NOT EXISTS idx_logs_operator ON admin_logs(operator_id);
CREATE INDEX IF NOT EXISTS idx_logs_time ON admin_logs(operation_time);
