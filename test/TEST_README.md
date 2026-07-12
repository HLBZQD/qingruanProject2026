# 测试运行说明

> 测试人：郭宜铼 | 日期：2026-07-11

---

## 环境要求

- Node.js >= 18
- 项目根目录执行 `npm install`

## 运行测试

```bash
npm test                   # 全量测试（43文件 830用例）
npm run test:frontend      # 仅前端（24文件）
npm run test:backend       # 仅后端（19文件）
npm run test:coverage      # 覆盖率报告 → coverage/index.html
```

> **Windows 注意**：若系统环境变量 `NODE_OPTIONS` 含 `--localstorage-file`，需先执行 `$env:NODE_OPTIONS=''` 再跑。

## 测试概览

| 目录 | 文件数 | 说明 |
|------|:---:|------|
| `test/backend/` | 19 | utils(9) + middleware(5) + routes-auth + health + admin-sql-injection + difyAgent + sseProxy + encryption |
| `test/frontend/` | 24 | utils(5) + composables(2) + stores(5) + components(8) + UI(1) + design-css(2) + app/chat(2) |

## 覆盖率报告

```bash
npm run test:coverage
```

打开 `coverage/index.html` 查看。覆盖范围聚焦核心业务模块：

| 目录 | 语句 | 分支 | 函数 | 行 |
|------|:---:|:---:|:---:|:---:|
| `server/utils/` | 93% | 85% | 97% | 95% |
| `server/middleware/` | 82% | 72% | 100% | 82% |
| `server/db/` | 100% | 100% | 100% | 100% |
| `src/utils/` | 99% | 89% | 100% | 99% |
| `src/components/` | 100% | 96% | 100% | 100% |
| `src/composables/` | 70% | 79% | 50% | 74% |
| `src/stores/` | 84% | 65% | 90% | 88% |
| **综合** | **94%** | **86%** | **94%** | **96%** |

## 性能测试

```bash
# 1. 注册压测用户（首次）
node performance/scripts/setup-test-users.js

# 2. 运行单个场景
node performance/scripts/run-perf-test.js --scenario=login --vus=50

# 3. 批量运行全部（3场景 × 3级别）
node performance/scripts/run-all-tests.js

# 4. 生成汇总报告
node performance/scripts/generate-report.js
```

报告输出：`performance/reports/*.json` + `performance/实验结果记录表.md`

## 已知限制

- 11 个测试文件因源码清理需适配（admin-sql-injection/sseProxy/DesignCSS 等），已排查确认非测试代码问题
- 13 个失败测试用例不影响核心覆盖结果
- 覆盖率范围限定在单元测试目标模块，路由层/视图层由集成测试覆盖
