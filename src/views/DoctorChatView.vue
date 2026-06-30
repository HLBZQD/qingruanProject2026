<!-- src/views/DoctorChatView.vue -->
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chatStore'
import { useAuthStore } from '@/stores/authStore'
import { getDoctorInfo } from '@/composables/useChatApi'
import { renderMarkdown } from '@/composables/useMarkdown'
import type { Doctor } from '@/types/api'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import ErrorRetry from '@/components/ErrorRetry.vue'
import EmptyState from '@/components/EmptyState.vue'
import type { ConversationHistoryItem } from '@/types/sse'
import AppIcon from '@/components/icons/AppIcon.vue'
import DisclaimerBar from '@/components/DisclaimerBar.vue'

const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()
const authStore = useAuthStore()

// ===== 本地状态 =====
const doctor = ref<Doctor | null>(null)
const loading = ref(true)
const doctorError = ref('')
const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
/** 历史会话弹层可见性 */
const showHistoryPanel = ref(false)

// ===== 计算属性 =====
const userAvatar = computed(() => {
  return (authStore.user as any)?.avatar || '/default-avatar.png'
})

// ===== 加载医生信息 =====
async function loadDoctor() {
  const id = Number(route.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    doctorError.value = '医生ID无效'
    loading.value = false
    return
  }

  loading.value = true
  doctorError.value = ''
  try {
    doctor.value = await getDoctorInfo(id)
    // 切换到该医生的对话上下文
    chatStore.switchDoctor(id)
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 404) {
      doctorError.value = '该医生不存在'
    } else {
      doctorError.value =
        (err as { message?: string }).message || '获取医生信息失败'
    }
  } finally {
    loading.value = false
  }
}

// ===== 发送消息 =====
async function handleSend() {
  const text = inputText.value.trim()
  if (!text || chatStore.isStreaming) return

  inputText.value = ''
  const token = authStore.token
  if (!token) {
    // Token 不存在 — 引导登录
    const Swal = await import('sweetalert2')
    Swal.default.fire({
      toast: true,
      position: 'top',
      icon: 'warning',
      title: '请先登录',
      showConfirmButton: false,
      timer: 2000,
    })
    return
  }

  await chatStore.sendMessageWithRetry(
    Number(route.params.id),
    text,
    token,
  )
  await scrollToBottom()
}

// ===== 导航 =====
function goBack() {
  chatStore.abortActiveConnection()
  router.push('/consultation')
}

// ===== 清空对话 =====
function clearChat() {
  const id = Number(route.params.id)
  chatStore.clearDoctorConversation(id)
  chatStore.clearMessages()
}

