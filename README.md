# 糖尿病预治智能助手

基于 Vue3 + Express + Dify/DeepSeek 的全栈智慧医疗应用。面向普通人群和糖尿病患者，提供糖尿病风险评估、个性化生活方案、AI 健康助手、医师在线咨询、健康资讯科普等一站式糖尿病预防与健康管理服务。

## 项目简介

“糖尿病预治智能助手”是 2026 年青软实训（东北大学软件学院）的核心实训项目，以 **AI 智能为驱动核心**，依托 DeepSeek 大语言模型和 Dify 智能体开发平台，为用户提供全方位的糖尿病预防与健康管理服务。

### 产品特征

- **AI 驱动**：所有智能功能（对话、方案生成、风险分析、资讯生成）由 Dify 平台编排 DeepSeek 大模型完成
- **移动端优先**：Web 前端采用 Vue 3 + Vant 4 移动端组件库，优先适配手机屏幕尺寸
- **鸿蒙原生并行**：独立开发 HarmonyOS ArkUI 原生应用（独立并行轨道 A2），与 Web 端功能对齐
- **双数据库适配**：通过 DatabaseAdapter 适配器模式在 SQLite（开发环境）和 KingbaseES（生产/国产化环境）之间无缝切换
- **安全鉴权**：基于 JWT（24 小时有效期）的身份认证体系，密码 bcrypt 哈希存储，敏感令牌 AES-256-GCM 加密
- **医学免责**：所有 AI 生成的建议和评估结果均附带免责声明，不作为医疗诊断依据

### 技术栈

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **Web 前端** | Vue 3 + TypeScript | 3.x / 5.x | SPA 渐进式框架 |
| | Vite | 8.x | 构建工具，HMR |
| | Vue Router | 4.x | history 模式路由 |
| | Pinia | 3.x | 响应式状态管理 |
| | Tailwind CSS | 3.x | 原子化 CSS |
| | Vant | 4.x | 移动端 UI 组件库 |
| | marked + DOMPurify | 18.x / 3.x | Markdown 渲染 + XSS 防护 |
| **鸿蒙前端** | ArkTS + ArkUI | API 12+ | 鸿蒙原生 UI（独立并行轨道） |
| **后端** | Node.js + Express | 18 LTS / 4.x | REST API 服务 |
| | better-sqlite3 | 9.x | SQLite 同步驱动 |
| | pg | 8.x | KingbaseES/PostgreSQL 驱动 |
| | jsonwebtoken + bcryptjs | 9.x / 2.x | JWT 认证 + 密码哈希 |
| **数据库** | SQLite | 3 | 开发/测试环境 |
| | KingbaseES | V8R6 | 生产/国产化环境 |
| **AI** | Dify 平台 | SaaS | 工作流编排 + Agent 管理 + 知识库 |
| | DeepSeek | API | 大模型推理（通过 Dify 间接调用） |

---

## 功能说明

### 功能模块总览

| 模块 | 说明 |
|------|------|
| 系统首页 | Banner 轮播、医生团队展示、科普文章列表、糖尿病类型科普 |
| 医师咨询 | AI 虚拟医师一对一对话（SSE 流式响应），对话历史管理 |
| 糖尿病风险预测 | 3 步向导式表单，基于《中国 2 型糖尿病防治指南》评分体系，AI 分析输出风险等级与建议 |
| 生活方案 | AI 生成个性化饮食（4 餐）+ 运动（3 时段）方案，支持方案调整 |
| 健康资讯 | AI 生成健康科普文章，支持分页浏览、分类筛选、收藏/取消收藏 |
| 打卡记录与分析 | 每日方案打卡，AI 统计分析完成率、趋势与依从性评语 |
| AI 智能助手 | 全局 FAB 悬浮按钮，自然语言对话，支持知识问答、方案生成、个人信息查询 |
| 智能管理（管理员） | 自然语言操作后台数据库（CRUD），操作日志审计 |

### 1. 系统首页

- **Banner 轮播**：Swiper 组件实现自动轮播，展示平台核心价值与健康宣传
- **医生团队展示**：展示至少 3 位不同科室的 AI 虚拟医师（内分泌科、营养科、运动医学科）
- **健康科普文章列表**：分页 + 分类筛选
- **糖尿病类型科普入口**：1 型、2 型、妊娠期、其他特殊类型糖尿病，含病因、表现、治疗说明

### 2. 医师咨询

