-- ============================================================================
-- 糖尿病预治智能助手 —— KingbaseES DDL 初始化脚本
-- ============================================================================
-- 用途：创建全部 10 张业务表 + 索引
-- 目标数据库：KingbaseES V8R6+（PostgreSQL 12 兼容内核）
-- 使用方法：由 KingbaseAdapter.init() 自动执行，无需手动运行
--
-- 重要：表按 FK 依赖拓扑顺序排列，确保父表先于子表创建
-- ============================================================================

-- 1. 用户表（users）—— 无外键依赖，最先创建
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(255) NOT NULL UNIQUE,
    password        VARCHAR(255) NOT NULL,
    avatar          VARCHAR(500),
    role            VARCHAR(10)  NOT NULL DEFAULT 'user'
                        CHECK(role IN ('user', 'admin')),
    password_changed INTEGER NOT NULL DEFAULT 0
                        CHECK(password_changed IN (0, 1)),
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. 医生信息表（doctor_information）
CREATE TABLE IF NOT EXISTS doctor_information (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    department  VARCHAR(100) NOT NULL,
    title       VARCHAR(100) NOT NULL,
    description TEXT DEFAULT '',
    avatar      VARCHAR(500),
    chat_token  VARCHAR(255) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. 糖尿病类型表（diabetes_types）
CREATE TABLE IF NOT EXISTS diabetes_types (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL UNIQUE,
    image         VARCHAR(500),
    pathogenesis  TEXT NOT NULL,
    manifestation TEXT NOT NULL,
    treatment     TEXT NOT NULL
);

-- 4. 科普文章表（articles）
CREATE TABLE IF NOT EXISTS articles (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER,
    title        VARCHAR(500) NOT NULL,
    cover        VARCHAR(1000),
    author       VARCHAR(100) NOT NULL DEFAULT 'AI健康助手',
    content      TEXT NOT NULL,
    category     VARCHAR(50) NOT NULL DEFAULT '糖尿病知识科普',
    tags         JSONB NOT NULL DEFAULT '[]',
    summary      TEXT NOT NULL DEFAULT '',
    views        INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. 文章收藏表（article_collections）
CREATE TABLE IF NOT EXISTS article_collections (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    article_id INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
    UNIQUE(user_id, article_id)
);

-- 6. 用户风险信息表（user_risk_info）
CREATE TABLE IF NOT EXISTS user_risk_info (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER NOT NULL,
    age              INTEGER NOT NULL,
    gender           VARCHAR(10) NOT NULL CHECK(gender IN ('male', 'female')),
    height           REAL NOT NULL,
    weight           REAL NOT NULL,
    family_history   VARCHAR(10) NOT NULL CHECK(family_history IN ('yes', 'no')),
    waist            REAL,
    systolic_bp      REAL,
    pregnancy        INTEGER DEFAULT NULL CHECK(pregnancy IN (0, 1) OR pregnancy IS NULL),
    raw_input        JSONB,
    diabetes_history VARCHAR(20) NOT NULL CHECK(diabetes_history IN ('healthy', 'prediabetes', 'diagnosed')),
    diabetes_type    VARCHAR(20) CHECK(diabetes_type IN ('type1', 'type2', 'gestational', 'other') OR diabetes_type IS NULL),
    result           JSONB,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 7. 生活方案表（life_plans）
CREATE TABLE IF NOT EXISTS life_plans (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    plan_id    INTEGER NOT NULL,
    plan_type  VARCHAR(10) NOT NULL CHECK(plan_type IN ('diet', 'exercise', 'other')),
    order_num  INTEGER NOT NULL DEFAULT 0,
    time_desc  VARCHAR(100) DEFAULT '',
    title      VARCHAR(500) NOT NULL,
    content    TEXT NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 8. 生活建议表（life_advice）
CREATE TABLE IF NOT EXISTS life_advice (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    title      VARCHAR(500) NOT NULL,
    tags       JSONB NOT NULL DEFAULT '[]',
    content    TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 9. 打卡记录表（punch_in）
CREATE TABLE IF NOT EXISTS punch_in (
    id                SERIAL PRIMARY KEY,
    user_id           INTEGER NOT NULL,
    plan_item_id      INTEGER,
    punch_time        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    punch_type        VARCHAR(10) NOT NULL CHECK(punch_type IN ('diet', 'exercise')),
    completion_status VARCHAR(15) NOT NULL CHECK(completion_status IN ('completed', 'uncompleted')),
    remarks           TEXT DEFAULT '',
    FOREIGN KEY (user_id)      REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_item_id) REFERENCES life_plans(id) ON DELETE SET NULL
);

-- 10. 管理员操作日志表（admin_logs）—— 最后创建（依赖 users）
CREATE TABLE IF NOT EXISTS admin_logs (
    id                SERIAL PRIMARY KEY,
    operator_id       INTEGER NOT NULL,
    operation_type    VARCHAR(50) NOT NULL,
    operation_time    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    operation_content TEXT NOT NULL,
    operation_result  TEXT DEFAULT '',
    FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- 索引
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
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
