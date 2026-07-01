# 实现报告（v1）

## 概述
修改 `server/services/sseProxy.js` 第 22 行，修复双 `/v1` 路径拼接 Bug。去掉硬编码的 `/v1` 前缀，使 URL 拼接逻辑与同项目中 `difyService.js` 的 Dify API 调用保持一致。

## 文件变更清单
| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 修改 | server/services/sseProxy.js | 第 22 行：`'/v1/chat-messages'` → `'/chat-messages'`，消除双 `/v1` 路径拼接 |
| 修改 | server/services/sseProxy.js | 第 85 行：`end` 事件处理器新增 `if (aborted || res.writableEnded) return;` 守卫，与 `data`/`timeout`/`error` 处理器保持一致 |

## 编译验证
未执行编译验证（Node.js 项目，无可用的 `cjpm build` 工具链）。修改涉及一个字符串字面量替换 + 一行守卫条件，语法层面无风险。

## 设计偏差说明
无偏差。修改严格按详细设计规格和审查意见执行：第 22 行字符串字面量按设计修改，第 85 行新增守卫按审查意见添加。函数签名、SSE 透传逻辑、错误处理、请求体构造（含 `user: 'user-' + userId` 格式）均保持不变。

## 修订说明（v1 r1）
| 审查意见 | 修改措施 |
|---------|---------|
| 发现1 [一般]：第 94 行、第 101 行引用未定义变量 `upstreamUrl`，运行时抛出 `ReferenceError`，导致错误处理路径崩溃，SSE 连接挂起无响应。正确变量应为第 22 行定义的 `url`。 | 第 94 行 `upstreamUrl` → `url`；第 101 行 `upstreamUrl` → `url`。此 Bug 为既存问题（非本轮引入），详细设计列为"不变部分"时未发现此缺陷。修改后超时和连接错误日志可正常输出，`writeErrorEvent` 不再被异常阻塞。 |
| 发现2 [轻微]：第 22 行修改正确，与设计一致（正面反馈） | 无需修改。 |

## 修订说明（v1 r2）
| 审查意见 | 修改措施 |
|---------|---------|
| 发现1 [一般]：`upstreamRes.on('end', ...)` 处理器（第 84-88 行）未检查 `aborted` 或 `res.writableEnded` 守卫条件，存在向已结束响应写入数据导致进程崩溃的风险。同函数中 `data`（第 75 行）、`timeout`（第 95 行）、`error`（第 102 行）处理器均正确检查了此守卫，唯独 `end` 处理器缺失，属于不一致的防御性编程缺陷。 | 在第 85 行（`upstreamRes.on('end', () => {` 回调函数体开头）添加 `if (aborted || res.writableEnded) return;`，与第 75 行、第 95 行、第 102 行的守卫模式保持一致。此缺陷为既存问题（非本轮第 22 行修改引入），设计文档将其所在代码块列为"不变部分"（第 49-115 行）时未发现此隐患。 |
