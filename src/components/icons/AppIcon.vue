<script setup lang="ts">
const props = withDefaults(defineProps<{
  name: string
  size?: number | string
  color?: string
}>(), {
  size: 24,
  color: 'currentColor',
})
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    :style="{ color: color }"
    aria-hidden="true"
  >
    <!-- logo: 品牌标识 / 首页顶部logo / 登录页品牌标志 -->
    <g v-if="name === 'logo'">
      <path
        d="M12 2C9.5 4 6 6.5 6 10.5C6 14.5 8.5 18 12 22C15.5 18 18 14.5 18 10.5C18 6.5 14.5 4 12 2Z"
        fill="currentColor"
        opacity="0.15"
      />
      <path
        d="M12 2C9.5 4 6 6.5 6 10.5C6 14.5 8.5 18 12 22C15.5 18 18 14.5 18 10.5C18 6.5 14.5 4 12 2Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M12 7.5C10.5 8.5 9.5 9.8 9.5 11.5C9.5 13.5 10.5 15.5 12 17.5C13.5 15.5 14.5 13.5 14.5 11.5C14.5 9.8 13.5 8.5 12 7.5Z"
        fill="currentColor"
      />
      <circle cx="12" cy="11.5" r="2.5" fill="#fff" />
    </g>

    <!-- assistant: AI 助手 / FAB 按钮 / 弹窗头像 -->
    <g v-else-if="name === 'assistant'">
      <rect x="5" y="4" width="14" height="14" rx="5" stroke="currentColor" stroke-width="2" />
      <circle cx="9.5" cy="10.5" r="1.5" fill="currentColor" />
      <circle cx="14.5" cy="10.5" r="1.5" fill="currentColor" />
      <path d="M9.5 14.5C10.5 15.3 13.5 15.3 14.5 14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M12 18V21M8 21H16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- send: 发送按钮 -->
    <g v-else-if="name === 'send'">
      <path
        d="M3 12L21 4L16 20L12 14L3 12Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M12 14L16 20" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- home: 首页 -->
    <g v-else-if="name === 'home'">
      <path
        d="M4 10L12 4L20 10"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M6 10V18C6 19.1046 6.89543 20 8 20H16C17.1046 20 18 19.1046 18 18V10"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M10 20V14.5C10 13.6716 10.6716 13 11.5 13H12.5C13.3284 13 14 13.6716 14 14.5V20"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>

    <!-- doctor: 咨询/医生 -->
    <g v-else-if="name === 'doctor'">
      <path
        d="M12 4C10.3431 4 9 5.34315 9 7V9H15V7C15 5.34315 13.6569 4 12 4Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M18 20V13C18 11.3431 16.6569 10 15 10H9C7.34315 10 6 11.3431 6 13V20"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M12 13V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M10 15H14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- plan: 生活方案 -->
    <g v-else-if="name === 'plan'">
      <path
        d="M7 5H17C18.1046 5 19 5.89543 19 7V17C19 18.1046 18.1046 19 17 19H7C5.89543 19 5 18.1046 5 17V7C5 5.89543 5.89543 5 7 5Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M8 9H16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M8 13H13" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M16 13L17 14L19 11.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- news: 资讯 -->
    <g v-else-if="name === 'news'">
      <path
        d="M5 6C5 4.89543 5.89543 4 7 4H17C18.1046 4 19 4.89543 19 6V18C19 19.1046 18.1046 20 17 20H7C5.89543 20 5 19.1046 5 18V6Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M8 9H16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M8 13H16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M8 17H12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <circle cx="15.5" cy="17.5" r="1.5" fill="currentColor" />
    </g>

    <!-- profile: 我的 -->
    <g v-else-if="name === 'profile'">
      <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2" />
      <path
        d="M5 20C5 16.134 8.13401 13 12 13C15.866 13 19 16.134 19 20"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>

    <!-- heart-pulse: 健康/风险预测 -->
    <g v-else-if="name === 'heart-pulse'">
      <path
        d="M12 21.35C12 21.35 4.5 14.7 4.5 9.7C4.5 7.1 6.5 5 9 5C10.5 5 11.9 5.8 12.7 7.1C13.5 5.8 14.9 5 16.5 5C19 5 21 7.1 21 9.7C21 14.7 12 21.35 12 21.35Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M7 12H9.5L11 9L13 15L14.5 12H17"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>

    <!-- calendar-check: 打卡记录 -->
    <g v-else-if="name === 'calendar-check'">
      <path
        d="M17 5H7C5.89543 5 5 5.89543 5 7V17C5 18.1046 5.89543 19 7 19H17C18.1046 19 19 18.1046 19 17V7C19 5.89543 18.1046 5 17 5Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M5 10H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M9 3V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M15 3V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M10 15L12 17L16 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- lightbulb: 健康建议 -->
    <g v-else-if="name === 'lightbulb'">
      <path
        d="M12 3C8.5 3 6 5.5 6 9C6 11.5 7.5 13.5 9 15C9.5 15.5 10 16.5 10 18V19C10 19.5 10.5 20 11 20H13C13.5 20 14 19.5 14 19V18C14 16.5 14.5 15.5 15 15C16.5 13.5 18 11.5 18 9C18 5.5 15.5 3 12 3Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M9 21H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M10 17H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </g>

    <!-- shield: 智能管理/安全 -->
    <g v-else-if="name === 'shield'">
      <path
        d="M12 22C12 22 20 18 20 11V5L12 2L4 5V11C4 18 12 22 12 22Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M9 12L11.5 14.5L15 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- user-edit: 编辑资料 -->
    <g v-else-if="name === 'user-edit'">
      <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2" />
      <path
        d="M5 20C5 16.134 8.13401 13 12 13C12.7 13 13.4 13.1 14 13.3"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M19.5 14.5L15.5 18.5L14 17L18 13L19.5 14.5Z"
        fill="currentColor"
      />
      <path d="M14 17L15.5 18.5L18 21H14V17Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
    </g>

    <!-- search: 搜索 -->
    <g v-else-if="name === 'search'">
      <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M20 20L16.5 16.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- camera: 上传头像 -->
    <g v-else-if="name === 'camera'">
      <path
        d="M20 7H17.5L16.5 5H13.5L12.5 7H11.5L10.5 5H7.5L6.5 7H4C2.89543 7 2 7.89543 2 9V17C2 18.1046 2.89543 19 4 19H20C21.1046 19 22 18.1046 22 17V9C22 7.89543 21.1046 7 20 7Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="12" cy="13" r="3.5" stroke="currentColor" stroke-width="2" />
      <circle cx="18.5" cy="10.5" r="1" fill="currentColor" />
    </g>

    <!-- sign-out: 退出登录 -->
    <g v-else-if="name === 'sign-out'">
      <path
        d="M10 16H6C4.89543 16 4 15.1046 4 14V10C4 8.89543 4.89543 8 6 8H10"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M16 12H10M16 12L13.5 9.5M16 12L13.5 14.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M14 4H18C19.1046 4 20 4.89543 20 6V18C20 19.1046 19.1046 20 18 20H14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- refresh: 重试 -->
    <g v-else-if="name === 'refresh'">
      <path
        d="M20 11.5C20 11.5 18.5 6.5 13 6.5C9.5 6.5 6.5 9 5.5 12"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M4 12.5C4 12.5 5.5 17.5 11 17.5C14.5 17.5 17.5 15 18.5 12"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M20 8V11.5H16.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M4 16V12.5H7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- chevron-right: 右箭头/更多 -->
    <g v-else-if="name === 'chevron-right'">
      <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- arrow-right: 右箭头/CTA -->
    <g v-else-if="name === 'arrow-right'">
      <path d="M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M13 6L19 12L13 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- exclamation: 错误/警告 -->
    <g v-else-if="name === 'exclamation'">
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" />
      <path d="M12 7V13" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <circle cx="12" cy="16.5" r="1" fill="currentColor" />
    </g>

    <!-- info: 信息/免责声明 -->
    <g v-else-if="name === 'info'">
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" />
      <path d="M12 11V16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" />
    </g>

    <!-- ai-doctor: 首页 banner AI 医师 -->
    <g v-else-if="name === 'ai-doctor'">
      <path
        d="M19 12C19 16.4183 15.4183 20 11 20C6.58172 20 3 16.4183 3 12C3 7.58172 6.58172 4 11 4C15.4183 4 19 7.58172 19 12Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M11 8V14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M8 11H14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <circle cx="16.5" cy="6.5" r="2" fill="currentColor" />
      <path d="M15.5 6.5H17.5" stroke="#fff" stroke-width="1" stroke-linecap="round" />
    </g>

    <!-- check-in: 首页 banner 每日打卡 -->
    <g v-else-if="name === 'check-in'">
      <path
        d="M17 5H7C5.89543 5 5 5.89543 5 7V17C5 18.1046 5.89543 19 7 19H17C18.1046 19 19 18.1046 19 17V7C19 5.89543 18.1046 5 17 5Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M5 10H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M9 3V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M15 3V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M9 14L11 16L15 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- trash: 清空对话 -->
    <g v-else-if="name === 'trash'">
      <path d="M4 7H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M10 11V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M14 11V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path
        d="M7 7V18C7 19.1046 7.89543 20 9 20H15C16.1046 20 17 19.1046 17 18V7"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M9 7V5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- eye: 阅读量 -->
    <g v-else-if="name === 'eye'">
      <path
        d="M12 5C7.5 5 4 8.5 2 12C4 15.5 7.5 19 12 19C16.5 19 20 15.5 22 12C20 8.5 16.5 5 12 5Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" stroke-width="2" />
    </g>

    <!-- arrow-left: 返回 -->
    <g v-else-if="name === 'arrow-left'">
      <path d="M19 12H5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M11 6L5 12L11 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- chevron-left: 左箭头 -->
    <g v-else-if="name === 'chevron-left'">
      <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- chevron-down: 向下箭头 -->
    <g v-else-if="name === 'chevron-down'">
      <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- close: 关闭/删除 -->
    <g v-else-if="name === 'close'">
      <path d="M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- heart: 收藏/喜欢 -->
    <g v-else-if="name === 'heart'">
      <path
        d="M12 21.35C12 21.35 4.5 14.7 4.5 9.7C4.5 7.1 6.5 5 9 5C10.5 5 11.9 5.8 12.7 7.1C13.5 5.8 14.9 5 16.5 5C19 5 21 7.1 21 9.7C21 14.7 12 21.35 12 21.35Z"
        fill="currentColor"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>

    <!-- heart-empty: 未收藏 -->
    <g v-else-if="name === 'heart-empty'">
      <path
        d="M12 21.35C12 21.35 4.5 14.7 4.5 9.7C4.5 7.1 6.5 5 9 5C10.5 5 11.9 5.8 12.7 7.1C13.5 5.8 14.9 5 16.5 5C19 5 21 7.1 21 9.7C21 14.7 12 21.35 12 21.35Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>

    <!-- inbox: 空态 -->
    <g v-else-if="name === 'inbox'">
      <path
        d="M4 9H20V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V9Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M4 9L8 4H16L20 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M12 13V16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M9 16H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- spinner: 加载中 -->
    <g v-else-if="name === 'spinner'">
      <path
        d="M12 2V6"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
      <path
        d="M12 18V22"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        opacity="0.4"
      />
      <path
        d="M4.93 4.93L7.76 7.76"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        opacity="0.7"
      />
      <path
        d="M16.24 16.24L19.07 19.07"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        opacity="0.4"
      />
      <path
        d="M2 12H6"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        opacity="0.85"
      />
      <path
        d="M18 12H22"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        opacity="0.4"
      />
      <path
        d="M4.93 19.07L7.76 16.24"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        opacity="0.55"
      />
      <path
        d="M16.24 7.76L19.07 4.93"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        opacity="0.4"
      />
    </g>

    <!-- lock: 密码/安全 -->
    <g v-else-if="name === 'lock'">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M8 11V7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7V11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="12" cy="16" r="1.5" fill="currentColor" />
    </g>

    <!-- redo: 重试/刷新 -->
    <g v-else-if="name === 'redo'">
      <path d="M4 12.5C4 12.5 5.5 17.5 11 17.5C14.5 17.5 17.5 15 18.5 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M20 16V12.5H16.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- file-question: 文件异常 -->
    <g v-else-if="name === 'file-question'">
      <path
        d="M14 2H7C5.89543 2 5 2.89543 5 4V20C5 21.1046 5.89543 22 7 22H17C18.1046 22 19 21.1046 19 20V8L14 2Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M14 2V8H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M12 18V18.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M12 14C12 13 12.5 12.2 13.5 11.8C14.5 11.4 15 10.5 15 9.5C15 7.8 13.7 6.5 12 6.5C10.3 6.5 9 7.8 9 9.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- triangle-warning: 警告 -->
    <g v-else-if="name === 'triangle-warning'">
      <path
        d="M12 3L2 20H22L12 3Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M12 9V13" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <circle cx="12" cy="16.5" r="1" fill="currentColor" />
    </g>

    <!-- user-pen: 用户编辑 -->
    <g v-else-if="name === 'user-pen'">
      <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2" />
      <path d="M5 20C5 16.134 8.13401 13 12 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M15.5 14.5L19.5 18.5L18 20L14 16L15.5 14.5Z" fill="currentColor" />
      <path d="M14 16L18 20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- layer-group: 分类/层级 -->
    <g v-else-if="name === 'layer-group'">
      <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M2 7L12 12L22 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- calendar: 日历 -->
    <g v-else-if="name === 'calendar'">
      <path
        d="M17 5H7C5.89543 5 5 5.89543 5 7V17C5 18.1046 5.89543 19 7 19H17C18.1046 19 19 18.1046 19 17V7C19 5.89543 18.1046 5 17 5Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M5 10H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M9 3V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M15 3V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- magic: 魔法/生成 -->
    <g v-else-if="name === 'magic'">
      <path d="M12 3V5M12 19V21M5 12H3M21 12H19M7.05 7.05L5.636 5.636M18.364 18.364L16.95 16.95M7.05 16.95L5.636 18.364M18.364 5.636L16.95 7.05" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M12 8L14.5 12.5L12 14L9.5 12.5L12 8Z" fill="currentColor" />
    </g>

    <!-- arrows-rotate: 重新定制 -->
    <g v-else-if="name === 'arrows-rotate'">
      <path d="M20 11.5C20 11.5 18.5 6.5 13 6.5C9.5 6.5 6.5 9 5.5 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M4 12.5C4 12.5 5.5 17.5 11 17.5C14.5 17.5 17.5 15 18.5 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M20 8V11.5H16.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M4 16V12.5H7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- sun: 早餐 -->
    <g v-else-if="name === 'sun'">
      <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2" />
      <path d="M12 2V5M12 19V22M2 12H5M19 12H22M4.93 4.93L7.05 7.05M16.95 16.95L19.07 19.07M4.93 19.07L7.05 16.95M16.95 7.05L19.07 4.93" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- bowl-food: 午餐/正餐 -->
    <g v-else-if="name === 'bowl-food'">
      <path
        d="M4 10C4 14.4183 7.58172 18 12 18C16.4183 18 20 14.4183 20 10"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M4 10H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M12 18V21M7 21H17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M9 6C9 6 10 7 12 7C14 7 15 6 15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M7 8C7 8 8.5 9.5 12 9.5C15.5 9.5 17 8 17 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- apple-whole: 加餐/水果 -->
    <g v-else-if="name === 'apple-whole'">
      <path
        d="M12 6C10 5 7 6.5 7 10.5C7 14.5 9.5 18 12 20C14.5 18 17 14.5 17 10.5C17 6.5 14 5 12 6Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M12 6V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M14 3C14 3 13 2 12 2C11 2 10 3 10 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- moon: 晚餐 -->
    <g v-else-if="name === 'moon'">
      <path
        d="M21 12.79C20.5 12.92 20 13 19.5 13C15.91 13 13 10.09 13 6.5C13 6 13.08 5.5 13.21 5C10.1 5.41 8 8.1 8 11.5C8 15.64 11.36 19 15.5 19C18.9 19 21.59 16.9 22 13.79C21.5 13.92 21 13.99 21 12.79Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>

    <!-- utensils: 餐具/饮食 -->
    <g v-else-if="name === 'utensils'">
      <path d="M7 3V12C7 13.5 8 14.5 9.5 14.5C11 14.5 12 13.5 12 12V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M9 14.5V21" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M17 3V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M17 14V21" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M17 14C15.5 14 14.5 13 14.5 11.5V10H19.5V11.5C19.5 13 18.5 14 17 14Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- person-walking: 步行 -->
    <g v-else-if="name === 'person-walking'">
      <circle cx="13" cy="5" r="2.5" stroke="currentColor" stroke-width="2" />
      <path d="M10 10L12.5 12L11 16L13 20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M16 20L14.5 16L15.5 12L18 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M8 8L11 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M8 20H10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- dumbbell: 力量训练 -->
    <g v-else-if="name === 'dumbbell'">
      <path d="M6 5V3C6 2.4 6.4 2 7 2H9C9.6 2 10 2.4 10 3V5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M14 5V3C14 2.4 14.4 2 15 2H17C17.6 2 18 2.4 18 3V5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M4 5H20C20.5 5 21 5.5 21 6V10C21 10.5 20.5 11 20 11H4C3.5 11 3 10.5 3 10V6C3 5.5 3.5 5 4 5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M6 11V19C6 19.5 6.4 20 7 20H9C9.6 20 10 19.5 10 19V11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M14 11V19C14 19.5 14.4 20 15 20H17C17.6 20 18 19.5 18 19V11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- person-swimming: 游泳 -->
    <g v-else-if="name === 'person-swimming'">
      <circle cx="15" cy="5" r="2.5" stroke="currentColor" stroke-width="2" />
      <path d="M5 14C5 14 7 12 10 13C13 14 15 12 18 13C21 14 22 15 22 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M11 9C11 9 12 11 15 11C18 11 19 9 19 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M5 18C5 18 7 16 10 17C13 18 15 16 18 17C21 18 22 19 22 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- person-running: 跑步 -->
    <g v-else-if="name === 'person-running'">
      <circle cx="13" cy="5" r="2.5" stroke="currentColor" stroke-width="2" />
      <path d="M9 11L12 10L14 13L11 18L14 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M16 21L14 13L17 11L20 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M7 9L10 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M6 21H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- sliders: 设置/调整 -->
    <g v-else-if="name === 'sliders'">
      <path d="M4 7H10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M14 7H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <circle cx="12" cy="7" r="2" stroke="currentColor" stroke-width="2" />
      <path d="M4 17H10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M14 17H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <circle cx="12" cy="17" r="2" stroke="currentColor" stroke-width="2" />
      <path d="M4 12H7" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M17 12H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <circle cx="15" cy="12" r="2" stroke="currentColor" stroke-width="2" />
    </g>

    <!-- check: 勾选/完成 -->
    <g v-else-if="name === 'check'">
      <path d="M5 12L10 17L19 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- circle-empty: 未选中圆圈 -->
    <g v-else-if="name === 'circle-empty'">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
    </g>

    <!-- xmark: 叉 -->
    <g v-else-if="name === 'xmark'">
      <path d="M7 7L17 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- shield-heart: 健康护盾 -->
    <g v-else-if="name === 'shield-heart'">
      <path
        d="M12 22C12 22 20 18 20 11V5L12 2L4 5V11C4 18 12 22 12 22Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M12 18C12 18 7 14.5 7 11.5C7 9.5 8.5 8 10.5 8C11.5 8 12.5 8.5 13 9.5C13.5 8.5 14.5 8 15.5 8C17.5 8 19 9.5 19 11.5C19 14.5 12 18 12 18Z"
        fill="currentColor"
      />
    </g>

    <!-- question-circle: 未知 -->
    <g v-else-if="name === 'question-circle'">
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" />
      <path d="M9 9C9 7.5 10.3 6.5 12 6.5C13.7 6.5 15 7.5 15 9C15 10.5 13.7 11.5 12.5 11.5V14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </g>

    <!-- cake-candles: 生日/年龄 -->
    <g v-else-if="name === 'cake-candles'">
      <path
        d="M4 19C4 20.1046 4.89543 21 6 21H18C19.1046 21 20 20.1046 20 19V14H4V19Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M4 14H20V12C20 10.5 18.5 9 17 9H7C5.5 9 4 10.5 4 12V14Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M12 9V5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M8 9V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M16 9V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- ruler-vertical: 身高 -->
    <g v-else-if="name === 'ruler-vertical'">
      <path d="M8 3H16C17.1046 3 18 3.89543 18 5V19C18 20.1046 17.1046 21 16 21H8C6.89543 21 6 20.1046 6 19V5C6 3.89543 6.89543 3 8 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M10 7H14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M10 11H14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M10 15H12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M10 19H12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- weight-scale: 体重 -->
    <g v-else-if="name === 'weight-scale'">
      <path
        d="M12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M9 15H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M12 15V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M8 10H16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- tape: 腰围 -->
    <g v-else-if="name === 'tape'">
      <path d="M5 16V8C5 6.5 6.5 5 8 5H16C17.5 5 19 6.5 19 8V16C19 17.5 17.5 19 16 19H8C6.5 19 5 17.5 5 16Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M8 10H16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M8 14H16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <circle cx="8" cy="12" r="1.5" fill="currentColor" />
    </g>

    <!-- circle-notch: 加载中 -->
    <g v-else-if="name === 'circle-notch'">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity="0.3" />
      <path d="M12 3V12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- rotate-left: 重新评估 -->
    <g v-else-if="name === 'rotate-left'">
      <path d="M4 12.5C4 12.5 5.5 17.5 11 17.5C14.5 17.5 17.5 15 18.5 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M4 16V12.5H7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- clock-rotate-left: 历史 -->
    <g v-else-if="name === 'clock-rotate-left'">
      <path d="M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M12 7V12L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M4 12.5C4 12.5 5.5 17.5 11 17.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M4 16V12.5H7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- comment-dots: 对话 -->
    <g v-else-if="name === 'comment-dots'">
      <path
        d="M21 11C21 14.5 18.5 17 15 17H13L9 21V17H7C3.5 17 1 14.5 1 11C1 7.5 3.5 5 7 5H15C18.5 5 21 7.5 21 11Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="7.5" cy="11" r="1" fill="currentColor" />
      <circle cx="11.5" cy="11" r="1" fill="currentColor" />
      <circle cx="15.5" cy="11" r="1" fill="currentColor" />
    </g>

    <!-- history: 历史记录 -->
    <g v-else-if="name === 'history'">
      <path d="M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M12 7V12L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- list-alt: 列表 -->
    <g v-else-if="name === 'list-alt'">
      <path d="M4 5H20C20.5 5 21 5.5 21 6V18C21 18.5 20.5 19 20 19H4C3.5 19 3 18.5 3 18V6C3 5.5 3.5 5 4 5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M7 9H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M7 13H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M7 17H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M12 9H17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M12 13H17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M12 17H17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- face-smile: 健康/高兴 -->
    <g v-else-if="name === 'face-smile'">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="15" cy="10" r="1" fill="currentColor" />
      <path d="M8 14C8.5 15.5 10 16.5 12 16.5C14 16.5 15.5 15.5 16 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- mars: 男 -->
    <g v-else-if="name === 'mars'">
      <circle cx="10" cy="14" r="5" stroke="currentColor" stroke-width="2" />
      <path d="M14 10L19 5M19 5V9M19 5H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- venus: 女 -->
    <g v-else-if="name === 'venus'">
      <circle cx="12" cy="9" r="5" stroke="currentColor" stroke-width="2" />
      <path d="M12 14V21M9 18H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- default fallback: 菱形占位 -->
    <g v-else>
      <rect x="5" y="5" width="14" height="14" rx="3" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2" />
    </g>
  </svg>
</template>

<style scoped>
.app-icon {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: middle;
  fill: currentColor;
}
</style>
