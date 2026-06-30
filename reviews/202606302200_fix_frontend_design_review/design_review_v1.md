# 设计审查报告（v1 r1）

## 审查结果
APPROVED

## 发现

### [轻微] G18 `.banner-grad-2` 映射表与代码块不一致

- **位置**：detail_v1.md 第 186-189 行（映射表）与第 181-184 行（代码块）
- **问题**：映射表声明 `#4f46e5` → `var(--color-primary-dark)`，但 `.banner-grad-2` 代码块中 0% 位置（原 `#4f46e5` 所在色标）使用了 `var(--color-primary)` 而非 `var(--color-primary-dark)`。
- **影响**：若实现者仅依据映射表做机械替换，将产生 `var(--color-primary-dark) 0%, var(--color-primary) 50%, var(--color-primary) 100%`，与代码块指定的 `var(--color-primary) 0%, var(--color-primary-dark) 50%, var(--color-primary) 100%` 不同。
- **说明**：第 209-213 行「色标排列设计意图」解释了这是有意为之的色标位置置换（dark-primary-primary / primary-dark-primary / primary-primary-dark），代码块是权威规格。实现者应直接遵循代码块，而非从映射表推导。映射表宜标注「以下为概念映射，实际色标排列见各修改点代码块」以避免歧义。

## 审查覆盖

| 任务项 | 设计覆盖 | 状态 |
|--------|---------|------|
| G12 @keyframes pageEnterFadeIn 重写 | 第 27-49 行 | 完整 |
| G12 .page-enter 动画参数修正 | 第 53-78 行 | 完整 |
| G15 Punch.vue 4处变量名替换 | 第 80-110 行 | 完整 |
| G18 Home.vue .home-logo 渐变 | 第 131-149 行 | 完整 |
| G18 Home.vue .banner-grad-1/2/3 | 第 151-213 行 | 完整，有轻微映射表歧义 |
