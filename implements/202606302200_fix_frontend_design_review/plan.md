# 实现计划

任务描述：修复前端设计审查发现的6项CSS/模板问题（G3/G12/G14/G15/G18/G19），均为独立的前端修改，互不依赖。
项目根目录：C:\Users\DELL\Desktop\qingruanProject2026

---

## R1 NEW CSS基础修复（G12/G15/G18）
任务：修正全局动画曲线、Punch.vue CSS变量名、Home.vue品牌色
选择理由：三项均为"值/名称错误"型修复，不涉及结构变化，风险最低；全局动画影响所有页面体验，应优先修正
上下文：G12 涉及 src/styles/animations.css:2-9，G15 涉及 src/views/Punch.vue:306/1180/1203/1213，G18 涉及 src/views/Home.vue:381/484-492

## R2 NEW 模板/样式增强修复（G3/G14/G19）
任务：DoctorChatView 欢迎语空态、Risk.vue gradient-text 渐变、三视图 v-html Markdown :deep() 穿透
选择理由：G3（空态欢迎语）和 G19（Markdown 排版穿透）均为模板+样式组合修改，复杂度高于纯CSS值替换；G14（gradient-text）为单属性修改，可并入本轮。三项均依赖 R1 修正后的设计系统基线
上下文：G3 涉及 src/views/DoctorChatView.vue:326-354，G14 涉及 src/views/Risk.vue:1418-1423，G19 涉及 src/views/DoctorChatView.vue:351 / src/views/Admin.vue:199 / src/components/AiChatDialog.vue:172