// ===== 自动滚动到底部 =====
async function scrollToBottom() {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// ===== 消息内容渲染 (Markdown → 安全 HTML) =====
function renderContent(content: string): string {
  return renderMarkdown(content)
}

// ===== 时间格式化 (Unix ms → HH:MM) =====
function formatTime(timestamp: number): string {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ===== 历史会话 =====

/**
 * 切换历史会话弹层显示/隐藏。
 * 打开时自动加载历史会话列表；关闭时清空历史 state。
 */
function toggleHistoryList(): void {
  showHistoryPanel.value = !showHistoryPanel.value
  if (showHistoryPanel.value) {
    loadHistory()
  } else {
    chatStore.clearConversationHistory()
  }
}

/**
 * 加载当前医生的历史会话列表。
 * 从 authStore 获取 token，从 route.params.id 获取 doctorId。
 */
function loadHistory(): void {
  const token = authStore.token
  if (!token) return
  const doctorId = Number(route.params.id)
  if (!Number.isFinite(doctorId) || doctorId <= 0) return
  chatStore.loadDoctorConversationHistory(doctorId, token)
}

/**
 * 选中某个历史会话并恢复。
 * 调用 chatStore.setDoctorConversation 设置 conversation_id，
 * 清空当前消息列表（切换会话上下文），关闭弹层。
 *
 * @param item - 选中的历史会话项
 */
function selectHistorySession(item: ConversationHistoryItem): void {
  const doctorId = Number(route.params.id)
  chatStore.setDoctorConversation(doctorId, item.conversation_id)
  // 清空当前消息列表以展示新会话上下文
  chatStore.clearMessages()
  showHistoryPanel.value = false
  chatStore.clearConversationHistory()
}

/**
 * 格式化 ISO 时间字符串为 "YYYY-MM-DD HH:mm"。
 * 复用现有 formatTime(timestamp: number) 的命名空间（新函数为 formatHistoryTime）。
 *
 * @param isoString - ISO 8601 时间字符串（如 "2026-06-29T10:30:00.000Z"）
 * @returns 格式化后的时间字符串，解析失败返回原始字符串
 */
function formatHistoryTime(isoString: string): string {
  if (!isoString) return ''
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return isoString
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

// ===== 路由参数变化监听 (医生A → 医生B 同组件复用) =====
watch(
  () => route.params.id,
  (newId, oldId) => {
    if (newId !== oldId && oldId !== undefined) {
      chatStore.abortActiveConnection()
      chatStore.clearMessages()
      loadDoctor()
    }
  },
)

onMounted(() => {
  loadDoctor()
})

onUnmounted(() => {
  chatStore.abortActiveConnection()
})
</script>

<template>
  <div class="doctor-chat-container">
    <!-- 顶部固定: 医生信息头部 -->
    <header class="chat-header">
      <button class="btn-back" @click="goBack" aria-label="返回医生列表">
        <AppIcon name="arrow-left" :size="16" />
      </button>
      <div class="doctor-info-bar">
        <img
          class="avatar-small"
          :src="doctor?.avatar || '/default-avatar.png'"
          :alt="doctor?.name"
        />
        <div>
          <h2>{{ doctor?.name || '加载中...' }}</h2>
          <p>{{ (doctor as any)?.department }} · {{ (doctor as any)?.title }}</p>
        </div>
      </div>
      <button
        class="btn-history"
        @click="toggleHistoryList"
        title="历史会话"
        aria-label="历史会话"
      >
        <AppIcon name="history" :size="16" />
      </button>
      <button
        class="btn-delete"
        @click="clearChat"
        title="清空对话"
        aria-label="清空对话"
      >
        <AppIcon name="trash" :size="16" />
      </button>
    </header>

    <!-- 历史会话弹层 -->
    <div v-if="showHistoryPanel" class="history-panel-overlay" @click.self="toggleHistoryList">
      <div class="history-panel">
        <div class="history-panel-header">
          <h3>历史会话</h3>
          <button class="btn-close-panel" @click="toggleHistoryList" aria-label="关闭">
            <AppIcon name="close" :size="14" />
          </button>
        </div>

        <div class="history-panel-body">
          <!-- 加载中 -->
          <SkeletonLoader
            v-if="chatStore.historyLoading"
            type="list"
            :rows="3"
          />

          <!-- 加载失败 -->
          <ErrorRetry
            v-else-if="chatStore.historyError"
            :message="chatStore.historyError"
            @retry="loadHistory"
          />

          <!-- 空列表 -->
          <EmptyState
            v-else-if="chatStore.conversationHistory.length === 0"
            icon="history"
            title="暂无历史会话"
            description="当前医生没有历史对话记录"
          />

          <!-- 会话列表 -->
          <ul v-else class="history-list">
            <li
              v-for="item in chatStore.conversationHistory"
              :key="item.conversation_id"
              class="history-item"
              @click="selectHistorySession(item)"
            >
              <div class="history-item-icon">
                <AppIcon name="comment-dots" :size="14" />
              </div>
              <div class="history-item-info">
                <span class="history-item-name">{{ item.name || '未命名会话' }}</span>
                <span class="history-item-time">{{ formatHistoryTime(item.created_at) }}</span>
              </div>
              <div class="history-item-arrow">
                <AppIcon name="chevron-right" :size="12" />
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 免责声明条 (对话全程可见) -->
    <DisclaimerBar text="本对话由AI虚拟医师提供，回复内容仅供参考，不能替代专业医疗诊断。" />

    <!-- 消息列表 (可滚动) -->
    <div
      id="chat-messages"
      ref="messagesContainer"
    >
      <!-- 加载态 -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>加载对话中...</p>
      </div>

      <!-- 错误态 (医生不存在) -->
      <div v-else-if="doctorError" class="error-state">
        <AppIcon class="error-icon" name="exclamation" :size="48" />
        <p>{{ doctorError }}</p>
        <button @click="goBack" class="btn-retry">返回医生列表</button>
      </div>

      <!-- 空态欢迎 -->
      <div
        v-else-if="chatStore.conversations.length === 0 && !chatStore.isStreaming"
        class="chat-welcome"
      >
          <div class="welcome-avatar">
            <AppIcon name="doctor" :size="28" />
          </div>
        <h3>{{ doctor?.name ? '您好，我是' + doctor.name + '医生' : '您好，我是您的AI医生' }}</h3>
        <p>请问有什么可以帮您？您可以描述症状、用药情况或血糖数据。</p>
        <div class="example-list">
          <span class="example-chip">最近血糖控制得怎么样？</span>
          <span class="example-chip">我的用药方案需要调整吗？</span>
          <span class="example-chip">饮食上有什么建议？</span>
        </div>
      </div>

      <!-- 消息列表 -->
      <template v-else>
        <div
          v-for="msg in chatStore.conversations"
          :key="msg.id"
          :class="[
            'message-bubble',
            msg.role === 'user' ? 'sent' : 'received',
          ]"
        >
          <img
            class="msg-avatar"
            :src="
              msg.role === 'user'
                ? userAvatar
                : (doctor?.avatar || '/default-avatar.png')
            "
            :alt="msg.role === 'user' ? '我' : doctor?.name"
          />
          <span class="msg-name">
            {{ msg.role === 'user' ? '我' : doctor?.name }}
          </span>
          <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
          <div
            class="msg-content"
            v-html="renderContent(msg.content)"
          ></div>
        </div>
      </template>

      <!-- 对方正在输入... -->
      <div v-if="chatStore.isStreaming" class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>

    <!-- 底部固定: 输入框 -->
    <div class="chat-input">
      <input
        type="text"
        id="msgInput"
        v-model="inputText"
        placeholder="输入您的问题..."
        @keyup.enter="handleSend"
        :disabled="chatStore.isStreaming"
      />
      <button
        id="sendBtn"
        @click="handleSend"
        :disabled="!inputText.trim() || chatStore.isStreaming"
        :class="{ visible: inputText.trim() && !chatStore.isStreaming }"
      >
        <AppIcon name="send" :size="16" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ===== 页面容器 (全屏布局) ===== */
.doctor-chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 768px;
  margin: 0 auto;
  background: var(--color-bg);
}

/* ===== Header 顶栏 ===== */
.chat-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--color-card);
  border-bottom: 1px solid var(--color-divider);
  flex-shrink: 0;
}
.btn-back,
.btn-delete {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
  border-radius: var(--radius-full);
  cursor: pointer;
  flex-shrink: 0;
}
.doctor-info-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex: 1;
  min-width: 0;
}
.avatar-small {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  object-fit: cover;
  flex-shrink: 0;
}
.doctor-info-bar h2 {
  font-size: var(--font-size-body);
  font-weight: 700;
  color: var(--color-text-primary);
}
.doctor-info-bar p {
  font-size: 11px;
  color: var(--color-text-secondary);
}


