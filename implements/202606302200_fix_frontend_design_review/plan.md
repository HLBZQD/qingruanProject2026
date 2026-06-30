# 实现计划

任务描述：修复前端设计审查发现的6项CSS/模板问题（G3/G12/G14/G15/G18/G19），均为独立的前端修改，互不依赖。
项目根目录：C:\Users\DELL\Desktop\qingruanProject2026

---

## R1 NEW CSS基础修复（G12/G15/G18）
任务：修正全局动画曲线、Punch.vue CSS变量名、Home.vue品牌色
选择理由：三项均为"值/名称错误"型修复，不涉及结构变化，风险最低；全局动画影响所有页面体验，应优先修正
上下文：G12 涉及 src/styles/animations.css:2-9，G15 涉及 src/views/Punch.vue:306/1180/1203/1213，G18 涉及 src/views/Home.vue:381/484-492

## R1 PASSED CSS基础修复（G12/G15/G18）
结果：实现了 G12 全局动画上滑+淡入、G15 Punch.vue 4 处 CSS 变量名映射、G18 Home.vue 4 处硬编码品牌色替换为设计系统变量。涉及 src/styles/animations.css、src/views/Punch.vue、src/views/Home.vue
测试：DesignSystemCss.spec.ts 全部通过（118 passed）。2 个失败为 AiChatDialog.spec.ts 预存问题（BC-S2b-1-b、BC-S2c-2-b），与本次修改无关

## R2 NEW 模板/样式增强修复（G3/G14/G19）
任务：DoctorChatView 欢迎语空态（模板+样式）、Risk.vue gradient-text 渐变（1条CSS属性）、三视图 v-html Markdown :deep() 排版穿透（3处样式追加）
选择理由：G3 空态欢迎语为模板+样式组合修改，G19 Markdown 穿透为纯样式追加，G14 gradient-text 为单属性修改，三者互不依赖可并行实施。R1 已修正设计系统基线（动画曲线、CSS变量名、品牌色），为本轮提供一致的设计系统上下文
上下文：G3 涉及 src/views/DoctorChatView.vue:326-354，G14 涉及 src/views/Risk.vue:1418-1423，G19 涉及 src/views/DoctorChatView.vue（.msg-content 后追加）、src/views/Admin.vue（.msg-content 后追加）、src/components/AiChatDialog.vue（.msg-content 后追加）