- 每位医生在 Dify 平台上是独立的聊天助手应用，拥有独立的系统提示词和知识库
- SSE 流式响应，逐字返回 AI 回复
- 会话管理：Pinia chatStore 按医生 ID 维护对话映射，上下文独立保持
- 对话界面顶部持续显示免责提示

### 3. 糖尿病风险预测

- 3 步向导式表单：病史状态 → 健康信息 → 结果展示
- 基于《中国 2 型糖尿病防治指南（2020 版）》评分体系（0-51 分）
- 表单数据通过 Pinia riskFormStore + sessionStorage 跨步骤持久化
- 输出：风险评分、风险等级（低/中/高）、匹配糖尿病类型、个性化建议

### 4. 生活方案

- AI 生成个性化饮食方案（早餐/午餐/晚餐/加餐）+ 运动方案（晨间/晚间/周末）
- 方案调整采用逻辑过期机制，旧方案保留以保障打卡记录完整性
- 每条方案项提供打卡按钮
- 防重复生成：服务端 30 秒内存幂等锁

### 5. 健康资讯

- Dify 工作流两阶段生成：先推荐分类标签，用户选择后生成完整文章
- 文章浏览：卡片列表 → 详情页（Markdown 渲染 + XSS 防护）
- 支持收藏/取消收藏，查看收藏列表

### 6. 打卡记录与分析

- 记录每日饮食/运动打卡，按方案项关联
- AI 分析（Dify 工作流 + DeepSeek）：按类型完成率、近 7 天趋势、依从性评语
- 支持按日期范围和打卡类型筛选，分页展示

### 7. AI 智能助手（FAB）

- 右下角全局悬浮按钮，从任意页面一键唤起
- Dify Agent（ReAct 模式）驱动，挂载 8 个工具：个人信息查询、风险历史、打卡记录、方案查询、健康建议读写、知识库检索
- 支持自然语言：知识问答、风险预测触发、方案生成、打卡查询等
- 未登录用户点击 FAB 展示登录引导

### 8. 智能管理（管理员）

- 管理员通过自然语言指令操作后台数据库（查询、新增、修改、删除）
- Dify Agent（ReAct 模式）驱动，挂载 12 个参数化工具
- 双认证：JWT + API Key
- 所有操作记录写入 admin_logs 表，不可删除
- 参数化查询防 SQL 注入，行级权限约束

### 用户角色

| 角色 | 说明 |
|------|------|
| 普通用户 (user) | 浏览科普内容、AI 医师对话、风险预测、生活方案、打卡、资讯浏览与收藏、AI 智能助手 |
| 管理员 (admin) | 自然语言管理后台数据、查看操作日志、首次登录强制改密 |

---

## 系统架构

```
┌──────────────────────────────────────────────────────────────────┐
│                    客户端层 (Client Tier)                          │
│  ┌──────────────────────┐       ┌──────────────────────┐         │
│  │  Vue3 SPA (Web端)     │       │  鸿蒙 ArkUI App      │         │
│  │  Vite 8 + Pinia       │       │  ArkTS + ArkUI       │         │
│  │  Vue Router 4          │       │  @ohos.router        │         │
│  │  Tailwind CSS + Vant4  │       │  DesignTokens         │         │
│  └──────────┬───────────┘       └──────────┬───────────┘         │
│             │ HTTP/SSE                     │ HTTP/SSE             │
└─────────────┼──────────────────────────────┼──────────────────────┘
              ▼                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Express 中间层 (Server Tier)                       │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐     │
│  │ JWT/Auth  │  │ 14 Routes │  │ Validators│  │ ErrHandler│     │
│  └───────────┘  └─────┬─────┘  └───────────┘  └───────────┘     │
│                        │                                          │
│             ┌──────────▼───────────┐  ┌────────────────────┐     │
│             │    Dify 服务集成层    │  │   数据库适配层 (DB)  │     │
│             │  callWorkflowBlocking│  │   DatabaseAdapter   │     │
│             │  proxyDifySSE        │  │  ├─ SqliteAdapter   │     │
│             └──────────┬───────────┘  │  └─ KingbaseAdapter │     │
│                        │              └──────────┬──────────┘     │
└────────────────────────┼──────────────────────────┼───────────────┘
                         │              ┌───────────┴───────────┐
                         ▼              ▼                       ▼
              ┌──────────────────┐  ┌──────────┐  ┌──────────────────┐
              │  Dify AI 平台    │  │ SQLite 3 │  │ KingbaseES V8R6  │
              │  工作流 + Agent  │  │ (开发环境)│  │ (生产/国产化)     │
              └────────┬─────────┘  └──────────┘  └──────────────────┘
                       │
              ┌────────┴─────────┐
              │ DeepSeek 大模型  │
              └──────────────────┘
```

