# 实现需求：修复全量代码审查发现的50个问题

## 来源

审议式三轮代码审查（Round 1 设计合规性 + Round 2 代码质量 + Round 3 集成一致性），审查报告位于 `reviews/202606291800_full_review/todo.md`。

## 审查范围

全部前端（src/）和后端（server/）代码，56+28=84个文件。

## 审查依据

`docs/2_detailed_design_v4.md` + `docs/prototype.html`

## 问题统计

- 总计：50 个问题（17 严重 + 33 一般）
- P0 立即修复：3 个（S7/S8/S9）
- P1 本迭代：6 个（S1/S2/S5/S6/S10/S11）
- P2 下迭代：8 个（S3/S4/S12/S14/S15/S16/S17/S13）
- P3 后续优化：33 个（所有一般问题 G1-G33）

## 目标

将所有50个问题转化为可勾选、可追踪的实现任务，更新 `reviews/202606291800_full_review/todo.md` 使其成为完整的可执行实现计划。

## 项目根目录

C:\Users\DELL\Desktop\qingruanProject2026