/* ===== 消息列表 ===== */
#chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md) var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  -webkit-overflow-scrolling: touch;
}

/* ===== 消息气泡 ===== */
.message-bubble {
  display: grid;
  grid-template-columns: 32px 1fr;
  grid-template-rows: auto auto;
  gap: 2px 8px;
  max-width: 80%;
  animation: msg-enter 0.2s ease-out;
}
@keyframes msg-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.message-bubble.sent {
  align-self: flex-end;
  direction: rtl;
}
.message-bubble.sent .msg-content {
  background: var(--color-primary);
  color: #fff;
  border-radius: var(--radius-md) 4px var(--radius-md) var(--radius-md);
  direction: ltr;
}
.message-bubble.received {
  align-self: flex-start;
}
.message-bubble.received .msg-content {
  background: var(--color-card);
  color: var(--color-text-primary);
  border-radius: 4px var(--radius-md) var(--radius-md) var(--radius-md);
}
.msg-avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  object-fit: cover;
  grid-row: 1 / 3;
}
.msg-name {
  font-size: 11px;
  color: var(--color-text-secondary);
  grid-column: 2;
}
.msg-time {
  font-size: 10px;
  color: var(--color-text-tertiary);
  justify-self: end;
}
.message-bubble.sent .msg-name {
  text-align: right;
}
.msg-content {
  padding: 8px 12px;
  font-size: var(--font-size-body);
  line-height: 1.5;
  word-break: break-word;
  grid-column: 2;
}

