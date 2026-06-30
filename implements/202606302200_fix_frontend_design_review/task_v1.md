# 任务指令（v1）

## 动作
NEW

## 任务描述
修复3项CSS基础问题（G12/G15/G18），均为纯CSS修改，不涉及逻辑或结构变更。

### G12. 全局 .page-enter 动画与原型不一致
- **文件**：`src/styles/animations.css:2-9`
- **当前**：`@keyframes pageEnterFadeIn` 纯淡入 `opacity: 0→1`，无位移；`.page-enter` 使用 `ease-out` 缓动
- **目标**：改为包含 `translateY(10px)→0` 上滑位移 + `cubic-bezier(0.22, 0.61, 0.36, 1)` 缓动，与原型 `.page-enter { animation: pageEnter .28s cubic-bezier(0.22, 0.61, 0.36, 1) }` 一致
- **修改**：
  1. 将 `@keyframes pageEnterFadeIn` 重写为 `from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); }`
  2. 将 `.page-enter` 的 animation 改为 `pageEnterFadeIn 0.28s cubic-bezier(0.22, 0.61, 0.36, 1) both`
  3. 保留 keyframes 名称不变（避免影响其他引用方）

### G15. Punch.vue 使用未定义的 CSS 变量名
- **文件**：`src/views/Punch.vue`（`<style scoped>` 内）
- **修正规则**：仅替换变量名，保留源文件实际 fallback 值不变
- **映射关系**（基于源文件实际值）：

| 选择器定位 | 行号 | 当前 | 修正 |
|-----------|------|------|------|
| `.donut-chart circle[stroke="var(--color-border..."]` (背景环) | 306 | `var(--color-border, #e0e0e0)` | `var(--color-divider, #e0e0e0)` |
| `.donut-text` (环中心文字 fill) | 1180 | `var(--color-text, #333)` | `var(--color-text-primary, #333)` |
| `#btn-refresh` (边框色) | 1203 | `var(--color-border, #ddd)` | `var(--color-divider, #ddd)` |
| `#btn-refresh:hover:not(:disabled)` (hover 背景) | 1213 | `var(--color-bg-hover, #f5f5f5)` | `var(--color-bg, #f5f5f5)` |

- **设计系统来源**（`src/assets/variables.css`）：`--color-divider: #E8E8E8`、`--color-text-primary: #333333`、`--color-bg: #F5F5F5`
- **注意**：行号基于当前 `ff4619c` 提交，若后续编辑导致偏移，以 CSS 选择器特征字符串定位