---

## 项目结构

```
qingruanProject2026/
├── index.html                    # Vite SPA 入口
├── package.json                  # 依赖管理（单仓库）
├── vite.config.ts                # Vite 构建配置（代理 /api → :3000）
├── server.js                     # Express 启动入口
├── .env / .env.example           # 环境变量（含 DB_TYPE 切换）
│
├── src/                          # Web 前端 (Vue3 + TypeScript)
│   ├── App.vue                   # 根组件
│   ├── main.ts                   # 入口 (createApp → Pinia → Router)
│   ├── router/index.ts           # 路由配置 + 前置守卫
│   ├── stores/                   # Pinia Store (6 个)
│   │   ├── authStore.ts          #   登录态管理
│   │   ├── chatStore.ts          #   对话状态 + SSE 控制
│   │   ├── riskFormStore.ts      #   风险表单
│   │   ├── homeStore.ts          #   首页缓存
│   │   ├── lifePlanStore.ts      #   方案状态
│   │   └── punchStore.ts         #   打卡状态
│   ├── views/                    # 14 个页面组件
│   │   ├── Home.vue              #   首页
│   │   ├── Consultation.vue      #   医师咨询
│   │   ├── DoctorChatView.vue    #   医师对话
│   │   ├── LifePlan.vue          #   生活方案
│   │   ├── NewsView.vue          #   健康资讯
│   │   ├── ArticleDetailView.vue #   文章详情
│   │   ├── Profile.vue           #   个人中心
│   │   ├── Risk.vue              #   风险预测
│   │   ├── Punch.vue             #   打卡记录
│   │   ├── HealthAdvice.vue      #   健康建议
│   │   ├── Admin.vue             #   智能管理
│   │   ├── Login.vue             #   登录/注册
│   │   └── ChangePassword.vue    #   强制改密
│   ├── components/               # 共享组件 (8+)
│   │   ├── TabBar.vue            #   底部 Tab 导航
│   │   ├── FabButton.vue         #   FAB 悬浮按钮
│   │   ├── AiChatDialog.vue      #   AI 助手对话弹窗
│   │   ├── SkeletonLoader.vue    #   骨架屏
│   │   ├── ErrorRetry.vue        #   错误重试
│   │   ├── EmptyState.vue        #   空数据占位
│   │   └── DisclaimerBar.vue     #   医学免责声明
│   ├── composables/              # 组合式函数 (13 个)
│   ├── types/                    # TS 类型定义
│   ├── utils/                    # 工具函数
│   ├── assets/                   # CSS 变量
│   └── styles/                   # 全局动画样式
│
├── server/                       # Express 后端
│   ├── app.js                    # Express 应用配置
│   ├── routes/                   # 14 个路由模块
│   │   ├── auth.js               #   认证 (/api/auth/*)
│   │   ├── user.js               #   用户 (/api/user/*)
│   │   ├── doctors.js            #   医生 (/api/doctors/*)
│   │   ├── chat.js               #   医师对话 (/api/chat/*)
│   │   ├── risk.js               #   风险预测 (/api/risk/*)
│   │   ├── plan.js               #   生活方案 (/api/plan/*)
│   │   ├── punch.js              #   打卡 (/api/punch/*)
│   │   ├── articles.js           #   资讯 (/api/articles/*)
│   │   ├── diabetes.js           #   糖尿病类型 (/api/diabetes-types/*)
│   │   ├── assistant.js          #   AI 助手 (/api/assistant/*)
│   │   ├── admin.js              #   管理 (/api/admin/*)
│   │   ├── dify.js               #   Dify 代理 (/api/dify/*)
│   │   └── upload.js             #   文件上传 (/api/upload/*)
│   ├── middleware/               # 5 个中间件
│   │   ├── auth.js               #   JWT 认证
│   │   ├── admin.js              #   管理员校验
│   │   ├── optionalAuth.js       #   可选认证
│   │   ├── difyAuth.js           #   Dify API Key 认证
│   │   └── errorHandler.js       #   统一错误处理
│   ├── services/                 # 业务逻辑层
│   │   ├── difyService.js        #   Dify 工作流调用 (blocking)
│   │   └── sseProxy.js           #   SSE 流式代理
│   ├── db/                       # 数据库层
│   │   ├── database.js           #   入口：适配器工厂
│   │   ├── sql.js                #   SQL 方言辅助
│   │   ├── init.sql              #   SQLite DDL + 索引
│   │   ├── seed.sql              #   SQLite 种子数据
│   │   ├── init_kingbase_ddl.sql #   KingbaseES DDL
│   │   ├── init_kingbase_seed.sql#   KingbaseES 种子数据
│   │   └── adapter/              #   适配器模式
│   │       ├── DatabaseAdapter.js  # 抽象接口
│   │       ├── SqliteAdapter.js    # SQLite 实现
│   │       └── KingbaseAdapter.js  # KingbaseES 实现
│   └── utils/                    # 工具模块
│
├── FrontendForHarmonyOS/         # 鸿蒙前端 (独立项目)
│   └── entry/src/main/ets/
│       ├── pages/                #   页面层
│       ├── components/           #   共享组件
│       ├── stores/               #   状态管理
│       ├── network/              #   网络层
│       └── common/               #   常量 + 持久化
│
├── static/                       # 静态资源
│   ├── images/                   #   图片 (医生/糖尿病/Banner/默认)
│   │   ├── doctors/              #   医生头像
│   │   ├── diabetes/             #   糖尿病类型图片
│   │   ├── banner/               #   轮播 Banner
│   │   └── default/              #   默认头像/封面
│   └── uploads/                  #   用户上传头像
│
├── docs/                         # 设计文档
└── data/                         # 运行时数据 (不提交)
   └── database.sqlite           #   SQLite 数据库文件
```

