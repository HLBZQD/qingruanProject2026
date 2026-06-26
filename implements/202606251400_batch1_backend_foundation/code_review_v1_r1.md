# Code Review v1 r1 — REJECTED

## 审查结论

**REJECTED** — `server/db/database.js` 存在冗余且危险的顶层数据库连接代码，需修复后重新提交。

---

## 问题清单

### 问题 1: `server/db/database.js:33-34` — 冗余的顶层数据库连接 (CRITICAL)

**现状**：
```javascript
// 第 33-34 行（函数外，模块加载时立即执行）
db = new Database(process.env.DB_PATH || './data/database.sqlite');
db.pragma('foreign_keys = ON');
```

**问题分析**：
1. `initDatabase()` 函数（第 9-31 行）已经完整处理了数据库初始化流程：创建 `data/` 目录 → 创建连接 → 执行 `init.sql` → 检查是否需要 seed → 替换 bcrypt 占位符。第 33-34 行的代码完全重复了连接创建逻辑，没有任何作用。
2. 第 33-34 行在模块加载时立即执行（`require()` 时），而 `data/` 目录的创建逻辑（`fs.mkdirSync`）在 `initDatabase()` 内部（第 14-15 行），此时尚未执行。如果 `data/` 目录不存在（克隆仓库后首次启动），第 33 行会抛出错误，导致服务无法启动。
3. 第 33 行创建的连接在第 17 行被覆盖，造成资源浪费（旧的连接句柄被丢弃但未关闭）。

**影响**：
- 如果 `data/` 目录不存在，服务启动失败
- 完全违背了 `initDatabase()` 中 "先建目录再连接" 的安全设计

**修复方案**：
**直接删除第 33-34 行**。`initDatabase()` 已经处理了一切，不需要任何替代代码。

删除后 `database.js` 末尾应为：
```javascript
module.exports = { db, initDatabase };
```

---

### 问题 2: `server/middleware/errorHandler.js:24` — 错误消息用词（MINOR）

**现状**：
```javascript
message: '服务端内部错误'
```

**检查清单期望**：`'服务器内部错误'`

**说明**：`'服务端内部错误'` 和 `'服务器内部错误'` 在中文语境中语义相近，均可接受。`'服务器内部错误'` 更接近 HTTP 500 的标准中文表述。此问题不阻塞审批，建议跟随问题 1 一并修改（或不修改亦可）。

**修复方案**（可选）：
```javascript
message: '服务器内部错误'
```

---

## 通过的文件

以下 9 个文件全部通过审查，无需修改：

| # | 文件 | 状态 |
|---|------|------|
| 1 | `package.json` | ✅ 通过 |
| 2 | `.env` | ✅ 通过 |
| 3 | `.env.example` | ✅ 通过 |
| 4 | `server/db/init.sql` | ✅ 通过 |
| 5 | `server/db/seed.sql` | ✅ 通过 |
| 6 | `server/middleware/errorHandler.js` | ✅ 通过（问题 2 为可选修改）|
| 7 | `server/routes/index.js` | ✅ 通过 |
| 8 | `server/app.js` | ✅ 通过 |
| 9 | `server.js` | ✅ 通过 |

---

## 重新提交要求

仅需修改 `server/db/database.js`：删除第 33-34 行的冗余连接代码。可选地修改 `errorHandler.js` 第 24 行的错误消息文本。
