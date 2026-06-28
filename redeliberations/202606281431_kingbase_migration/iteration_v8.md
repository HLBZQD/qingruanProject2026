# 再审议判定报告（v8）

## 判定结果

RETRY

## 判定理由

组件B诊断报告（b_v8_diag_v1.md）识别出7个问题，其中严重问题1个（问题1：pg驱动timestamp类型自动解析导致API响应格式不一致，违背"前端代码零变动"核心承诺），一般问题3个（问题2：KingbaseAdapter close()方法及优雅关闭机制缺失；问题3：dateRange.js工具模块与KingbaseES日期参数兼容性未评估；问题4：SQLite AUTOINCREMENT与PostgreSQL SERIAL语义差异未讨论），轻微问题3个（问题5：连接池大小确定方法缺失；问题6：文件名与内容版本号矛盾；问题7：query_table的WHERE子句注入路径未列入风险表）。

组件B质询报告（b_v8_challenge_v1.md）结论为LOCATED，确认诊断报告所识别的全部问题证据充分、逻辑完整、覆盖完备，诊断结论可信。质询过程中提出的3条[建议]条目为优化性建议，不构成对诊断可信度的质疑。组件B内部循环实际轮次为1（远小于最大轮次12），质询已提前确认诊断结果。

根据判定标准，审查报告包含严重和一般等级的问题，满足RETRY条件。产出作者需解决问题1（timestamp序列化格式一致性）、问题2（优雅关闭机制）、问题3（dateRange.js兼容性验证）、问题4（AUTOINCREMENT语义差异讨论）后重新提交。

## 需要解决的问题

- **问题描述**：pg驱动默认将TIMESTAMP列解析为JavaScript Date对象，JSON序列化后变为ISO 8601字符串格式，与SQLite路径下timestamp以纯文本形式返回的格式不一致。同一API端点在SQLite和KingbaseES两个后端下返回不同的JSON格式，直接违背方案第14节"前端代码零变动"和第6节"所有现有API端点返回的HTTP状态码和响应结构与改造前一致"的核心承诺。影响9张表的11个datetime字段。
- **所在位置**：方案第3.4.4节 KingbaseAdapter query()、第6节Phase 1验收标准、第14节"前端代码零变动"声明
- **严重程度**：严重
- **改进建议**：在KingbaseAdapter中配置pg.types.setTypeParser(1114, val => val)和pg.types.setTypeParser(1184, val => val)将timestamp/timestamptz列原样返回字符串，与SQLite行为一致。或若保留Date对象行为，需明确撤回"前端代码零变动"声明并标注格式差异为已知变更。

- **问题描述**：KingbaseAdapter的close()方法实现（需调用pool.end()）在整个方案中毫无提及，方案也完全未讨论应用优雅关闭机制（SIGTERM/SIGINT信号处理），缺少此机制将导致连接池暴力断开、进行中事务中断等问题。
- **所在位置**：方案第3.2节接口定义、第3.4节KingbaseAdapter实现要点、第3.5.1节server.js启动流程
- **严重程度**：一般
- **改进建议**：在第3.4节新增close()方法子节；在第3.5.1节新增优雅关闭段落；在第13.3节运维维度和第15节风险表补充对应条目。

- **问题描述**：punch.js依赖server/utils/dateRange.js的parseDateRange()生成日期查询参数，其endDate输出格式为YYYY-MM-DDTHH:MM:SS（含T分隔符）。在KingbaseES中需隐式将TEXT转换为TIMESTAMP才能与TIMESTAMP类型列比较，此格式的转换行为未经确认。
- **所在位置**：方案第4.2节方言统一策略、第3.6节punch.js改造说明、server/utils/dateRange.js
- **严重程度**：一般
- **改进建议**：在KingbaseES V8R6上验证含T分隔符日期字符串的隐式类型转换行为；若兼容则标注"dateRange.js无需改造"，若不兼容则制定改造方案。

- **问题描述**：SQLite的INTEGER PRIMARY KEY AUTOINCREMENT保证ID不重复使用且严格单调递增，PostgreSQL的SERIAL基于SEQUENCE不具备no-reuse保证。方案将AUTOINCREMENT→SERIAL列为纯语法翻译，未讨论此语义差异的潜在影响（如按ID排序推断时间、假定无间隙的分页逻辑等）。
- **所在位置**：方案第10.2节翻译规则表、第4.1节差异清单
- **严重程度**：一般
- **改进建议**：在翻译规则表中增加语义差异注释；在差异清单中扩展说明；建议在Phase 1双库对比测试中验证ID排序行为；若确认应用代码无隐式依赖则明确声明。
