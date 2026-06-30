# 详细设计（v7）

## 概述
修复2个P3注释与命名问题：G1（main.ts 注释修正 localStorage -> sessionStorage）和 G4（enumLabels.ts 常量重命名 LABELS -> ENUM_LABELS）。均为单行/同文件内修正，无跨文件依赖，无运行时行为变更。

## 文件规划

| 文件路径 | 操作 | 职责 |
|---------|------|------|
| src/main.ts | 修改 | 第12行注释文字替换：`localStorage` -> `sessionStorage` |
| src/utils/enumLabels.ts | 修改 | 第1行常量定义重命名 + 第42行引用同步更新 |

## 修改规格

### G1: src/main.ts 注释修正

**位置**：第12行
**现状**：`// 自动从 localStorage 恢复登录态`
**目标**：`// 自动从 sessionStorage 恢复登录态`

**依据**：`authStore.syncFromStorage()`（`src/stores/authStore.ts:104`）实际调用 `sessionStorage.getItem('token')`，从未访问 localStorage。v16 设计已将 token/role/user 全面迁移至 sessionStorage。

**修改方式**：精确字符串替换，仅改注释文字，不触碰任何代码逻辑。

### G4: src/utils/enumLabels.ts 常量重命名

**位置**：第1行（定义）、第42行（引用）
**现状**：`const LABELS = {` / `(LABELS as Record<...>)`
**目标**：`const ENUM_LABELS = {` / `(ENUM_LABELS as Record<...>)`

**影响范围分析**：
- `LABELS` 是模块级私有常量，仅在第42行 `enumLabel()` 函数内部引用
- 外部文件（Punch.vue、LifePlan.vue）仅导入 `enumLabel` 函数，不直接导入 `LABELS`
- 重命名完全限定在 `src/utils/enumLabels.ts` 文件内部，无跨文件联动修改

**修改方式**：两处精确字符串替换
1. 第1行：`const LABELS = {` -> `const ENUM_LABELS = {`
2. 第42行：`(LABELS as Record<string, Record<string, string>>)` -> `(ENUM_LABELS as Record<string, Record<string, string>>)`

## 类型定义

无新增或修改类型。两个修改均为文字级修正：
- G1 仅改注释，不涉及类型系统
- G4 仅改变量名，类型签名 `Record<string, Record<string, string>>` 不变，`as const satisfies` 约束不变

## 错误处理

无。两个修改均不改变任何运行时行为：
- G1：注释修改对编译产物无影响
- G4：变量重命名在编译后符号名不保留，运行时行为完全等价

## 行为契约

无前置/后置条件变更。修改前后程序行为完全一致：
- G1：注释仅影响人类阅读，不影响编译器或运行时
- G4：`enumLabel()` 函数签名 `(category: string, value: string): string` 不变，调用方无需任何适配

## 依赖关系

- **依赖已有代码**：`src/main.ts` 依赖 `src/stores/authStore.ts` 的 `syncFromStorage()` 实现（以确认注释内容的正确性）
- **暴露给后续任务**：无。G1 和 G4 均为终点修改，不引入任何新接口或公共符号变更
