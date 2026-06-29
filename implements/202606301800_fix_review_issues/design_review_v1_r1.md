# 设计审查报告（v1 r1）

## 审查结果
REJECTED

## 发现

### [严重] 设计覆盖范围与需求严重不匹配——仅覆盖3/50个问题

需求文件 `requirement.md` 明确声明目标为："将所有50个问题转化为可勾选、可追踪的实现任务，更新 `reviews/202606291800_full_review/todo.md` 使其成为完整的可执行实现计划。" 需求涵盖了全部三轮审查（Round 1 设计合规性 + Round 2 代码质量 + Round 3 集成一致性）的50个问题，含17个严重问题和33个一般问题。

当前设计 `detail_v1.md` 仅覆盖了3个P0功能性断裂问题（S7/S8/S9），缺失了：
- 6个P1本迭代问题（S1/S2/S5/S6/S10/S11）
- 8个P2下迭代问题（S3/S4/S12/S13/S14/S15/S16/S17）
- 33个P3一般问题（G1-G33）
- 需求明确要求的 todo.md 更新任务

设计未声明此次迭代的边界、未规划后续批次、未解释为何其他47个问题不在本次设计范围内。即使P0优先是合理的迭代策略，设计文档也应当明确划定本轮范围、标注遗留问题归属、提供 deferral plan。

### [一般] 设计未与详细设计文档交叉验证合规性

需求中列出 `docs/2_detailed_design_v4.md` 作为审查依据之一，且详细设计文档 §3.2.3（行1578-1580）明确规定了 `clearAuth()` 需包含的清理步骤（`abortActiveConnection` → `clearAllConversations` → `riskFormStore.reset`），§4.3 流程图（行3814-3816）亦有相同要求。经实际验证，设计提出的三项修改与详细设计文档一致，但设计文档自身未引用或展示这一合规性校验过程。

### [轻微] Redundant call in authStore.ts clearAuth() 清理序列

设计在 `clearAuth()` 中先调用 `abortActiveConnection()` 再调用 `clearAllConversations()`。经查验 `src/stores/chatStore.ts:605`，`clearAllConversations()` 内部首行即调用 `abortActiveConnection()`。因此设计中的 `abortActiveConnection()` 调用是冗余的——第二次调用时 `activeAbortController` 已为 null，操作为无操作（no-op）。该冗余调用无害（方法本身幂等），但反映了设计对已有 API 内部行为的认知不足。

### [轻微] ArticleDetailView.vue 行号引用偏差

设计称 `</script>` 位于第139行，实际文件 `</script>` 位于第140行。插入意图（紧跟 `toggleCollect` 函数闭合之后、`</script>` 之前）明确，不影响实现正确性。

## 修改要求（仅 REJECTED 时）

### 对严重问题：设计覆盖范围与需求不匹配

**问题**：需求要求将全部50个审查问题转化为可追踪实现任务并更新 todo.md，设计仅覆盖了3个P0问题，缺失47个问题的处理方案和 todo.md 更新任务。

**期望修正方向**：二选一——
1. 如果本轮设计仅针对P0：在设计中明确声明"v1 仅覆盖 P0 立即修复（S7/S8/S9）"，补充后续迭代计划（P1/P2/P3 归属 v2/v3/v4），并至少将 todo.md 的 task 化更新纳入本次设计任务。
2. 如果本轮设计应覆盖全部50个问题：扩展设计范围，为每个优先级（P0-P3）的每个问题制定修改规格、文件规划、行为契约和错误处理，同时将 todo.md 的结构化更新作为设计产出一部分。
