/**
 * G12/G15/G18 CSS 变更验证测试
 *
 * 行为契约来源: detail_v1.md §行为契约
 * 修改范围: src/styles/animations.css, src/views/Punch.vue, src/views/Home.vue
 *
 * BC-G12-1: @keyframes pageEnterFadeIn 包含 opacity + transform (上滑+淡入)
 * BC-G12-2: .page-enter 动画参数为 0.28s cubic-bezier(0.22,0.61,0.36,1) both
 * BC-G15-1: Punch.vue 不存在未定义变量 (--color-border, --color-text, --color-bg-hover)
 * BC-G15-2: Punch.vue 使用设计系统有效变量 + fallback 值保留
 * BC-G18-1: Home.vue banner/home-logo 渐变不含硬编码品牌色
 * BC-G18-2: Home.vue banner 渐变使用 var(--color-primary) / var(--color-primary-dark)
 * BC-G18-3: Home.vue 渐变方向保持 135deg，色标位置保持 0%/50%/100%
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '../../')

function readFile(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8')
}

/** 合并 CSS 文本为单行（移除换行和多余空白），用于可靠的模式匹配 */
function collapse(css: string): string {
  return css.replace(/\s+/g, ' ').trim()
}

// ============================================================
// G12: 全局动画修正
// ============================================================
describe('G12 -- 全局动画修正 (animations.css)', () => {
  const css = collapse(readFile('src/styles/animations.css'))

  describe('BC-G12-1: @keyframes pageEnterFadeIn 包含上滑+淡入', () => {
    it('from 帧同时包含 opacity: 0 和 translateY(10px)', () => {
      expect(css).toMatch(/@keyframes pageEnterFadeIn\s*\{[^}]*from\s*\{[^}]*opacity\s*:\s*0/)
      expect(css).toMatch(/from\s*\{[^}]*translateY\(10px\)/)
    })

    it('to 帧同时包含 opacity: 1 和 translateY(0)', () => {
      expect(css).toMatch(/to\s*\{[^}]*opacity\s*:\s*1\b/)
      expect(css).toMatch(/to\s*\{[^}]*translateY\(0\)/)
    })

    it('keyframes 名称保持 pageEnterFadeIn 不变（文件中仅定义一次）', () => {
      const matches = css.match(/@keyframes\s+pageEnterFadeIn/g)
      expect(matches).toHaveLength(1)
    })
  })

  describe('BC-G12-2: .page-enter 动画参数', () => {
    it('animation 简写包含 0.28s 时长', () => {
      expect(css).toMatch(/\.page-enter\s*\{[^}]*animation\s*:\s*pageEnterFadeIn 0\.28s/)
    })

    it('animation 简写包含 cubic-bezier(0.22, 0.61, 0.36, 1) 缓动', () => {
      expect(css).toMatch(/cubic-bezier\(0\.22,\s*0\.61,\s*0\.36,\s*1\)/)
    })

    it('animation 简写包含 both 填充模式', () => {
      expect(css).toMatch(/\.page-enter\s*\{[^}]*\bboth\b/)
    })
  })
})

// ============================================================
// G15: Punch.vue CSS 变量名修正
// ============================================================
describe('G15 -- Punch.vue CSS 变量名修正', () => {
  // 检查完整 Vue 文件（模板中的 SVG 属性 + scoped style）
  const vueFull = collapse(readFile('src/views/Punch.vue'))
  const styleOnly = collapse(readFile('src/views/Punch.vue').match(/<style scoped>([\s\S]*?)<\/style>/)?.[1] ?? '')

  describe('BC-G15-1: 不存在未定义的 CSS 变量引用', () => {
    it('不存在 var(--color-border) 引用', () => {
      expect(vueFull).not.toMatch(/var\(--color-border\)/)
    })

    it('不存在 var(--color-text) 引用（不含连字符后缀，即不误杀 --color-text-primary）', () => {
      // 匹配 --color-text) — 闭合括号前没有 -primary 等后缀
      expect(vueFull).not.toMatch(/var\(--color-text\)/)
    })

    it('不存在 var(--color-bg-hover) 引用', () => {
      expect(vueFull).not.toMatch(/var\(--color-bg-hover\)/)
    })
  })

  describe('BC-G15-2: 使用设计系统有效变量且 fallback 值保留', () => {
    it('背景环 stroke 使用 var(--color-divider, #e0e0e0)', () => {
      // SVG 属性在模板中，检查全文件
      expect(vueFull).toContain('var(--color-divider, #e0e0e0)')
    })

    it('环形图中心文字 fill 使用 var(--color-text-primary, #333)', () => {
      // .donut-text 的 fill 在 scoped style 中
      expect(styleOnly).toContain('var(--color-text-primary, #333)')
    })

    it('刷新按钮 border 使用 var(--color-divider, #ddd)', () => {
      expect(styleOnly).toContain('var(--color-divider, #ddd)')
    })

    it('刷新按钮 hover 背景使用 var(--color-bg, #f5f5f5)', () => {
      expect(styleOnly).toContain('var(--color-bg, #f5f5f5)')
    })
  })
})

