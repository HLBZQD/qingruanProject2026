-- ============================================================================
-- 糖尿病预治智能助手 —— KingbaseES 数据库初始化脚本
-- ============================================================================
-- 用途：创建全部 10 张业务表 + 预填充初始数据
-- 使用方法：ksql -d diabetes_db -U system -f init_kingbase.sql
-- ============================================================================

-- 建表前先删除已存在的表（按依赖顺序）
DROP TABLE IF EXISTS admin_logs CASCADE;
DROP TABLE IF EXISTS punch_in CASCADE;
DROP TABLE IF EXISTS life_advice CASCADE;
DROP TABLE IF EXISTS life_plans CASCADE;
DROP TABLE IF EXISTS user_risk_info CASCADE;
DROP TABLE IF EXISTS article_collections CASCADE;
DROP TABLE IF EXISTS articles CASCADE;
DROP TABLE IF EXISTS diabetes_types CASCADE;
DROP TABLE IF EXISTS doctor_information CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================================
-- 第一部分：建表 DDL
-- ============================================================================

-- 1. 用户表（users）
CREATE TABLE users (
    id          SERIAL PRIMARY KEY,
    username    VARCHAR(255) NOT NULL UNIQUE,
    password    VARCHAR(255) NOT NULL,                  -- bcrypt 哈希
    avatar      VARCHAR(500),                           -- 头像相对路径
    role        VARCHAR(10)  NOT NULL DEFAULT 'user'
                    CHECK(role IN ('user', 'admin'))
);

-- 2. 医生信息表（doctor_information）
CREATE TABLE doctor_information (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    department  VARCHAR(100) NOT NULL,
    title       VARCHAR(100) NOT NULL,
    description TEXT,
    avatar      VARCHAR(500),
    chat_token  VARCHAR(255)                            -- Dify API Secret (app-XXX)
);

-- 3. 科普文章表（articles）
CREATE TABLE articles (
    id           SERIAL PRIMARY KEY,
    title        VARCHAR(500) NOT NULL,
    cover        VARCHAR(1000),
    author       VARCHAR(100),
    publish_time TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    content      TEXT,
    category     VARCHAR(50),
    view_count   INTEGER     DEFAULT 0
);

-- 4. 糖尿病类型表（diabetes_types）
CREATE TABLE diabetes_types (
    id        SERIAL PRIMARY KEY,
    name      VARCHAR(100) NOT NULL,
    image     VARCHAR(500),
    etiology  TEXT,
    symptoms  TEXT,
    treatment TEXT
);

-- 5. 文章收藏表（article_collections）
CREATE TABLE article_collections (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    article_id INTEGER NOT NULL,
    FOREIGN KEY (user_id)    REFERENCES users(id),
    FOREIGN KEY (article_id) REFERENCES articles(id),
    UNIQUE(user_id, article_id)
);

