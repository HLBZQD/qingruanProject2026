# Batch 6 SSE Chat — 代码审查报告 v1 r1

## 审查范围

| 文件 | 状态 | 行数 |
|------|------|------|
| `server/services/sseProxy.js` | 新建 | 110 |
| `server/routes/chat.js` | 新建 | 40 |
| `server/routes/assistant.js` | 新建 | 67 |
| `server/routes/index.js` | 修改 | +2 |

---

## 发现的问题

### BUG-1: sseProxy.js — JSON 注入漏洞 (line 56)

**严重程度**: 高

**位置**: `server/services/sseProxy.js:66` (原 line 56)

Dify 错误消息字段直接通过模板字面量拼接到 JSON 字符串中。若 Dify 错误消息包含双引号 `"`、反斜杠 `\` 等 JSON 特殊字符，生成的 SSE data 行将是非法 JSON。

**修复**: 引入 `writeErrorEvent()` 辅助函数，使用 `JSON.stringify({ event: 'error', message, code })` 构建合法 JSON。Mock 模式同步修复。

**文件更新**: `sseProxy.js:13-14, 50-54, 66, 91, 96`

---

### BUG-2: sseProxy.js — timeout 与 error 双重写入 (lines 80-89)

**严重程度**: 中

**原代码**:
```js
upstreamReq.on('timeout', () => {
    upstreamReq.destroy();   // 同步触发 error 事件
    res.write(...); res.end();
});
```

`destroy()` 同步触发 `error` 事件，error handler 写入并 `res.end()` 后，timeout handler 再次 `res.write()`，导致 `ERR_STREAM_WRITE_AFTER_END`。

**修复**: timeout handler 不再调用 `destroy()`，统一使用 `writeErrorEvent()`。timeout 和 error 均检查 `aborted || res.writableEnded`。

---

### BUG-3: sseProxy.js — 客户端断连后仍向 res 写入 (lines 86-96)

**严重程度**: 低

客户端断开 TCP 后，`upstreamReq.destroy()` 触发 `error` handler 向已断开的 socket 写入 SSE 数据。

**修复**: 引入 `aborted` 标志位（`sseProxy.js:48`），在 `req.on('close')` 中先设置为 `true` 再调用 `destroy()`（`sseProxy.js:100`）。error handler 检查 `aborted` 后跳过写入。

---

### BUG-4: sseProxy.js — timeout handler 缺少 writableEnded 检查 (line 82)

**严重程度**: 中

**修复**: timeout handler 已添加 `aborted || res.writableEnded` 守卫（`sseProxy.js:90`），与 error handler 一致。

---

## 设计符合度检查

| 设计项 | 状态 | 说明 |
|--------|------|------|
| SSE 响应头设置 | ✅ | 四项 Header 完整 |
| Mock 模式降级 | ✅ | 事件格式匹配，使用 JSON.stringify 防注入 |
| Dify 请求体构造 | ✅ | conversation_id 仅在非空时加入 |
| 行缓冲透传 | ✅ | `buffer.split('\n')` + `pop()` |
| 残留刷新 | ✅ | end 事件中刷新 buffer |
| chat_token 防泄露 | ✅ | 仅传入 apiKey 参数 |
| GET conversations 空数组 | ✅ | chat & assistant 均 `{ success: true, data: [] }` |
| GET advice 分页 | ✅ | parsePagination + buildPagination + tags 防御 |
| 路由挂载 | ✅ | index.js `/chat`, `/assistant` |
| authMiddleware 覆盖 | ✅ | 全部 5 端点 |

---

## 修复后代码结构 (sseProxy.js)

```
proxyDifySSE({ apiKey, query, conversationId, userId, res, req })
  ├── 设置 SSE 响应头
  ├── Mock 降级 (无 DIFY_API_BASE_URL) → writeErrorEvent
  ├── 构造 Dify 请求体
  ├── upstreamReq (http/https)
  │   ├── 非 2xx → 收集 body → writeErrorEvent(DIFY_ERROR)
  │   ├── 2xx → 行缓冲透传
  │   └── end → 刷新 buffer → res.end()
  ├── timeout → writeErrorEvent(UPSTREAM_ERROR)  [guard: aborted || writableEnded]
  ├── error   → writeErrorEvent(UPSTREAM_ERROR)  [guard: aborted || writableEnded]
  └── close   → aborted=true → upstreamReq.destroy()
```

`writeErrorEvent(message, code)`:
- 检查 `res.writableEnded` → 若已结束则跳过
- 使用 `JSON.stringify()` 构建合法 JSON
- 写入 SSE 格式后 `res.end()`

---

## 审查结论

**APPROVED**

4 个 bug 均已修复。代码符合设计规范，无明显遗留问题。chat_token 防泄露、SSE 流正确性、认证覆盖均已验证通过。
