import { marked } from 'marked'
import { sanitizeHtml } from '@/utils/sanitize'

// ============================================================
// G16: marked async 兼容性注释
// ============================================================
//
// 当前使用 marked v12 的同步模式 `{ async: false }`。
// marked 官方文档提示未来主版本可能移除同步模式。
//
// 若 marked v13+ 移除了 `{ async: false }`，迁移步骤:
//   1. 将 renderMarkdown 改为 async:
//      export async function renderMarkdown(md: unknown): Promise<string>
//   2. 内部调用改为:
//      const raw = await marked.parse(String(md ?? ''))
//   3. 调用方需 await 或使用 Vue Suspense
//
// 锁定策略: 在 package.json 中锁定 marked 版本为当前主版本 (~12.x)，
// 防止意外升级导致同步模式不可用。升级前需评估调用方的 async 迁移成本。

// ============================================================
// 安全: marked 链接渲染器 — 自动注入 rel="noopener noreferrer"
// ============================================================
//
// 为外部链接（http/https）自动添加 rel="noopener noreferrer" target="_blank"，
// 防止 tabnabbing 攻击（被打开页面可通过 window.opener 操纵原页面）。
// 内部链接（相对路径/绝对路径/锚点）不添加 target="_blank"。
//
// 此配置通过 marked.use() 全局生效，对此模块的所有 renderMarkdown() 调用均适用。
// 链接 href 在下游经 sanitizeHtml() 白名单 URI 二次校验。
//
// 依赖: sanitizeHtml 的 ALLOWED_ATTR 已包含 href/title/target/rel，
// rel 属性随本渲染器注入，sanitizeHtml 白名单放行。
const _linkRenderer = {
  link(href: string | null, title: string | null, text: string): string {
    const h = href ?? ''
    const t = title ? ` title="${title.replace(/"/g, '&quot;')}"` : ''
    const rel = /^https?:\/\//i.test(h) ? ' rel="noopener noreferrer" target="_blank"' : ''
    return `<a href="${h}"${t}${rel}>${text}</a>`
  },
}
marked.use({ renderer: _linkRenderer })

/**
 * Markdown → 安全 HTML 渲染管道。
 *
 * 设计依据: docs/2_detailed_design_v3.md 1.3节（DOMPurify + marked 组合）
 *
 * 管道: markdown 文本 → marked.parse({ async: false }) → sanitizeHtml(白名单加固) → 安全 HTML 字符串
 *
 * @param markdown - Markdown 文本（类型为 unknown 以兼容 API 返回的任意类型字段）
 * @returns 净化后的安全 HTML 字符串。输入为 null/undefined/非字符串/空字符串时返回 ''。
 */
export function renderMarkdown(markdown: unknown): string {
  // 空值防御
  if (markdown == null) return ''
  const md = typeof markdown === 'string' ? markdown : String(markdown)
  if (md.trim() === '') return ''

  // marked.parse() 当前使用同步模式（见文件顶部 G16 注释）
  const rawHtml = marked.parse(md, { async: false }) as string

  // DOMPurify 安全净化 — 使用 G1 的 sanitizeHtml() 统一白名单配置
  return sanitizeHtml(rawHtml)
}
