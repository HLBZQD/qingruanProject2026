# 详细设计（v1）

## 概述

本轮修复 3 项 CSS 基础问题（G12/G15/G18），均为纯 CSS 值/变量名替换，不涉及模板结构或逻辑变更。修改范围：全局动画文件 1 个、视图 scoped style 2 个。

## 文件规划

| 文件路径 | 操作 | 职责 |
|---------|------|------|
| `src/styles/animations.css` | 修改 | 重写 `@keyframes pageEnterFadeIn` 和 `.page-enter`，对齐原型上滑+淡入动画 |
| `src/views/Punch.vue` | 修改 | 替换 4 处未定义 CSS 变量名为设计系统变量，保留 fallback 值 |
| `src/views/Home.vue` | 修改 | 将 4 处硬编码品牌色替换为 `var(--color-primary)` / `var(--color-primary-dark)` |

## 类型定义

无。本轮为纯 CSS 修改，不新增或修改任何 TypeScript 类型或接口。

## 设计规格

### G12：全局动画修正（`src/styles/animations.css`）

**背景**：原型中 `.page-enter` 动画包含 `translateY(10px)→0` 上滑位移 + `cubic-bezier(0.22, 0.61, 0.36, 1)` 缓动，当前实现仅有纯淡入 `opacity: 0→1` + `ease-out` 缓动，缺少位移维度，视觉不够灵动。

**影响范围**：除 Home.vue 外，其余 13 个使用了 `class="page-enter"` 的视图页面统一获得上滑+淡入效果。Home.vue 因 `.page-enter.home-page { animation-name: pageEnterHome; }` 覆盖了 animation-name，不受本次修改影响。

#### 修改点 1：`@keyframes pageEnterFadeIn`

| 项 | 值 |
|----|-----|
| 文件 | `src/styles/animations.css` |
| 定位 | 第 2-5 行 |
| 操作 | 重写 keyframes 内容，保留名称 `pageEnterFadeIn` 不变 |

**当前代码**：
```css
@keyframes pageEnterFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

**修正代码**：
```css
@keyframes pageEnterFadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

**理由**：保留 keyframes 名称 `pageEnterFadeIn` 不变（G12 任务指令明确要求），避免影响任何通过 `animation-name: pageEnterFadeIn` 引用的其他代码，仅增强动画效果。

#### 修改点 2：`.page-enter` 规则

| 项 | 值 |
|----|-----|
| 文件 | `src/styles/animations.css` |
| 定位 | 第 7-9 行 |
| 操作 | 修改 animation 简写属性值 |

**当前代码**：
```css
.page-enter {
  animation: pageEnterFadeIn 0.4s ease-out;
}
```

**修正代码**：
```css
.page-enter {
  animation: pageEnterFadeIn 0.28s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
```

**变更明细**：
- 时长：`0.4s` → `0.28s`（对齐原型）
- 缓动：`ease-out` → `cubic-bezier(0.22, 0.61, 0.36, 1)`（对齐原型）
- 填充模式：添加 `both`（确保动画前后保持首/末帧状态，避免闪烁）

### G15：Punch.vue CSS 变量名修正（`src/views/Punch.vue`）

**背景**：Punch.vue 的 `<style scoped>` 中使用了 4 个未在 `src/assets/variables.css` 中定义的 CSS 变量名，导致浏览器跳过无效变量直接使用 fallback 值，设计系统变量无法穿透。

**影响范围**：仅 Punch.vue 的 scoped style，不影响其他视图。

#### 修正映射

| # | 选择器定位 | 属性 | 当前（无效变量+fallback） | 修正（有效变量+保留fallback） | 视觉变化 |
|---|-----------|------|--------------------------|---------------------------|---------|
| 1 | `.donut-chart circle[stroke*="--color-border"]`（背景环，行306） | stroke | `var(--color-border, #e0e0e0)` | `var(--color-divider, #e0e0e0)` | `#e0e0e0` → `#E8E8E8`（设计系统 divider 色，微调） |
| 2 | `.donut-text`（环中心文字 fill，行1180） | fill | `var(--color-text, #333)` | `var(--color-text-primary, #333)` | `#333` → `#333333`（肉眼无差别） |
| 3 | `#btn-refresh`（刷新按钮边框，行1203） | border-color | `var(--color-border, #ddd)` | `var(--color-divider, #ddd)` | `#ddd` → `#E8E8E8`（设计系统 divider 色） |
| 4 | `#btn-refresh:hover:not(:disabled)`（hover 背景，行1213） | background | `var(--color-bg-hover, #f5f5f5)` | `var(--color-bg, #f5f5f5)` | 无变化（fallback 值本身即为 `#f5f5f5`） |

#### 设计系统变量定义（`src/assets/variables.css` 参照）

```css
--color-divider: #E8E8E8;       /* 用于替换 --color-border */
--color-text-primary: #333333;  /* 用于替换 --color-text */
--color-bg: #F5F5F5;            /* 用于替换 --color-bg-hover */
```

#### 定位说明

行号基于提交 `ff4619c`。若后续编辑导致行号漂移，以 CSS 选择器特征字符串定位：

1. `.donut-chart circle` 元素中 `stroke="var(--color-border` 匹配的属性
2. `.donut-text` 规则块中的 `fill` 属性
3. `#btn-refresh` 规则块中的 `border` 属性值
4. `#btn-refresh:hover:not(:disabled)` 规则块中的 `background` 属性值

### G18：Home.vue 品牌色替换（`src/views/Home.vue`）

