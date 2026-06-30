# 问题诊断任务

## 问题现象

管理员账号在"我的"页面可以看到"智能管理"功能入口，但点击该入口后无法正常跳转到 `/admin` 智能管理页面。

## 相关文件

- `src/views/Profile.vue` — "我的"页面，"智能管理"菜单项的渲染与点击处理
- `src/stores/authStore.ts` — 认证状态管理，`isAdmin` 计算属性
- `src/router/index.ts` — 路由配置与导航守卫
- `src/views/Admin.vue` — 智能管理目标页面
- `src/composables/useAuth.ts` — JWT 解析与过期检测
- `src/main.ts` — 应用入口，authStore 初始化

## 技术栈

- Vue 3 + TypeScript + Pinia + Vue Router
- JWT 认证，sessionStorage 持久化
- BroadcastChannel 跨标签页同步

## 诊断要求

1. 定位根因所在的具体代码位置和触发条件
2. 建立从问题现象到根因的完整因果链
3. 分析影响范围
4. 诊断报告停留在"定位层"，不深入到"修复层"
