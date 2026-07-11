import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '@/composables/useMarkdown'

describe('renderMarkdown', () => {
  it('基本 Markdown 渲染为 HTML', () => {
    const html = renderMarkdown('**加粗文本**')
    expect(html).toContain('<strong>加粗文本</strong>')
  })

  it('标题渲染', () => {
    const html = renderMarkdown('# 一级标题')
    expect(html).toContain('<h1')
    expect(html).toContain('一级标题')
  })

  it('列表渲染', () => {
    const html = renderMarkdown('- 项目一\n- 项目二')
    expect(html).toContain('<li>')
  })

  it('链接渲染含 rel 属性', () => {
    const html = renderMarkdown('[百度](https://www.baidu.com)')
    expect(html).toContain('href="https://www.baidu.com"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('百度')
  })

  it('内部链接不添加 target="_blank"', () => {
    const html = renderMarkdown('[首页](/home)')
    expect(html).toContain('href="/home"')
    expect(html).not.toContain('target="_blank"')
    expect(html).toContain('首页')
  })

  it('null 返回空字符串', () => {
    expect(renderMarkdown(null)).toBe('')
  })

  it('undefined 返回空字符串', () => {
    expect(renderMarkdown(undefined)).toBe('')
  })

  it('空字符串返回空字符串', () => {
    expect(renderMarkdown('')).toBe('')
  })

  it('仅空格返回空字符串', () => {
    expect(renderMarkdown('   \n  \t  ')).toBe('')
  })

  it('数字输入自动转字符串', () => {
    const html = renderMarkdown(123)
    expect(html).toBe('<p>123</p>\n')
  })

  it('XSS 脚本标签被过滤', () => {
    const html = renderMarkdown('<script>alert("xss")</script>')
    expect(html).not.toContain('<script>')
  })

  it('内联事件处理器被过滤', () => {
    const html = renderMarkdown('<img src="x.png" onerror="alert(1)">')
    expect(html).not.toContain('onerror')
  })

  it('表格渲染', () => {
    const md = '| 列1 | 列2 |\n|-----|-----|\n| A   | B   |'
    const html = renderMarkdown(md)
    expect(html).toContain('<table>')
    expect(html).toContain('<td')
  })

  it('内联代码渲染', () => {
    const html = renderMarkdown('使用 `const x = 1` 声明变量')
    expect(html).toContain('<code>')
  })

  it('代码块渲染', () => {
    const md = '```javascript\nconst x = 1;\n```'
    const html = renderMarkdown(md)
    expect(html).toContain('<pre>')
  })
})
