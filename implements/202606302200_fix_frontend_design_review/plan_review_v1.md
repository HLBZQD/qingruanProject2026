# 计划审查报告（v1 r1）

## 审查结果
REJECTED

## 发现

### [严重] 计划未完整覆盖 6 项任务，仅规划 R1 的 3 项（G12/G15/G18），缺失 G3/G14/G19 的后续轮次

plan.md 声明任务范围为「修复前端设计审查发现的6项CSS/模板问题（G3/G12/G14/G15/G18/G19）」，但仅描述了 R1 一轮，覆盖 G12（全局动画）、G15（Punch.vue CSS 变量名）、G18（Home.vue 品牌色）三项。G3（DoctorChatView 欢迎语空态）、G14（Risk.vue 评分 gradient-text 渐变）、G19（三视图 v-html Markdown 缺 :deep() 穿透）三项完全没有出现在任何轮次规划中。

task_v1.md 同样仅包含 G12/G15/G18，Action 标记为 NEW，无 R2 或后续轮次的 action 定义。Planner 未对剩余 3 项进行任务拆分，后续实施者无法知晓何时、以何种顺序处理这些项，也无法评估各轮次间的依赖关系。必须补充 R2（及如需要 R3）的轮次规划，覆盖全部 6 项问题。

### [一般] G18 位置2（.banner-grad-1/2/3）颜色替换映射未明确定义

task_v1.md 要求将 `.banner-grad-1/2/3` 中硬编码色值替换为 `var(--color-primary)` 或其衍生色系，但存在两个歧义：

1. 实际源文件包含 5 种不同的梯度颜色（`#2563eb`、`#3b82f6`、`#0ea5e9`、`#4f46e5`、`#06b6d4`），task 仅列出了其中 3 种。`.banner-grad-2` 的起始色 `#4f46e5`（靛蓝）和 `.banner-grad-3` 的起始色 `#06b6d4`（青）均未被 task 提及，实施者无法判断是否也需要替换。

2. 「衍生色系」未指向 variables.css 中任何已定义的变量。当前设计系统仅有 `--color-primary: #4A90D9`、`--color-primary-light: #E8F1FB`、`--color-primary-dark: #3A7BC8` 三个衍生变量，而每个 banner 梯度需要 3 个色标。task 未给出从现有色值到 CSS 变量的具体映射表（如 `#2563eb→var(--color-primary-dark)`、`#0ea5e9→var(--color-primary)`），实施者将面临不可判定的选择。

期望修正：补充每个 banner-grad 类中每个硬编码色值对应的具体 CSS 变量名，覆盖全部 5 种原始色值；或明确仅替换 task 列出的 3 种而保留其他不变。

### [轻微] G15 修正表中 fallback 值与源文件实际值不一致

task_v1.md G15 映射表的「当前」列记录的 fallback 值（`#E5E7EB`、`#171717`、`#F3F4F6`）与源文件实际 fallback（`#e0e0e0`、`#333`、`#ddd`、`#f5f5f5`）存在多处偏差。虽然 task 已明确「仅替换变量名，保留 fallback 值不变」，偏差不至于导致错误修改，但可能误导实施者在验证时产生困惑。

### [轻微] 行号使用波浪号（~）前缀表示近似值

task_v1.md G15 和 G18 的行号标注使用 `~306`、`~1180` 等近似符号。当前文件行号恰好精确匹配，但行号本质上是脆弱的定位方式（git 操作、前后编辑均可能漂移）。建议同时提供 CSS 选择器或唯一的样式规则特征字符串作为辅助定位手段。

## 修改要求

### 严重问题

**计划未完整覆盖 6 项任务**：plan.md 仅覆盖 G12/G15/G18 三项，缺失 G3（DoctorChatView 欢迎语）、G14（Risk.vue gradient-text）、G19（v-html Markdown :deep() 穿透）的轮次规划。应在 plan.md 中补充 R2（至少覆盖 G3/G14/G19 三项），或在 task 说明中明确声明此轮仅处理 3 项、其余 3 项待后续 issue 跟踪。

### 一般问题

**G18 banner-grad 映射模糊**：为 `.banner-grad-1`、`.banner-grad-2`、`.banner-grad-3` 的每个色标逐一指定目标 CSS 变量，形成「源色值→目标变量」的完整映射表，消除「衍生色系」的歧义。同时确认 `#4f46e5` 和 `#06b6d4` 是否在本轮修改范围内。
