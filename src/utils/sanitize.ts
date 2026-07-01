import DOMPurify from 'dompurify'

// ============================================================
// 函数 A: escapeHtml — HTML 实体转义（纯文本 XSS 防护）
// ============================================================

/**
 * HTML 实体转义——将特殊字符转为 HTML 实体，防止纯文本片段中的 XSS 注入。
 *
 * 使用场景: 弹窗中拼接 HTML 字符串时的文本域安全处理。
 * 例如 Home.vue 糖尿病类型弹窗的病因/临床表现/治疗方式文本。
 *
 * 与 sanitizeHtml() 的区别:
 *   - escapeHtml: 纯文本片段 → 实体转义 → 安全文本（不保留任何 HTML 标签）
 *   - sanitizeHtml: Markdown→HTML → DOMPurify 白名单净化 → 安全 HTML（保留合法标签）
 *
 * @param str - 待转义的文本
 * @returns HTML 实体转义后的安全文本
 */
export function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return str.replace(/[&<>"']/g, (c) => map[c] || c)
}

// ============================================================
// 函数 B: sanitizeHtml — DOMPurify 白名单加固（Markdown→HTML 净化）
// ============================================================

/**
 * Markdown→HTML 净化函数——使用 DOMPurify 加固配置，防止 XSS 绕过。
 *
 * 设计依据: docs/2_detailed_design_v3.md 1.3节技术选型表（第120行）
 * 诊断规格: a_v8_diag_v3.md S10（第306-326行）
 *
 * 白名单设计原则:
 *   ALLOWED_TAGS — 仅允许 Markdown 渲染可能产生的 HTML 标签（覆盖 CommonMark + GFM 表格扩展）
 *   ALLOWED_ATTR — 仅允许安全的展示属性（无事件处理器、无内联脚本）
 *   ALLOWED_URI_REGEXP — 仅允许 http/https/mailto/相对路径/绝对路径，拦截 javascript: / data: 等伪协议
 *   FORBID_TAGS / FORBID_ATTR — 显式禁止高危标签和事件属性（双保险，即使不在 ALLOWED 中也显式禁止）
 *
 * @param html - 待净化的 HTML 字符串（通常来自 marked.parse() 输出）
 * @returns 净化后的安全 HTML 字符串
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    // —— 允许的标签（白名单）——
    // 覆盖 Markdown 所有可能输出的 HTML 元素：
    //   标题 h1-h6、段落 p、换行 br、行内格式 strong/em/b/i/u/s
    //   链接 a、列表 ul/ol/li、引用 blockquote、代码 code/pre、分隔线 hr
    //   表格 table/thead/tbody/tr/th/td、通用容器 span/div、图片 img
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br',
      'strong', 'em', 'b', 'i', 'u', 's',
      'a',
      'ul', 'ol', 'li',
      'blockquote',
      'code', 'pre',
      'hr',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'span', 'div',
      'img',
      'details', 'summary',
    ],

    // —— 允许的属性（白名单）——
    // href/title/rel: 链接属性；alt/src/width/height: 图片属性
    // class/style: 样式控制（DOMPurify 会过滤 style 中的危险 CSS）
    // target: 链接打开方式
    ALLOWED_ATTR: [
      'href', 'title', 'rel',
      'alt', 'src', 'width', 'height',
      'class', 'style',
      'target',
    ],

    // —— URI 协议白名单 ——
    // 允许: http://, https://, mailto:, 相对路径 (./, ../, xxx.html, #anchor), 绝对路径 (/xxx)
    // 禁止: javascript:, data:, vbscript: 等伪协议
    // 修正版: 增加 [/] 分支匹配绝对路径（如 /news/article/1），避免误杀
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[/#.]|[^/\s:]+$)/i,

    // —— 显式禁止的标签（双保险）——
    // 即使攻击者绕过白名单（如 DOMPurify 版本漏洞），这些标签仍被过滤
    FORBID_TAGS: [
      'style', 'script', 'iframe', 'object', 'embed',
      'form', 'input', 'button', 'textarea', 'select', 'option',
    ],

    // —— 显式禁止的属性（双保险）——
    // 禁止所有内联事件处理器
    FORBID_ATTR: [
      'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur',
      'onchange', 'onsubmit', 'onkeydown', 'onkeyup', 'onkeypress',
    ],

    // —— 返回类型 ——
    RETURN_DOM: false,          // 返回字符串而非 DOM 树
    RETURN_DOM_FRAGMENT: false,
  })
}
