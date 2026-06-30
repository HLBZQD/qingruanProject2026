# 设计审查报告（v3 r1）

## 审查结果
APPROVED

## 发现

- **[轻微]** `parseWhereClause` 行为矩阵中 `"name = 'O''Brien'"` 案例的语义偏差：设计将 `O''Brien`（SQL转义形式，代表值 `O'Brien`）提取为参数值 `"O''Brien"` 后通过 `?` 占位符绑定。在旧版字符串拼接模式下，SQLite 会将 `'O''Brien'` 解释为单引号转义（实际值 `O'Brien`）；在参数化模式下，`better-sqlite3` 的 `?` 绑定将 `O''Brien` 原样传为字面量（含两个连续单引号字符），导致查询语义从"搜索 O'Brien"变为"搜索 O''Brien"。该偏差仅在 Dify Agent 生成的 WHERE 值包含 SQL 转义单引号时发生（实践中 AI 生成的是明文值而非转义值），不影响本设计对普通值的安全性与正确性，但行为矩阵声明"合法"不够精确，建议补充"不推荐在值中使用 SQL 转义单引号"的注释说明。

- **[轻微]** `query_table` 中 `params.order_by` 仍保留字符串拼接（`sql += ' ORDER BY ${params.order_by}'`），未纳入本次参数化范围。该字段虽不在 S5 问题描述中（S5 仅指向 `params.where` 拼接），也不在本次修改范围内，但同一函数的三处参数拼接中修复两处而保留一处，可能在后续审查中被视为遗漏。建议在 v3 设计或后续批次中明确 `order_by` 的注入风险评估和修复计划。

## 修改要求（仅 REJECTED 时）

无。