---

## 安装部署指南

### 环境要求

- **Node.js**: 18 LTS 及以上
- **数据库**: SQLite 3（开发）或 KingbaseES V8R6（生产）
- **操作系统**: Linux（Ubuntu 20.04 LTS / CentOS 7+）或兼容的国产 Linux 发行版
- **Web 服务器**: Nginx 1.20+（生产环境）
- **内存**: ≥ 4 GB RAM
- **磁盘**: ≥ 20 GB 可用空间
- **网络**: 稳定的互联网连接（≥ 2 Mbps），需访问 Dify API 和 DeepSeek API

### 快速开始（开发环境）

```bash
# 1. 克隆项目
git clone <repository-url>
cd qingruanProject2026

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 JWT_SECRET 和 Dify API Keys，将DIFY_API_BASE换为你自己的dify URL
# 开发环境默认使用 SQLite (DB_TYPE=sqlite)

# 4. 初始化数据库并启动后端
npm run dev

# 后端启动后自动执行：
#   - 创建 SQLite 数据库文件（/data/database.sqlite）
#   - 执行 DDL 建表（10 张表 + 18 个索引）
#   - 插入种子数据（管理员账号、医生信息、糖尿病类型、示例文章）

# 5. 启动前端开发服务器（另一个终端）
npm run dev:client
# 前端运行在 http://localhost:51258
# Vite 自动代理 /api 请求到 Express :3000

```

### 环境变量配置

```bash
# ===== 数据库配置 =====
# 数据库类型：sqlite（开发）或 kingbase（生产）
DB_TYPE=sqlite

# SQLite 配置 (DB_TYPE=sqlite 时生效)
DB_PATH=./data/database.sqlite

# KingbaseES 配置 (DB_TYPE=kingbase 时生效)
DATABASE_URL=postgresql://user:password@host:54321/database
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_IDLE_TIMEOUT=30000
DB_CONNECT_TIMEOUT=5000
DB_SSL=false
DB_SSL_REJECT_UNAUTHORIZED=true

# ===== JWT 认证 =====
JWT_SECRET=your-secret-key-here

# ===== Dify AI 平台 =====
DIFY_API_BASE=https://dify.example.com/v1
DIFY_RISK_WORKFLOW_KEY=app-xxx           # 风险预测工作流
DIFY_PLAN_WORKFLOW_KEY=app-xxx           # 生活方案工作流
DIFY_ARTICLE_WORKFLOW_KEY=app-xxx        # 文章生成工作流
DIFY_PUNCH_WORKFLOW_KEY=app-xxx          # 打卡分析工作流
DIFY_ASSISTANT_APP_KEY=app-xxx           # AI 助手 Agent
DIFY_ADMIN_AGENT_KEY=app-xxx             # 管理员 Agent
DIFY_SERVICE_API_KEY=app-xxx             # Agent 回调鉴权

# ===== 服务配置 =====
PORT=3000
UPLOAD_DIR=./static/uploads/
```
### 关于dify服务
在部署了你自己的dify平台之后，将docs/difyDSL/下的所有.yml文件导入dify平台。

