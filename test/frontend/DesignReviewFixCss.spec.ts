/**
 * G3/G14/G19 CSS 变更验证测试
 *
 * 行为契约来源: detail_v2.md §行为契约
 * 修改范围:
 *   - G3:  src/views/DoctorChatView.vue (模板 v-else-if 欢迎语 + .chat-welcome 样式)
 *   - G14: src/views/Risk.vue (.gauge-score gradient-text 渐变)
 *   - G19: src/views/DoctorChatView.vue / Admin.vue / AiChatDialog.vue (.msg-content :deep() Markdown 排版穿透)
 *
 * BC-G3-CSS-1: DoctorChatView.vue .chat-welcome 样式规则存在
 * BC-G14-1: Risk.vue .gauge-score 包含 gradient-text 4 行属性
 * BC-G14-2: Risk.vue .gauge-score 原有属性 (font-size/font-weight/line-height) 不变
 * BC-G19-1: 三视图 .msg-content 后均存在 6 组 :deep() Markdown 排版规则
 * BC-G19-2: 三视图 .msg-content 基础样式 (padding/font-size/line-height/word-break) 不变
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '../../')

function readFile(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8')
}

/** 提取文件中的所有 <style scoped> 块内容并合并为单行 */
function collapseScopedStyle(filePath: string): string {
  const raw = readFile(filePath)
  const matches = raw.match(/<style scoped>([\s\S]*?)<\/style>/g)
  if (!matches) return ''
  return matches
    .map((m) => m.replace(/<style scoped>|<\/style>/g, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ============================================================
// G3: DoctorChatView 空态欢迎样式
// ============================================================
describe('G3 -- DoctorChatView 空态欢迎样式 (DoctorChatView.vue)', () => {
  const style = collapseScopedStyle('src/views/DoctorChatView.vue')

  describe('BC-G3-CSS-1: .chat-welcome 样式规则存在', () => {
    it('.chat-welcome 使用 flex 居中布局 + padding-xl', () => {
      expect(style).toMatch(/\.chat-welcome\s*\{[^}]*display\s*:\s*flex/)
      expect(style).toMatch(/\.chat-welcome\s*\{[^}]*flex-direction\s*:\s*column/)
      expect(style).toMatch(/\.chat-welcome\s*\{[^}]*align-items\s*:\s*center/)
      expect(style).toMatch(/\.chat-welcome\s*\{[^}]*text-align\s*:\s*center/)
      expect(style).toMatch(/\.chat-welcome\s*\{[^}]*var\(--spacing-2xl\)/)
    })

    it('.welcome-avatar 为 64px 圆渐变头像', () => {
      expect(style).toMatch(/\.chat-welcome\s+\.welcome-avatar\s*\{[^}]*width\s*:\s*64px/)
      expect(style).toMatch(/\.chat-welcome\s+\.welcome-avatar\s*\{[^}]*height\s*:\s*64px/)
      expect(style).toMatch(/\.chat-welcome\s+\.welcome-avatar\s*\{[^}]*border-radius\s*:\s*var\(--radius-full\)/)
      expect(style).toMatch(/\.chat-welcome\s+\.welcome-avatar\s*\{[^}]*linear-gradient\(135deg/)
      expect(style).toMatch(/\.chat-welcome\s+\.welcome-avatar\s*\{[^}]*var\(--color-primary\)/)
      expect(style).toMatch(/\.chat-welcome\s+\.welcome-avatar\s*\{[^}]*#0EA5E9/)
    })

    it('.chat-welcome h3 标题样式存在', () => {
      expect(style).toMatch(/\.chat-welcome\s+h3\s*\{[^}]*font-size\s*:\s*var\(--font-size-h3\)/)
      expect(style).toMatch(/\.chat-welcome\s+h3\s*\{[^}]*font-weight\s*:\s*700/)
      expect(style).toMatch(/\.chat-welcome\s+h3\s*\{[^}]*var\(--color-text-primary\)/)
    })

    it('.chat-welcome > p 子选择器限制范围 + 文案样式', () => {
      expect(style).toMatch(/\.chat-welcome\s*>\s*p\s*\{[^}]*var\(--color-text-secondary\)/)
      expect(style).toMatch(/\.chat-welcome\s*>\s*p\s*\{[^}]*max-width\s*:\s*280px/)
      expect(style).toMatch(/\.chat-welcome\s*>\s*p\s*\{[^}]*line-height\s*:\s*1\.5/)
    })

    it('.example-list 竖排 + .example-chip 非交互 chip 样式存在', () => {
      expect(style).toMatch(/\.example-list\s*\{[^}]*display\s*:\s*flex/)
      expect(style).toMatch(/\.example-list\s*\{[^}]*flex-direction\s*:\s*column/)
      expect(style).toMatch(/\.example-chip\s*\{[^}]*var\(--radius-full\)/)
      expect(style).toMatch(/\.example-chip\s*\{[^}]*var\(--color-card\)/)
      expect(style).toMatch(/\.example-chip\s*\{[^}]*var\(--color-divider\)/)
    })
  })
})

// ============================================================
// G14: Risk.vue .gauge-score gradient-text 渐变
// ============================================================
describe('G14 -- Risk.vue .gauge-score gradient-text 渐变', () => {
  const style = collapseScopedStyle('src/views/Risk.vue')

  describe('BC-G14-1: .gauge-score 包含 gradient-text 4 行属性', () => {
    it('background 属性为 linear-gradient 蓝→青渐变', () => {
      expect(style).toMatch(/\.gauge-score\s*\{[^}]*background\s*:\s*linear-gradient\(135deg/)
      expect(style).toMatch(/\.gauge-score\s*\{[^}]*var\(--color-primary\)/)
      expect(style).toMatch(/\.gauge-score\s*\{[^}]*#0EA5E9/)
    })

    it('-webkit-background-clip: text 存在', () => {
      expect(style).toMatch(/\.gauge-score\s*\{[^}]*\-webkit-background-clip\s*:\s*text/)
    })

    it('background-clip: text 标准属性存在', () => {
      expect(style).toMatch(/\.gauge-score\s*\{[^}]*background-clip\s*:\s*text/)
    })

    it('color: transparent 存在（让渐变背景透过文字）', () => {
      expect(style).toMatch(/\.gauge-score\s*\{[^}]*color\s*:\s*transparent/)
    })
  })

  describe('BC-G14-2: 原有属性 (font-size/font-weight/line-height) 不变', () => {
    it('font-size: 42px 保持', () => {
      expect(style).toMatch(/\.gauge-score\s*\{[^}]*font-size\s*:\s*42px/)
    })

    it('font-weight: 800 保持', () => {
      expect(style).toMatch(/\.gauge-score\s*\{[^}]*font-weight\s*:\s*800/)
    })

    it('line-height: 1 保持', () => {
      expect(style).toMatch(/\.gauge-score\s*\{[^}]*line-height\s*:\s*1[^0-9]/)
    })
  })
})

// ============================================================
// G19: 三视图 .msg-content :deep() Markdown 排版穿透
// ============================================================

/** :deep() 规则中引用的所有设计系统 CSS 变量 */
const DEEP_VARIABLES = [
  '--spacing-sm',
  '--spacing-lg',
  '--spacing-xs',
  '--spacing-md',
  '--radius-sm',
  '--color-bg',
  '--font-family',
  '--color-primary-light',
  '--color-text-secondary',
  '--color-text-primary',
]

/**
 * 验证单个文件的 G19 :deep() 规则
 * @param filePath - 文件路径（相对于项目根目录）
 * @param label - 文件标签（用于测试描述）
 */
function verifyG19DeepRules(filePath: string, label: string) {
  const style = collapseScopedStyle(filePath)

  describe(`${label} :deep() 规则`, () => {
    it(':deep(p) 段落 margin-bottom 存在', () => {
      expect(style).toMatch(/\.msg-content\s+:deep\(p\)\s*\{[^}]*margin-bottom/)
    })

    it(':deep(ul), :deep(ol) 列表 padding-left + margin-bottom 存在', () => {
      expect(style).toMatch(/\.msg-content\s+:deep\(ul\)[^}]*\{[^}]*padding-left/)
      expect(style).toMatch(/\.msg-content\s+:deep\(ul\)[^}]*\{[^}]*margin-bottom/)
      expect(style).toMatch(/\.msg-content\s+:deep\(ol\)[^}]*\{[^}]*padding-left/)
      expect(style).toMatch(/\.msg-content\s+:deep\(ol\)[^}]*\{[^}]*margin-bottom/)
    })

    it(':deep(li) 列表项 margin-bottom 存在', () => {
      expect(style).toMatch(/\.msg-content\s+:deep\(li\)\s*\{[^}]*margin-bottom/)
    })

    it(':deep(code) 行内代码带背景色+内边距+圆角', () => {
      expect(style).toMatch(/\.msg-content\s+:deep\(code\)\s*\{[^}]*padding\s*:\s*2px\s+6px/)
      expect(style).toMatch(/\.msg-content\s+:deep\(code\)\s*\{[^}]*var\(--radius-sm\)/)
      expect(style).toMatch(/\.msg-content\s+:deep\(code\)\s*\{[^}]*var\(--color-bg\)/)
      expect(style).toMatch(/\.msg-content\s+:deep\(code\)\s*\{[^}]*var\(--font-family\)/)
    })

    it(':deep(blockquote) 引用块左边框+缩进', () => {
      expect(style).toMatch(/\.msg-content\s+:deep\(blockquote\)\s*\{[^}]*border-left\s*:\s*3px\s+solid/)
      expect(style).toMatch(/\.msg-content\s+:deep\(blockquote\)\s*\{[^}]*var\(--color-primary-light\)/)
      expect(style).toMatch(/\.msg-content\s+:deep\(blockquote\)\s*\{[^}]*padding-left/)
    })

    it(':deep(strong) 加粗颜色+字重', () => {
      expect(style).toMatch(/\.msg-content\s+:deep\(strong\)\s*\{[^}]*var\(--color-text-primary\)/)
      expect(style).toMatch(/\.msg-content\s+:deep\(strong\)\s*\{[^}]*font-weight\s*:\s*600/)
    })

    it('所有 :deep() 规则均使用设计系统变量（非硬编码值）', () => {
      // 提取所有 :deep() 规则中的 var() 引用
      const deepBlockMatch = style.match(/\.msg-content\s+:deep\([^)]+\)\s*\{[^}]*\}/g)
      expect(deepBlockMatch).not.toBeNull()
      const deepBlock = deepBlockMatch!.join(' ')
      for (const varName of DEEP_VARIABLES) {
        expect(deepBlock).toContain(`var(${varName})`)
      }
    })
  })

  describe(`${label} .msg-content 基础样式不变式`, () => {
    it('.msg-content 基础 padding 保持', () => {
      expect(style).toMatch(/\.msg-content\s*\{[^}]*padding\s*:/)
    })

    it('.msg-content 基础 font-size 保持 (引用变量)', () => {
      expect(style).toMatch(/\.msg-content\s*\{[^}]*font-size\s*:\s*var\(--font-size-body\)/)
    })

    it('.msg-content 基础 line-height: 1.5 保持', () => {
      expect(style).toMatch(/\.msg-content\s*\{[^}]*line-height\s*:\s*1\.5/)
    })

    it('.msg-content 基础 word-break: break-word 保持', () => {
      expect(style).toMatch(/\.msg-content\s*\{[^}]*word-break\s*:\s*break-word/)
    })
  })
}

// 验证三个视图
verifyG19DeepRules('src/views/DoctorChatView.vue', 'DoctorChatView.vue')
verifyG19DeepRules('src/views/Admin.vue', 'Admin.vue')
verifyG19DeepRules('src/components/AiChatDialog.vue', 'AiChatDialog.vue')