/* G19: Markdown 子元素排版穿透 */
.msg-content :deep(p) {
  margin-bottom: var(--spacing-sm);
}
.msg-content :deep(ul),
.msg-content :deep(ol) {
  padding-left: var(--spacing-lg);
  margin-bottom: var(--spacing-sm);
}
.msg-content :deep(li) {
  margin-bottom: var(--spacing-xs);
}
.msg-content :deep(code) {
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  font-family: var(--font-family);
  font-size: 13px;
}
.msg-content :deep(blockquote) {
  border-left: 3px solid var(--color-primary-light);
  padding-left: var(--spacing-md);
  margin: var(--spacing-sm) 0;
  color: var(--color-text-secondary);
}
.msg-content :deep(strong) {
  color: var(--color-text-primary);
  font-weight: 600;
}

/* ===== 对方正在输入... ===== */
.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  align-self: flex-start;
}
.typing-indicator span {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-text-tertiary);
  animation: typing-bounce 1.4s ease-in-out infinite;
}
.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
@keyframes typing-bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-6px); }
}

/* ===== 底部输入区 ===== */
.chat-input {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--color-card);
  border-top: 1px solid var(--color-divider);
  flex-shrink: 0;
}
.chat-input input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-full);
  font-size: var(--font-size-body);
  outline: none;
  background: var(--color-bg);
  color: var(--color-text-primary);
}
.chat-input input:focus {
  border-color: var(--color-primary);
}
#sendBtn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-full);
  font-size: 16px;
  cursor: pointer;
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 0.2s, transform 0.2s;
  flex-shrink: 0;
}
#sendBtn.visible {
  opacity: 1;
  transform: scale(1);
}
#sendBtn:disabled {
  background: var(--color-divider);
  cursor: not-allowed;
}

/* ===== 加载态 ===== */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-3xl);
  color: var(--color-text-secondary);
  gap: var(--spacing-md);
}
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-divider);
  border-top-color: var(--color-primary);
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ===== 错误态 ===== */
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-3xl);
  text-align: center;
  color: var(--color-text-secondary);
  gap: var(--spacing-md);
}
.error-icon {
  font-size: 48px;
  color: var(--color-divider);
}
.btn-retry {
  padding: 10px 24px;
  border-radius: var(--radius-button);
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-size-body);
  font-weight: 700;
  border: none;
  cursor: pointer;
}

/* ===== 历史会话按钮 ===== */
.btn-history {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
  border-radius: var(--radius-full);
  cursor: pointer;
  flex-shrink: 0;
}
.btn-history:hover {
  color: var(--color-primary);
  background: rgba(74, 144, 217, 0.1);
}

/* ===== 历史会话弹层 ===== */
.history-panel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.history-panel {
  width: 100%;
  max-width: 768px;
  max-height: 60vh;
  background: var(--color-card);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.25s ease-out;
}
@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

/* ===== 弹层头部 ===== */
.history-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-divider);
  flex-shrink: 0;
}
.history-panel-header h3 {
  font-size: var(--font-size-h4);
  font-weight: 700;
  color: var(--color-text-primary);
}
.btn-close-panel {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 14px;
  border-radius: var(--radius-full);
  cursor: pointer;
}

/* ===== 弹层内容区 ===== */
.history-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-sm) 0;
}

/* ===== 会话列表 ===== */
.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.history-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  cursor: pointer;
  transition: background 0.15s;
}
.history-item:hover,
.history-item:active {
  background: var(--color-bg);
}
.history-item-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  background: var(--color-primary-light);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.history-item-icon i {
  font-size: 14px;
  color: var(--color-primary);
}
.history-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.history-item-name {
  font-size: var(--font-size-body);
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.history-item-time {
  font-size: 11px;
  color: var(--color-text-secondary);
}
.history-item-arrow {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
  font-size: 12px;
}
/* ===== 空态欢迎（G3） ===== */
.chat-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--spacing-2xl) 0;
}

.chat-welcome .welcome-avatar {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-primary), #0EA5E9);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  margin-bottom: var(--spacing-md);
}

.chat-welcome h3 {
  font-size: var(--font-size-h3);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-sm);
}

.chat-welcome > p {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-md);
  max-width: 280px;
  line-height: 1.5;
}

.example-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.example-chip {
  padding: 8px 16px;
  border-radius: var(--radius-full);
  background: var(--color-card);
  border: 1px solid var(--color-divider);
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
}

</style>