**注意**：导入.yml文件后，需要你自己配置dify的model。具体请详见dify官方文档。

**注意**：要将出现在dify工作流中的所有HTTP请求节点的URL:http://host.docker.internal:3000/api/admin/execute

换成你自己后端服务器的ip地址和端口。

### 数据库切换

通过 `.env` 中的 `DB_TYPE` 环境变量一键切换：

| 环境 | DB_TYPE | 数据库 | 说明 |
|------|---------|--------|------|
| 开发 | `sqlite` | `/data/database.sqlite` | 零配置，即开即用 |
| 生产 | `kingbase` | KingbaseES V8R6 | 国产化合规，连接池 (pg.Pool) |

适配层（`DatabaseAdapter` → `SqliteAdapter` / `KingbaseAdapter`）自动处理 SQL 方言差异，应用代码无需修改。

### 生产环境部署

部署架构：**3 台服务器节点**

```
┌─────────────────────────────────────────────────────┐
│  服务器 2 (主) / 服务器 3 (备)                        │
│  Nginx 反向代理 + 负载均衡 + Keepalived                │
│  VIP: 10.0.0.100                                    │
│  ├── / → dist/ (Vite 构建产物)                        │
│  ├── /api/* → 服务器 1:3000                           │
│  └── /static/* → static/                             │
├─────────────────────────────────────────────────────┤
│  服务器 1 (数据服务器)                                │
│  ├── Nginx :80 静态文件服务                           │
│  ├── Express :3000 REST API + SSE 代理               │
│  └── KingbaseES V8R6 / SQLite                        │
└─────────────────────────────────────────────────────┘
```

**前端部署**：

```bash
# 构建生产版本
npm run build:client
# 产物在 dist/ 目录，部署到 Nginx 静态文件目录

# Nginx 配置要点 (Vue Router history 模式)
# location / {
#   try_files $uri $uri/ /index.html;
# }
```

**后端部署**：

```bash
# 1. 确保 .env 配置正确（DB_TYPE=kingbase 时需 DATABASE_URL）
# 2. 使用 PM2 或 systemd 管理进程
pm2 start server.js --name diabetes-assistant
```

### 鸿蒙前端部署

鸿蒙原生应用位于 `FrontendForHarmonyOS/` 目录，通过 DevEco Studio 编译运行。

**环境要求**：

- DevEco Studio 5.0+（API 12+）
- HarmonyOS NEXT 真机或模拟器（需华为开发者账号授权）
- hvigor 构建工具（DevEco Studio 内置）

**编译运行**：

1. 下载安装 [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/)
2. 启动 DevEco Studio → **Open** → 选择 `FrontendForHarmonyOS/` 目录
3. DevEco Studio 自动解析 `oh-package.json5` 中的 HarmonyOS SDK 依赖
4. 连接真机或启动模拟器
5. 点击顶部工具栏 **Run** 按钮编译并部署到设备

**构建产物**（可选）：

```bash
# 在 DevEco Studio 终端中执行
hvigorw assembleApp        # 编译 Debug HAP
hvigorw assembleApp --mode module -p product=default -p buildMode=release   # 编译 Release HAP
```

产物输出至 `FrontendForHarmonyOS/entry/build/` 目录。

### 预置数据

种子数据脚本 (`server/db/seed.sql` / `server/db/init_kingbase_seed.sql`) 包含：

- **管理员账号**: username: `admin`，默认密码: `admin123`（首次登录强制改密）
- **AI 虚拟医生**: 3 位不同科室（内分泌科、营养科、运动医学科），含姓名、科室、职称、简介
- **糖尿病类型科普**: 4 种类型（1 型、2 型、妊娠期、其他特殊类型），含病因、表现、治疗说明
- **示例科普文章**: 2-3 篇

---

## 使用说明

### 底部导航