// ============================================================
// G18: Home.vue 品牌色替换
// ============================================================
describe('G18 -- Home.vue 品牌色替换', () => {
  const vue = readFile('src/views/Home.vue')
  const styleRaw = vue.match(/<style scoped>([\s\S]*?)<\/style>/)?.[1] ?? ''
  const style = collapse(styleRaw)

  const HARDCODED_BRAND_COLORS = ['#2563eb', '#3b82f6', '#0ea5e9', '#4f46e5', '#06b6d4']

  describe('BC-G18-1: banner/home-logo 渐变不含硬编码品牌色', () => {
    // 提取 4 个目标规则块（自 .home-logo { 到闭合 }、自 .banner-grad-N { 到闭合 }）
    function extractBlock(raw: string, selector: string): string {
      // 从选择器开始匹配到闭合的 }
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // 简单计数大括号：找到选择器后，逐 { +1, } -1 直到 0
      const idx = raw.search(new RegExp(escaped + '\\s*\\{'))
      if (idx === -1) return ''
      let depth = 0
      let i = idx
      let started = false
      while (i < raw.length) {
        const ch = raw[i]
        if (ch === '{') { depth++; started = true }
        else if (ch === '}') { depth--; if (started && depth === 0) break }
        i++
      }
      return raw.slice(idx, i + 1)
    }

    // extractBlock 内部会转义，传入原始选择器名即可
    const blocks = [
      extractBlock(styleRaw, '.home-logo'),
      extractBlock(styleRaw, '.banner-grad-1'),
      extractBlock(styleRaw, '.banner-grad-2'),
      extractBlock(styleRaw, '.banner-grad-3'),
    ]

    it('检测到 4 个渐变目标规则块', () => {
      for (const block of blocks) {
        expect(block).not.toBe('')
      }
    })

    for (const color of HARDCODED_BRAND_COLORS) {
      it(`4 个渐变规则块中均不含硬编码色值 ${color}`, () => {
        for (const block of blocks) {
          expect(block).not.toContain(color)
        }
      })
    }
  })

  describe('BC-G18-2: banner/home-logo 渐变使用设计系统 CSS 变量', () => {
    it('.home-logo 渐变使用 var(--color-primary-dark) 和 var(--color-primary)', () => {
      expect(style).toMatch(/\.home-logo\s*\{[^}]*var\(--color-primary-dark\)/)
      expect(style).toMatch(/\.home-logo\s*\{[^}]*var\(--color-primary\)/)
    })

    it('.banner-grad-1 色标排列 dark-primary-primary (重心偏左)', () => {
      expect(style).toMatch(/\.banner-grad-1\s*\{[^}]*var\(--color-primary-dark\)\s*0%/)
      expect(style).toMatch(/\.banner-grad-1\s*\{[^}]*var\(--color-primary\)\s*50%/)
      expect(style).toMatch(/\.banner-grad-1\s*\{[^}]*var\(--color-primary\)\s*100%/)
    })

    it('.banner-grad-2 色标排列 primary-dark-primary (重心居中)', () => {
      expect(style).toMatch(/\.banner-grad-2\s*\{[^}]*var\(--color-primary\)\s*0%/)
      expect(style).toMatch(/\.banner-grad-2\s*\{[^}]*var\(--color-primary-dark\)\s*50%/)
      expect(style).toMatch(/\.banner-grad-2\s*\{[^}]*var\(--color-primary\)\s*100%/)
    })

    it('.banner-grad-3 色标排列 primary-primary-dark (重心偏右)', () => {
      expect(style).toMatch(/\.banner-grad-3\s*\{[^}]*var\(--color-primary\)\s*0%/)
      expect(style).toMatch(/\.banner-grad-3\s*\{[^}]*var\(--color-primary\)\s*50%/)
      expect(style).toMatch(/\.banner-grad-3\s*\{[^}]*var\(--color-primary-dark\)\s*100%/)
    })
  })

  describe('BC-G18-3: 渐变方向和色标位置不变', () => {
    it('.home-logo 渐变方向保持 135deg', () => {
      expect(style).toMatch(/\.home-logo\s*\{[^}]*linear-gradient\(135deg/)
    })

    it('.banner-grad-1 渐变方向保持 135deg', () => {
      expect(style).toMatch(/\.banner-grad-1\s*\{[^}]*linear-gradient\(135deg/)
    })

    it('.banner-grad-2 渐变方向保持 135deg', () => {
      expect(style).toMatch(/\.banner-grad-2\s*\{[^}]*linear-gradient\(135deg/)
    })

    it('.banner-grad-3 渐变方向保持 135deg', () => {
      expect(style).toMatch(/\.banner-grad-3\s*\{[^}]*linear-gradient\(135deg/)
    })

    it('所有 banner 规则块保留 0%, 50%, 100% 色标', () => {
      for (const n of [1, 2, 3]) {
        const re = new RegExp(`\\.banner-grad-${n}\\s*\\{[^}]*\\b0%[^}]*\\b50%[^}]*\\b100%`)
        expect(style).toMatch(re)
      }
    })
  })
})

// ============================================================
// 跨文件一致性
// ============================================================
describe('设计系统变量一致性', () => {
  const variablesCss = collapse(readFile('src/assets/variables.css'))

  it('variables.css 定义了 --color-primary: #4A90D9', () => {
    expect(variablesCss).toMatch(/--color-primary\s*:\s*#4A90D9/)
  })

  it('variables.css 定义了 --color-primary-dark: #3A7BC8', () => {
    expect(variablesCss).toMatch(/--color-primary-dark\s*:\s*#3A7BC8/)
  })

  it('variables.css 定义了 --color-divider: #E8E8E8', () => {
    expect(variablesCss).toMatch(/--color-divider\s*:\s*#E8E8E8/)
  })

  it('variables.css 定义了 --color-text-primary: #333333', () => {
    expect(variablesCss).toMatch(/--color-text-primary\s*:\s*#333333/)
  })

  it('variables.css 定义了 --color-bg: #F5F5F5', () => {
    expect(variablesCss).toMatch(/--color-bg\s*:\s*#F5F5F5/)
  })
})