-- 6. 用户风险信息表（user_risk_info）
CREATE TABLE user_risk_info (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL,
    age             INTEGER,
    gender          VARCHAR(10),
    height          REAL,
    weight          REAL,
    family_history  VARCHAR(10),
    waist           REAL,
    systolic_bp     INTEGER,
    pregnancy       INTEGER DEFAULT 0,
    raw_input       TEXT,
    disease_type    VARCHAR(50),
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 7. 生活方案表（life_plans）
CREATE TABLE life_plans (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    type       VARCHAR(10) NOT NULL
                    CHECK(type IN ('饮食', '运动', '其他')),
    sort_order INTEGER DEFAULT 0,
    time       VARCHAR(100),
    title      VARCHAR(500),
    content    TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 8. 生活建议表（life_advice）
CREATE TABLE life_advice (
    id      SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title   VARCHAR(500),
    tags    VARCHAR(500),
    content TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 9. 打卡记录表（punch_in）
CREATE TABLE punch_in (
    id                SERIAL PRIMARY KEY,
    user_id           INTEGER NOT NULL,
    plan_id           INTEGER,
    punch_time        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    punch_type        VARCHAR(10) NOT NULL
                            CHECK(punch_type IN ('饮食', '运动')),
    completion_status VARCHAR(10) NOT NULL
                            CHECK(completion_status IN ('已完成', '未完成')),
    remarks           TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (plan_id) REFERENCES life_plans(id)
);

-- 10. 管理员操作日志表（admin_logs）
CREATE TABLE admin_logs (
    id               SERIAL PRIMARY KEY,
    admin_user_id    INTEGER NOT NULL,
    operation_type   VARCHAR(50) NOT NULL,
    operation_time   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    operation_content TEXT,
    operation_result TEXT,
    FOREIGN KEY (admin_user_id) REFERENCES users(id)
);

-- ============================================================================
-- 第二部分：初始数据（种子数据）
-- ============================================================================

-- 2.1 管理员账号（默认密码: admin123，首次登录后强制修改）
INSERT INTO users (username, password, role) VALUES
('admin', '$2b$10$/4lVVaDbYlfHAZAJrkELX.RQEE4/YNfsAgNW7SkkDZbZwfAL5D4cC', 'admin');

-- 2.2 医生信息（至少 3 位不同科室）
INSERT INTO doctor_information (name, department, title, description, avatar, chat_token) VALUES
(
    '张明华', '内分泌科', '主任医师',
    '擅长糖尿病早期筛查与个体化治疗方案制定，从事内分泌代谢疾病临床工作 20 余年。',
    '/static/images/doctors/doctor_1.jpg',
    NULL
),
(
    '李雅文', '营养科', '副主任医师',
    '专注于糖尿病饮食管理与营养干预，擅长制定个性化膳食方案与生活方式指导。',
    '/static/images/doctors/doctor_2.jpg',
    NULL
),
(
    '王志强', '运动医学科', '主治医师',
    '专业方向为运动处方设计与慢病运动康复，尤其在糖尿病运动干预领域有丰富经验。',
    '/static/images/doctors/doctor_3.jpg',
    NULL
);

-- 2.3 糖尿病类型科普内容（4 种类型）
INSERT INTO diabetes_types (name, image, etiology, symptoms, treatment) VALUES
(
    '1 型糖尿病',
    '/static/images/diabetes/type_1.jpg',
    '自身免疫性糖尿病，因免疫系统错误攻击并破坏胰岛 β 细胞，导致胰岛素绝对缺乏。多发于儿童和青少年，发病急骤。遗传易感性与环境因素（如病毒感染）共同作用。',
    '典型"三多一少"症状：多饮、多尿、多食、体重下降。起病急，常以酮症酸中毒为首发表现。疲劳乏力，视力模糊，伤口愈合缓慢。',
    '需终身胰岛素替代治疗，包括每日多次胰岛素注射或胰岛素泵。严格血糖监测，合理饮食与运动配合。定期筛查并发症（视网膜病变、肾病、神经病变等）。'
),
(
    '2 型糖尿病',
    '/static/images/diabetes/type_2.jpg',
    '胰岛素抵抗为主，伴胰岛素相对缺乏。与遗传、超重/肥胖、缺乏运动、不合理饮食等生活方式密切相关。占糖尿病总数的 90% 以上，多见于中老年人，但呈年轻化趋势。',
    '起病隐匿，早期可无明显症状。"三多一少"症状较轻或仅部分出现。常伴肥胖、高血压、血脂异常。部分患者因并发症（视力问题、皮肤感染、手足麻木）就诊而发现。',
    '生活方式干预为基础：合理控制饮食、增加体力活动、减轻体重。口服降糖药（二甲双胍、磺脲类、DPP-4 抑制剂等）。病情进展后可能需胰岛素治疗。综合管理血压、血脂等心血管危险因素。'
),
(
    '妊娠期糖尿病',
    '/static/images/diabetes/type_3.jpg',
    '妊娠期间首次发生或发现的糖代谢异常。胎盘分泌的激素（人胎盘泌乳素、雌激素、孕激素等）拮抗胰岛素，使胰岛素敏感性下降。通常在妊娠 24-28 周筛查发现。',
    '多数无明显自觉症状，通过产前糖耐量筛查（OGTT）发现。可能出现口渴、多饮、多尿、反复感染等非特异性症状。空腹血糖和餐后血糖升高。',
    '医学营养治疗（MNT）为首选：由营养师制定个体化饮食方案。合理运动（餐后散步等）。若饮食运动不足以控制血糖，需使用胰岛素治疗（口服降糖药一般不推荐）。产后多数可恢复正常，但未来发生 2 型糖尿病的风险显著升高，应定期随访。'
),
(
    '其他特殊类型糖尿病',
    '/static/images/diabetes/type_4.jpg',
    '包括多种原因导致的继发性糖尿病：MODY（青少年发病的成年型糖尿病，单基因遗传）、胰腺疾病（胰腺炎、胰腺切除等）、内分泌疾病（库欣综合征、肢端肥大症）、药物或化学物质诱导等。',
    '临床表现因原发病而异，高血糖症状可能不典型。MODY 患者发病年龄较轻，有家族聚集倾向。胰腺源性糖尿病常伴脂肪泻、腹痛等胰腺外分泌功能不全表现。',
    '针对原发病治疗为核心。根据具体类型选择降糖方案：MODY 中部分亚型（如 HNF1A 突变）对磺脲类药物敏感。胰岛素治疗适用于胰腺广泛破坏或胰岛素分泌严重不足的情况。须同时管理原发疾病与血糖。'
);

-- 2.4 示例科普文章（3 篇，Markdown 格式正文）
INSERT INTO articles (title, author, content, category, view_count) VALUES
(
    '糖尿病饮食管理的五大误区',
    'AI 健康助手',
    '## 误区一：糖尿病患者不能吃水果

许多人认为水果含糖量高，糖尿病患者应当完全避免。这是一个常见的误解。水果中含有丰富的维生素、矿物质和膳食纤维，对健康有益。关键在于**控制分量**和**选择时机**——建议在两餐之间食用低升糖指数的水果（如苹果、梨、柚子），每次不超过 150 克。

## 误区二：无糖食品可以随意吃

标有"无糖"的食品可能不含蔗糖，但可能含有淀粉、脂肪等其他产能物质。过量摄入仍会导致血糖升高和体重增加。购买时应查看营养标签，关注**总碳水化合物含量**。

## 误区三：只控制主食不控制副食

部分患者严格控制米饭、面食摄入，却忽视了肉类、油脂和坚果的摄入。这些食物虽然不直接含糖，但过量摄入会导致体重增加、胰岛素抵抗加剧。**均衡控制总热量**才是关键。

## 误区四：饮食控制等于饥饿疗法

过度节食不仅可能导致低血糖，还会造成营养不良、肌肉分解和免疫力下降。科学饮食管理应保证每日最低热量摄入，**合理分配三大营养素**比例（碳水化合物 45-60%、蛋白质 15-20%、脂肪 25-35%）。

## 误区五：吃粗粮一定比细粮好

粗粮富含膳食纤维，升糖指数较低，适合糖尿病患者食用。但**粗粮同样含碳水化合物**，过量食用仍会升高血糖。建议粗细搭配，粗粮占主食总量的 1/3 至 1/2 为宜。

---

糖尿病患者应在专业医师和营养师的指导下制定个体化饮食方案，根据自身血糖监测结果动态调整。',
    '饮食指导',
    1280
),
(
    '科学运动降血糖——给糖尿病患者的运动处方',
    'AI 健康助手',
    '## 为什么运动对糖尿病患者如此重要

规律运动可以增加肌肉对葡萄糖的摄取和利用，提高胰岛素敏感性，有助于控制血糖。研究表明，坚持规律运动的 2 型糖尿病患者，糖化血红蛋白（HbA1c）平均可降低 0.6%-0.8%。

## 运动类型选择

### 有氧运动（每周至少 150 分钟）
- **快走**：最安全便捷的运动方式，每天 30-45 分钟
- **游泳**：对关节友好，适合肥胖或有关节问题的患者
- **骑自行车**：中等强度即可获得良好效果
- **广场舞/健身操**：兼具社交功能，提高依从性

### 抗阻运动（每周 2-3 次）
- 弹力带训练、哑铃操、靠墙静蹲等
- 增加肌肉量，提高基础代谢率和葡萄糖储备能力

## 运动注意事项

1. **运动前测血糖**：血糖 < 5.6 mmol/L 应适当进食后再运动；血糖 > 16.7 mmol/L 应暂缓运动
2. **选择合适的运动时间**：建议在餐后 1 小时开始运动，避免空腹运动
3. **随身携带含糖食物**：糖果、饼干等，以备发生低血糖时及时补充
4. **运动前后充分热身和整理**：各 5-10 分钟，避免运动损伤
5. **穿透气的棉袜和合脚的运动鞋**：每天检查足部有无破损、水泡

## 运动禁忌

- 空腹血糖 > 16.7 mmol/L 伴酮症
- 严重糖尿病视网膜病变（避免剧烈运动和头低位动作）
- 严重糖尿病足（避免负重运动）
- 合并严重心脑血管疾病者应在医生评估后制定运动方案

---

运动方案的制定应因人而异，建议在医生和运动指导师指导下，根据个人年龄、体能、并发症情况制定个体化运动处方。',
    '运动指南',
    960
),
(
    '糖尿病早期筛查——这些风险因素你中了几条？',
    'AI 健康助手',
    '## 为什么要重视糖尿病早期筛查

我国糖尿病患者超过 1.4 亿，其中约半数患者未被确诊。2 型糖尿病在发病前有长达 5-10 年的"糖尿病前期"阶段，此时干预可有效延缓甚至逆转糖尿病进程。早期发现、早期干预是降低糖尿病危害的关键。

## 《中国 2 型糖尿病防治指南》风险评分

以下因素可帮助评估您患 2 型糖尿病的风险：

| 风险因素 | 评分标准 |
|---------|--------|
| 年龄 | 45 岁及以上风险增加 |
| 体重指数（BMI） | ≥ 24 kg/m² 为超重，≥ 28 kg/m² 为肥胖 |
| 腰围 | 男性 ≥ 90 cm，女性 ≥ 85 cm 为腹型肥胖 |
| 家族史 | 一级亲属（父母、兄弟姐妹、子女）中有糖尿病患者 |
| 高血压 | 收缩压 ≥ 140 mmHg 或有高血压病史 |
| 缺乏运动 | 每周中等强度体力活动 < 150 分钟 |
| 既往高血糖 | 曾有空腹血糖异常或糖耐量异常 |

## 需要筛查的人群

根据《中国 2 型糖尿病防治指南（2020 版）》，以下成人应考虑糖尿病筛查：

- **所有 40 岁以上成人**，建议每年筛查空腹血糖
- 具有上述任一项风险因素的成人，**无论年龄**均应筛查
- **妊娠期糖尿病史**的女性，产后应定期随访
- 出现**多饮、多尿、多食、体重下降**等典型症状者应立即检查

## 筛查方法

1. **空腹血糖（FPG）**：禁食 8 小时以上后抽血检测，≥ 7.0 mmol/L 提示糖尿病
2. **口服葡萄糖耐量试验（OGTT）**：服糖后 2 小时血糖 ≥ 11.1 mmol/L 提示糖尿病
3. **糖化血红蛋白（HbA1c）**：反映近 2-3 个月平均血糖水平，≥ 6.5% 提示糖尿病

## 行动起来

您可以使用本平台的**糖尿病风险预测**工具完成自我评估。如评估结果显示高风险，建议尽早前往正规医院内分泌科就诊，进行专业检查。

---

早筛查、早发现、早干预——您的健康掌握在自己手中。',
    '糖尿病知识科普',
    1560
);

-- ============================================================================
-- 第三部分：验证查询
-- ============================================================================

-- 预期行数：users=1, doctor_information=3, diabetes_types=4, articles=3
SELECT 'users'              AS table_name, COUNT(*) AS row_count FROM users
UNION ALL
SELECT 'doctor_information', COUNT(*) FROM doctor_information
UNION ALL
SELECT 'diabetes_types',     COUNT(*) FROM diabetes_types
UNION ALL
SELECT 'articles',           COUNT(*) FROM articles
UNION ALL
SELECT 'article_collections', COUNT(*) FROM article_collections
UNION ALL
SELECT 'user_risk_info',     COUNT(*) FROM user_risk_info
UNION ALL
SELECT 'life_plans',         COUNT(*) FROM life_plans
UNION ALL
SELECT 'life_advice',        COUNT(*) FROM life_advice
UNION ALL
SELECT 'punch_in',           COUNT(*) FROM punch_in
UNION ALL
SELECT 'admin_logs',         COUNT(*) FROM admin_logs;