| Tab | 路径 | 功能 | 需登录 |
|-----|------|------|:------:|
| 首页 | `/home` | Banner 轮播、医生团队、科普文章、糖尿病类型科普 | — |
| 咨询 | `/consultation` | 医生列表浏览 → 选择医生 → AI 对话（SSE 流式） | 对话需登录 |
| 生活方案 | `/life-plan` | AI 生成饮食/运动方案，打卡，方案调整 | 是 |
| 资讯 | `/news` | 文章列表浏览，分类筛选，生成/收藏文章 | 浏览公开，生成/收藏需登录 |
| 我的 | `/profile` | 个人中心：风险预测、打卡记录、健康建议、设置 | 是 |

### AI 智能助手

- 点击右下角 **蓝色圆形 FAB 按钮** 唤起 AI 对话弹窗
- 支持自然语言：查询个人信息、查看打卡记录、生成生活方案、健康知识问答
- 首次使用需同意医学免责声明
- 未登录用户点击 FAB 展示登录引导

### 风险预测流程

1. 进入「我的」→「糖尿病风险预测」
2. **步骤 1**：选择病史状态（健康 / 糖尿病前期 / 已确诊）
3. **步骤 2**：填写健康信息（年龄、性别、身高、体重、血压、腰围等）
4. **步骤 3**：查看 AI 分析结果（风险评分、风险等级、糖尿病类型匹配、个性化建议）

### 生活方案使用

1. 进入「生活方案」Tab
2. 点击「生成新方案」，AI 自动生成饮食（早/午/晚/加餐）和运动（晨间/晚间/周末）方案
3. 对方案项点击打卡按钮完成每日打卡
4. 不满意可点击「调整方案」输入修改意见重新生成

### 打卡记录与分析

1. 在生活方案页打完卡后，进入「我的」→「打卡记录与分析」
2. 查看打卡列表（支持按日期范围、饮食/运动类型筛选）
3. 查看 AI 分析报告：按类型完成率、近 7 天趋势、依从性评语

### 管理员操作

1. 使用预置管理员账号登录（首次登录需修改默认密码）
2. 进入「我的」→「智能管理」
3. 在对话界面用自然语言操作数据库，例如：
   - "查询所有用户"
   - "新增一位心内科医生"
   - "删除用户ID为5的文章收藏记录"
4. 所有操作自动记录到 `admin_logs` 表，可审计追溯

### 访问控制

| 页面/功能 | 公开访问 | 需登录 | 需 Admin |
|-----------|:-------:|:-----:|:------:|
| 系统首页 | ✓ | — | — |
| 医师咨询（浏览） | ✓ | — | — |
| 医师咨询（对话） | — | ✓ | — |
| 健康资讯（浏览） | ✓ | — | — |
| 健康资讯（生成/收藏） | — | ✓ | — |
| 糖尿病风险预测 | — | ✓ | — |
| 生活方案 | — | ✓ | — |
| 打卡记录与分析 | — | ✓ | — |
| AI 智能助手 | — | ✓ | — |
| 健康建议 | — | ✓ | — |
| 智能管理 | — | — | ✓ |
| 登录/注册 | ✓ | — | — |

---

## API 端点（37 个）

