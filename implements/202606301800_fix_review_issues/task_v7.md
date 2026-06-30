# 任务指令（v7）

## 动作
NEW

## 任务描述
修复2个P3注释与命名问题。

### G1: main.ts 注释与实际存储介质不一致
- **文件**: `src/main.ts` 第12行
- **现状态**: 注释写 `// 自动从 localStorage 恢复登录态`
- **目标**: 改为 `// 自动从 sessionStorage 恢复登录态`
- **修改量**: 1行注释文字替换

### G4: enumLabels 常量命名为 LABELS 而非 ENUM_LABELS
- **文件**: `src/utils/enumLabels.ts` 第1行及所有引用处
- **现状态**: 常量名 `LABELS`，设计文档 §1.8.1 伪代码中为 `ENUM_LABELS`
- **目标**: 将 `const LABELS = {` 重命名为 `const ENUM_LABELS = {`，同步更新同文件内第42行的 `(LABELS as ...)` 引用为 `(ENUM_LABELS as ...)`
- **修改量**: 2处（第1行定义 + 第42行引用），均为同一文件内修改

## 选择理由
P3批次20个问题中依赖最低的2个——均为单行文本/命名修正，不涉及跨文件引用变更，无运行时行为影响。作为20个P3问题的破冰任务率先执行，确保后续更复杂修复在一个干净的基础上进行。

## 任务上下文
- 来源：审议式三轮代码审查报告 `reviews/202606291800_full_review/todo.md`
  - G1: Round 1 #G1 — v16设计已将 token/role/user 迁移至 sessionStorage，注释应反映实际存储介质
  - G4: Round 1 #G5 — 常量命名应使用全大写 `ENUM_LABELS` 以与设计文档 §1.8.1 保持一致，提升代码可追溯性

## 已有代码上下文
- `src/main.ts` 第12行：项目入口，`authStore.syncFromStorage()` 实际从 sessionStorage 读取认证状态
- `src/utils/enumLabels.ts`：枚举标签映射工具模块，导出 `enumLabel()` 函数供各视图使用。`LABELS` 常量仅在 `enumLabel()` 函数内部引用（第42行 `(LABELS as Record<...>)`），无外部直接引用，重命名影响范围完全在文件内。

## 后续任务预览
本轮批次共20个P3问题，按依赖关系分为5组：
1. **本任务**: G1 + G4（注释命名）
2. G7/G8/G13/G32（类型安全强化）
3. G3/G5/G9/G10/G11/G15/G16/G19/G28（代码复用与架构清理）
4. G22/G23/G25/G33（错误处理与边界防护）
5. G24（类型重命名）

各组之间无严格先后依赖，可按优先级顺序推进。
