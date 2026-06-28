<!-- src/views/DoctorChatView.vue -->
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chatStore'
import { useAuthStore } from '@/stores/authStore'
import { getDoctorInfo } from '@/composables/useChatApi'
import type { Doctor } from '@/types/api'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

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
  chatStore.conversations.length = 0
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
  if (!content) return ''
  try {
    const html = marked.parse(content, { async: false })
    if (typeof html !== 'string') return ''
    return DOMPurify.sanitize(html)
  } catch {
    // marked 解析失败，返回原始文本 (DOMPurify 转义)
    return DOMPurify.sanitize(content)
  }
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

// ===== 路由参数变化监听 (医生A → 医生B 同组件复用) =====
watch(
  () => route.params.id,
  (newId, oldId) => {
    if (newId !== oldId && oldId !== undefined) {
      chatStore.abortActiveConnection()
      chatStore.conversations.length = 0
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
        <i class="fas fa-arrow-left"></i>
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
        class="btn-delete"
        @click="clearChat"
        title="清空对话"
        aria-label="清空对话"
      >
        <i class="fas fa-trash"></i>
      </button>
    </header>

    <!-- 免责声明条 (对话全程可见) -->
    <div class="disclaimer-bar">
      <p>本对话由AI虚拟医师提供，回复内容仅供参考</p>
    </div>

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
        <i class="fas fa-exclamation-circle error-icon"></i>
        <p>{{ doctorError }}</p>
        <button @click="goBack" class="btn-retry">返回医生列表</button>
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
        <i class="fas fa-paper-plane"></i>
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

/* ===== 免责声明条 ===== */
.disclaimer-bar {
  padding: 6px var(--spacing-lg);
  background: rgba(250, 173, 20, 0.1);
  border-bottom: 1px solid rgba(250, 173, 20, 0.2);
  flex-shrink: 0;
}
.disclaimer-bar p {
  font-size: 11px;
  color: #ad8b00;
  text-align: center;
  margin: 0;
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
</style>