| # | 方法 | 路径 | 认证 | 说明 |
|---|------|------|------|------|
| 1 | GET | `/api/health` | — | 健康检查 |
| 2 | POST | `/api/auth/register` | — | 用户注册 |
| 3 | POST | `/api/auth/login` | — | 用户登录 |
| 4 | POST | `/api/auth/logout` | JWT | 退出登录 |
| 5 | GET | `/api/user/profile` | JWT | 个人信息 |
| 6 | PUT | `/api/user/profile` | JWT | 修改信息 |
| 7 | PUT | `/api/user/password` | JWT | 修改密码 |
| 8 | GET | `/api/doctors` | — | 医生列表 |
| 9 | GET | `/api/doctors/:id` | — | 医生详情 |
| 10 | GET | `/api/articles` | — | 文章列表 |
| 11 | GET | `/api/articles/collections` | JWT | 我的收藏 |
| 12 | POST | `/api/articles/generate` | JWT | AI 生成文章 |
| 13 | GET | `/api/articles/:id` | 可选 | 文章详情 |
| 14 | POST | `/api/articles/:id/collect` | JWT | 收藏 |
| 15 | DELETE | `/api/articles/:id/collect` | JWT | 取消收藏 |
| 16 | PUT | `/api/articles/:id/cover` | JWT | 更新文章封面 |
| 17 | DELETE | `/api/articles/:id` | JWT | 删除文章（作者/管理员） |
| 18 | GET | `/api/diabetes-types` | — | 糖尿病类型 |
| 19 | GET | `/api/diabetes-types/:id` | — | 类型详情 |
| 20 | POST | `/api/risk/predict` | JWT | 风险预测 |
| 21 | GET | `/api/risk/history` | JWT | 预测历史 |
| 22 | POST | `/api/plan/generate` | JWT | 生成方案 |
| 23 | GET | `/api/plan/current` | JWT | 当前方案 |
| 24 | PUT | `/api/plan/adjust` | JWT | 调整方案 |
| 25 | POST | `/api/punch` | JWT | 打卡 |
| 26 | GET | `/api/punch/list` | JWT | 打卡列表 |
| 27 | GET | `/api/punch/analysis` | JWT | 打卡分析 |
| 28 | POST | `/api/chat/doctor/:id` | JWT | 医师对话 (SSE) |
| 29 | GET | `/api/chat/doctor/:id/conversations` | JWT | 对话历史 |
| 30 | POST | `/api/assistant/chat` | JWT | AI 助手 (SSE) |
| 31 | GET | `/api/assistant/advice` | JWT | 健康建议 |
| 32 | GET | `/api/assistant/conversations` | JWT | AI 对话历史 |
| 33 | GET | `/api/admin/logs` | JWT+Admin | 操作日志 |
| 34 | POST | `/api/admin/execute` | 双认证 | 参数化查询/SQL |
| 35 | POST | `/api/admin/chat` | JWT+Admin | 管理对话 (SSE) |
| 36 | POST | `/api/dify/agent/:agent_id` | JWT | Dify Agent 代理 |
| 37 | POST | `/api/upload/avatar` | JWT | 头像上传 |

### 响应格式

- **成功**: `{ success: true, message: "...", data: {...} }`
- **错误**: `{ error: { code: "ERROR_CODE", message: "..." } }`
- **分页**: `{ success: true, data: [...], pagination: { page, pageSize, total, totalPages } }`

---

## 测试

### 单元测试

测试框架：**Vitest**，环境：**jsdom**（前端组件挂载）和 **Node**（后端工具/中间件），覆盖率引擎：**v8**。

```bash
npm test                    # 全量测试（43 文件，830+ 用例）
npm run test:frontend       # 仅前端（24 文件）
npm run test:backend        # 仅后端（19 文件）
npm run test:coverage       # 覆盖率报告 → coverage/index.html
```

#### 测试覆盖范围

| 层级 | 目录 | 文件数 | 说明 |
|------|------|:---:|------|
| 后端 | `test/backend/` | 19 | utils(9) + middleware(5) + routes-auth + health + admin-sql-injection + difyAgent + sseProxy |
| 前端 | `test/frontend/` | 24 | utils(5) + composables(2) + stores(5) + components(8) + UI + design-css(2) + App + chat |
| 性能 | `performance/` | 4 | K6 负载测试脚本 |

#### 覆盖率概览

| 模块 | 语句 | 分支 | 函数 | 行 |
|------|:---:|:---:|:---:|:---:|
| `server/utils/` | 93% | 85% | 97% | 95% |
| `server/middleware/` | 82% | 72% | 100% | 82% |
| `server/db/` | 100% | 100% | 100% | 100% |
| `src/utils/` | 99% | 89% | 100% | 99% |
| `src/components/` | 100% | 96% | 100% | 100% |
| `src/composables/` | 70% | 79% | 50% | 74% |
| `src/stores/` | 84% | 65% | 90% | 88% |
| **综合** | **94%** | **86%** | **94%** | **96%** |

### 性能测试

基于 K6 的负载测试，支持多场景多并发级别。

```bash
# 1. 注册压测用户（首次）
node performance/scripts/setup-test-users.js

# 2. 运行单个场景
node performance/scripts/run-perf-test.js --scenario=login --vus=50

# 3. 批量运行全部（3 场景 × 5 并发级别）
node performance/scripts/run-all-tests.js

# 4. 生成汇总报告
node performance/scripts/generate-report.js
```

报告输出：`performance/reports/*.json` + `performance/实验结果记录表.md`

---

## 免责声明

本产品定位为健康管理辅助工具，**不作为医疗器械**，不提供临床级别的糖尿病诊断、治疗方案或用药指导。所有 AI 生成的建议和评估结果仅供参考，不能替代专业医师的诊断和处方。使用本产品前需同意医学免责声明。