### G18. Home.vue 品牌色与设计系统不一致
- **文件**：`src/views/Home.vue`（`<style scoped>` 内）
- **设计系统**（`src/assets/variables.css`）：`--color-primary: #4A90D9`、`--color-primary-dark: #3A7BC8`、`--color-primary-light: #E8F1FB`
- **说明**：设计系统仅有 3 个 primary 衍生变量，而 banner 梯度共涉及 5 种硬编码色值。`--color-primary-light` (#E8F1FB) 为浅色背景色，不适合深色 banner（文字为白色）。因此 banner 梯度仅使用 `--color-primary` 和 `--color-primary-dark`，通过不同色标排列保持 3 组 banner 视觉区分。

#### 位置1：`.home-logo` 渐变（行 381）
- **当前**：`background: linear-gradient(135deg, #2563eb, #0ea5e9);`
- **修正**：`background: linear-gradient(135deg, var(--color-primary-dark), var(--color-primary));`
- **映射**：`#2563eb` → `var(--color-primary-dark)`、`#0ea5e9` → `var(--color-primary)`

#### 位置2：`.banner-grad-1/2/3`（行 484-492）
- 完整映射表（5 种源色值 → 目标变量）：

| 源色值 | 目标 CSS 变量 | 出现在 |
|--------|-------------|--------|
| `#2563eb` | `var(--color-primary-dark)` | .banner-grad-1 |
| `#3b82f6` | `var(--color-primary)` | .banner-grad-1, .banner-grad-2, .banner-grad-3 |
| `#0ea5e9` | `var(--color-primary)` | .banner-grad-1, .banner-grad-3 |
| `#4f46e5` | `var(--color-primary-dark)` | .banner-grad-2 |
| `#06b6d4` | `var(--color-primary)` | .banner-grad-2, .banner-grad-3 |

- 修正后代码：

```css
/* .banner-grad-1（行 484-486） */
.banner-grad-1 {
  background: linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 50%, var(--color-primary) 100%);
}

/* .banner-grad-2（行 487-489） */
.banner-grad-2 {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 50%, var(--color-primary) 100%);
}

/* .banner-grad-3（行 490-492） */
.banner-grad-3 {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary) 50%, var(--color-primary-dark) 100%);
}
```

- **色标排列逻辑**：dark-primary-primary（重心偏左）/ primary-dark-primary（重心居中）/ primary-primary-dark（重心偏右），三组互为置换，在仅有两个可用变量时最大化视觉区分。

## 选择理由
这三项均为"值/名称错误"型修复，不涉及结构变化，是风险最低的一批修改。全局动画（G12）影响所有页面转场体验，应最优先修正以建立正确的视觉基线。CSS变量名（G15）和品牌色（G18）属于一致的修复模式，同一轮处理可减少上下文切换。

## 任务上下文
- 技术栈：Vue 3 + TypeScript + Pinia + Vite + scoped CSS
- CSS 变量设计系统定义于 `src/assets/variables.css`
- 全局动画定义于 `src/styles/animations.css`
- 修改后无需构建验证，为纯CSS变更

## 已有代码上下文
- `src/assets/variables.css`：定义了 `--color-primary: #4A90D9`、`--color-primary-dark: #3A7BC8`、`--color-primary-light: #E8F1FB`、`--color-divider: #E8E8E8`、`--color-text-primary: #333333`、`--color-bg: #F5F5F5` 等标准变量名
- `src/styles/animations.css`：当前仅有 `@keyframes pageEnterFadeIn { from { opacity: 0; } to { opacity: 1; } }` 和 `.page-enter { animation: pageEnterFadeIn 0.4s ease-out; }`
- 其他13个页面均正确引用 `var(--color-primary)` 等设计系统变量，Home.vue 是唯一例外

---

## 修订说明（v1 r1）
| 审查意见 | 修改措施 |
|---------|---------|
| [严重] 计划未完整覆盖 6 项任务，仅规划 R1 的 G12/G15/G18，缺失 G3/G14/G19 的后续轮次 | plan.md 已补充 R2 NEW，覆盖 G3（DoctorChatView 欢迎语空态）、G14（Risk.vue gradient-text）、G19（三视图 v-html Markdown :deep() 穿透）三项。R2 规划理由：三项均为模板+样式组合修改，依赖 R1 修正后的设计系统基线 |
| [一般] G18 位置2（.banner-grad-1/2/3）颜色替换映射未明确定义：实际源文件含 5 种源色值（#2563eb, #3b82f6, #0ea5e9, #4f46e5, #06b6d4），task 仅列 3 种；「衍生色系」未指向具体变量 | 补充完整映射表（5 种源色值 → 目标变量逐一对应），明确仅使用 `--color-primary` 和 `--color-primary-dark` 两个变量（`--color-primary-light` 为浅色背景色，不适用于深色 banner），通过色标排列（dark-primary-primary / primary-dark-primary / primary-primary-dark）保持三组 banner 视觉区分 |
| [轻微] G15 修正表中 fallback 值与源文件实际值不一致（task 写 #E5E7EB 等，源文件为 #e0e0e0、#333、#ddd、#f5f5f5） | 已依据源文件 `ff4619c` 实际取值修正 fallback 列，并补充 CSS 选择器特征字符串作为辅助定位手段 |
| [轻微] 行号使用波浪号（~）前缀表示近似值，grep/编辑后可能漂移 | 保留行号但去掉近似符号，同时为每条 G15 修正补充 CSS 选择器定位字符串；G18 补充行范围和完整代码块 |
