import { describe, it, expect } from 'vitest'
import { escapeHtml, sanitizeHtml } from '@/utils/sanitize'

describe('escapeHtml', () => {
  it('转义 HTML 特殊字符', () => {
    expect(escapeHtml('<script>alert("x")</script>'))
      .toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')
  })

  it('单引号被转为 &#039;', () => {
    expect(escapeHtml("a'b")).toBe('a&#039;b')
  })

  it('普通文本保持不变', () => {
    expect(escapeHtml('糖尿病预治助手')).toBe('糖尿病预治助手')
  })
})

describe('sanitizeHtml', () => {
  it('剥离 <script> 标签（XSS 防护）', () => {
    const dirty = '<p>正文</p><script>alert(1)</script>'
    expect(sanitizeHtml(dirty)).toBe('<p>正文</p>')
  })

  it('剥离内联事件处理器属性', () => {
    const dirty = '<img src="x.png" onerror="alert(1)">'
    const clean = sanitizeHtml(dirty)
    expect(clean).not.toContain('onerror')
  })

  it('拦截 javascript: 伪协议链接', () => {
    const dirty = '<a href="javascript:alert(1)">点击</a>'
    const clean = sanitizeHtml(dirty)
    expect(clean).not.toContain('javascript:')
  })

  it('保留合法 Markdown 输出的标签与属性', () => {
    const html = '<a href="https://example.com" title="示例">链接</a>'
    const clean = sanitizeHtml(html)
    expect(clean).toContain('href="https://example.com"')
    expect(clean).toContain('>链接</a>')
  })
})