**背景**：Home.vue 的 `<style scoped>` 中 banner 渐变和 logo 背景使用了 5 种硬编码色值，与设计系统 `src/assets/variables.css` 中定义的 `--color-primary: #4A90D9`、`--color-primary-dark: #3A7BC8` 不一致。其他 13 个页面均正确引用设计系统变量，Home.vue 是唯一例外。

**设计系统可用变量**：
- `--color-primary: #4A90D9`
- `--color-primary-dark: #3A7BC8`
- `--color-primary-light: #E8F1FB`（浅色背景色，不适用于深色 banner（文字为白色），本轮不使用）

#### 源色值→变量映射

| 源色值 | 目标变量 | 理由 |
|--------|---------|------|
| `#2563eb` | `var(--color-primary-dark)` | 最深蓝色，映射为 primary-dark |
| `#3b82f6` | `var(--color-primary)` | 中等蓝色，设计系统主色 |
| `#0ea5e9` | `var(--color-primary)` | 偏青蓝色，在仅有 2 个变量的约束下归入 primary |
| `#4f46e5` | `var(--color-primary-dark)` | 偏紫深色，映射为 primary-dark |
| `#06b6d4` | `var(--color-primary)` | 偏青亮色，归入 primary |

#### 修改点 1：`.home-logo` 渐变（行 381）

**当前代码**：
```css
.home-logo {
  background: linear-gradient(135deg, #2563eb, #0ea5e9);
  /* ...其他属性不变... */
}
```

**修正代码**：
```css
.home-logo {
  background: linear-gradient(135deg, var(--color-primary-dark), var(--color-primary));
  /* ...其他属性不变... */
}
```

**映射**：`#2563eb` → `var(--color-primary-dark)`、`#0ea5e9` → `var(--color-primary)`

#### 修改点 2：`.banner-grad-1`（行 484-486）

**当前代码**：
```css
.banner-grad-1 {
  background: linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #0ea5e9 100%);
}
```

**修正代码**：
```css
.banner-grad-1 {
  background: linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 50%, var(--color-primary) 100%);
}
```

**映射**：`#2563eb` → `var(--color-primary-dark)`、`#3b82f6` → `var(--color-primary)`、`#0ea5e9` → `var(--color-primary)`

**色标排列**：dark-primary-primary（重心偏左）

#### 修改点 3：`.banner-grad-2`（行 487-489）

**当前代码**：
```css
.banner-grad-2 {
  background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 50%, #06b6d4 100%);
}
```

**修正代码**：
```css
.banner-grad-2 {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 50%, var(--color-primary) 100%);
}
```

**映射**：`#4f46e5` → `var(--color-primary-dark)`、`#3b82f6` → `var(--color-primary)`、`#06b6d4` → `var(--color-primary)`

**色标排列**：primary-dark-primary（重心居中）

#### 修改点 4：`.banner-grad-3`（行 490-492）

**当前代码**：
```css
.banner-grad-3 {
  background: linear-gradient(135deg, #06b6d4 0%, #0ea5e9 50%, #3b82f6 100%);
}
```

**修正代码**：
```css
.banner-grad-3 {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary) 50%, var(--color-primary-dark) 100%);
}
```

**映射**：`#06b6d4` → `var(--color-primary)`、`#0ea5e9` → `var(--color-primary)`、`#3b82f6` → `var(--color-primary)`

**色标排列**：primary-primary-dark（重心偏右）

#### 色标排列设计意图

三组 banner 在仅有两个可用深色变量的约束下，通过色标位置置换（dark-primary-primary / primary-dark-primary / primary-primary-dark）最大化视觉区分，避免三组 banner 渐变过于雷同。

## 错误处理

无。本轮为纯 CSS 属性值替换，不涉及运行时错误路径。CSS 变量 fallback 机制确保即使设计系统变量未加载，页面仍有可用回退值。

## 行为契约

| 修改项 | 前置条件 | 后置条件 | 不变式 |
|--------|---------|---------|--------|
| G12 `@keyframes pageEnterFadeIn` | keyframes 名称 `pageEnterFadeIn` 存在 | keyframes 内容替换为上滑+淡入 | 名称不变，`.page-enter` 引用关系不变 |
| G12 `.page-enter` | 选择器 `.page-enter` 存在 | animation 简写改为新参数 | Home.vue 的 `.page-enter.home-page` 覆盖不受影响 |
| G15 变量名替换 | 4 处 CSS 属性值包含未定义变量 | 4 处均替换为设计系统有效变量 | fallback 值不变，选择器不变 |
| G18 品牌色替换 | 4 处 CSS 渐变包含硬编码色值 | 4 处均替换为设计系统变量 | 渐变方向和色标位置不变；文字白色 `color: #fff` 不受影响 |

## 依赖关系

### 依赖的已有资源

| 资源 | 路径 | 用途 |
|------|------|------|
| 设计系统 CSS 变量 | `src/assets/variables.css` | G15/G18 的目标变量来源 |
| 全局动画样式 | `src/styles/animations.css` | G12 修改目标 |
| Punch.vue | `src/views/Punch.vue` | G15 修改目标 |
| Home.vue | `src/views/Home.vue` | G18 修改目标 |

### 任务间依赖

G12、G15、G18 互不依赖，可独立并行实施。三个文件无交集，修改顺序任意。

### 暴露给后续任务的接口

- G12 修改后，全局 `.page-enter` 动画参数成为后续 R2（G14/G19 涉及动画/渐变相关修改）的视觉基线
- G18 修改后，Home.vue 品牌色与设计系统一致，为后续可能的主题切换功能奠定基础
