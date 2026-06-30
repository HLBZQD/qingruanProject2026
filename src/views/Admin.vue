<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { getAdminLogs, sendAdminChatMessage } from '@/composables/useAdminApi'
import { renderMarkdown } from '@/composables/useMarkdown'
import type { ChatMessage } from '@/types/sse'
import type { SSEEvent } from '@/types/sse'
import type { AdminLog } from '@/types/api'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import ErrorRetry from '@/components/ErrorRetry.vue'
import EmptyState from '@/components/EmptyState.vue'
import DisclaimerBar from '@/components/DisclaimerBar.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const chatStore = useChatStore()

const view = ref<'chat' | 'logs'>('chat')
const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

const logs = ref<AdminLog[]>([])
const logsLoading = ref(false)
const logsError = ref('')
const logsPage = ref(1)
const logsPageSize = 15
const logsHasMore = ref(true)

/** 过滤 admin 模式消息，隔离 doctor/assistant 对话 */
const adminMessages = computed(() =>
  chatStore.conversations.filter(m => m.mode === 'admin')
)

const isChatEmpty = computed(() => adminMessages.value.length === 0)

async function scrollToBottom() {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

watch(() => chatStore.conversations, scrollToBottom, { deep: true })

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || chatStore.isStreaming) return

  const token = authStore.token
  if (!token) {
    const Swal = await import('sweetalert2')
    Swal.default.fire({ toast: true, position: 'top', icon: 'warning', title: '请先登录', showConfirmButton: false, timer: 2000 })
    return
  }

  inputText.value = ''
  await chatStore.sendAdminMessage(text, token)
  await scrollToBottom()
}

function renderContent(content: string): string {
  return renderMarkdown(content)
}

function formatTime(timestamp: number): string {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatLogTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function getOpTypeClass(type: string): string {
  const t = type.toUpperCase()
  if (t === 'INSERT') return 'type-insert'
  if (t === 'UPDATE') return 'type-update'
  if (t === 'DELETE') return 'type-delete'
  return 'type-select'
}

async function fetchLogs(reset = false) {
  if (reset) {
    logsPage.value = 1
    logs.value = []
    logsHasMore.value = true
  }
  if (logsLoading.value) return

  logsLoading.value = true
  logsError.value = ''

  try {
    const { list, pagination } = await getAdminLogs(logsPage.value, logsPageSize)
    if (reset) {
      logs.value = list
    } else {
      logs.value.push(...list)
    }
    logsHasMore.value = logsPage.value < pagination.totalPages
  } catch (err: unknown) {
    logsError.value = (err as { message?: string }).message || '获取操作日志失败，请检查网络后重试'
  } finally {
    logsLoading.value = false
  }
}

function loadMoreLogs() {
  if (!logsHasMore.value || logsLoading.value) return
  logsPage.value++
  fetchLogs()
}

function switchView(target: 'chat' | 'logs') {
  if (view.value === target) return
  if (target === 'logs') {
    chatStore.abortActiveConnection()
  }
  view.value = target
  if (target === 'logs' && logs.value.length === 0) {
    fetchLogs(true)
  }
  router.replace({ query: target === 'logs' ? { view: 'logs' } : {} })
}

function goBack() {
  chatStore.abortActiveConnection()
  router.push('/profile')
}

onMounted(() => {
  if (route.query.view === 'logs') {
    view.value = 'logs'
    fetchLogs(true)
  }
})

onUnmounted(() => {
  chatStore.abortActiveConnection()
})
</script>

<template>
  <div class="admin-container">
    <!-- 聊天视图 -->
    <div v-show="view === 'chat'" class="admin-chat-view">
      <header class="chat-header">
        <button class="btn-back" aria-label="返回" @click="goBack">
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
        </button>
        <div class="admin-info-bar">
          <div class="admin-avatar">
            <i class="fas fa-shield-halved" aria-hidden="true"></i>
          </div>
          <div>
            <h2>智能管理</h2>
            <p>自然语言操作数据库</p>
          </div>
        </div>
        <button class="btn-logs" @click="switchView('logs')">
          <i class="fas fa-list-alt" aria-hidden="true"></i>
          日志
        </button>
      </header>

      <DisclaimerBar text="本管理助手由 AI 驱动，所有数据操作将被记录审计日志。" />

      <div ref="messagesContainer" class="admin-messages">
        <!-- 空引导 -->
        <div v-if="isChatEmpty" class="chat-welcome">
          <div class="welcome-avatar">
            <i class="fas fa-shield-halved" aria-hidden="true"></i>
          </div>
          <h3>智能管理助手</h3>
          <p>您可以输入自然语言指令，例如：</p>
          <div class="example-list">
            <span class="example-chip">查询所有用户</span>
            <span class="example-chip">查看最近的风险评估记录</span>
            <span class="example-chip">统计今日打卡数量</span>
          </div>
        </div>

        <div
          v-for="msg in adminMessages"
          :key="msg.id"
          :class="['message-bubble', msg.role === 'user' ? 'sent' : 'received']"
        >
          <div class="msg-meta">
            <span class="msg-name">{{ msg.role === 'user' ? authStore.user?.username || '我' : '智能管理助手' }}</span>
            <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
          </div>
          <div class="msg-content" v-html="renderContent(msg.content)"></div>
        </div>

        <div v-if="chatStore.isStreaming" class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>

      <div class="chat-input">
        <input
          v-model="inputText"
          type="text"
          placeholder="输入管理指令，如「查询所有用户」"
          :disabled="chatStore.isStreaming"
          @keyup.enter="handleSend"
        />
        <button
          class="btn-send"
          :disabled="!inputText.trim() || chatStore.isStreaming"
          aria-label="发送"
          @click="handleSend"
        >
          <i class="fas fa-paper-plane" aria-hidden="true"></i>
        </button>
      </div>
    </div>

    <!-- 日志视图 -->
    <div v-show="view === 'logs'" class="admin-logs-view">
      <header class="top-bar">
        <button class="btn-back" aria-label="返回" @click="switchView('chat')">
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
        </button>
        <h1>操作日志</h1>
        <div class="placeholder"></div>
      </header>

      <div v-if="logsLoading && logs.length === 0" class="content-pad">
        <SkeletonLoader type="list" :rows="4" />
      </div>

      <ErrorRetry
        v-else-if="logsError && logs.length === 0"
        :message="logsError"
        @retry="fetchLogs(true)"
      />

      <EmptyState
        v-else-if="logs.length === 0 && !logsLoading"
        icon="fa-clipboard-list"
        title="暂无操作日志"
        description="数据库操作记录将在这里展示。"
      />

      <div v-else class="logs-list content-pad">
        <div v-for="log in logs" :key="log.id" class="log-item">
          <span :class="['log-type-badge', getOpTypeClass(log.operation_type)]">
            {{ log.operation_type }}
          </span>
          <div class="log-detail">
            <p class="log-content">{{ log.operation_content }}</p>
            <p class="log-meta">{{ log.operation_result }} · {{ formatLogTime(log.operation_time) }}</p>
          </div>
          <span class="log-operator">{{ log.operator_username }}</span>
        </div>

        <div class="load-more-wrap">
          <button
            v-if="logsHasMore"
            class="btn-load-more"
            :disabled="logsLoading"
            @click="loadMoreLogs"
          >
            <i v-if="logsLoading" class="fas fa-spinner fa-spin" aria-hidden="true"></i>
            {{ logsLoading ? '加载中...' : '加载更多' }}
          </button>
          <p v-else class="no-more">已经到底啦</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-container {
  max-width: 768px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--color-bg);
}

.admin-chat-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

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
.btn-logs {
  height: 36px;
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

.btn-back {
  width: 36px;
}

.btn-logs {
  gap: 4px;
  padding: 0 12px;
  border: 1px solid var(--color-divider);
}

.admin-info-bar {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
}

.admin-avatar {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-warning), #ffc53d);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.admin-info-bar h2 {
  font-size: var(--font-size-body);
  font-weight: 700;
  color: var(--color-text-primary);
}

.admin-info-bar p {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.admin-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md) var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  -webkit-overflow-scrolling: touch;
}

.chat-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--spacing-2xl) 0;
}

.welcome-avatar {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-warning), #ffc53d);
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

.chat-welcome p {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-md);
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
  font-size: 13px;
}

.message-bubble {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 82%;
  animation: msg-enter 0.2s ease-out;
}

@keyframes msg-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.message-bubble.sent {
  align-self: flex-end;
  align-items: flex-end;
}

.message-bubble.received {
  align-self: flex-start;
  align-items: flex-start;
}

.msg-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.msg-name {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.msg-time {
  font-size: 10px;
  color: var(--color-text-tertiary);
}

.msg-content {
  padding: 10px 14px;
  font-size: var(--font-size-body);
  line-height: 1.5;
  word-break: break-word;
  border-radius: var(--radius-md);
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

.message-bubble.sent .msg-content {
  background: var(--color-primary);
  color: #fff;
  border-radius: var(--radius-md) 4px var(--radius-md) var(--radius-md);
}

.message-bubble.received .msg-content {
  background: var(--color-card);
  color: var(--color-text-primary);
  border-radius: 4px var(--radius-md) var(--radius-md) var(--radius-md);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 10px 14px;
  align-self: flex-start;
  background: var(--color-card);
  border-radius: 4px var(--radius-md) var(--radius-md) var(--radius-md);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
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

.chat-input {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-lg) calc(var(--spacing-md) + env(safe-area-inset-bottom));
  background: var(--color-card);
  border-top: 1px solid var(--color-divider);
  flex-shrink: 0;
}

.chat-input input {
  flex: 1;
  padding: 11px 14px;
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

.btn-send {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-full);
  font-size: 16px;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform var(--transition-fast), opacity var(--transition-fast);
}

.btn-send:active:not(:disabled) {
  transform: scale(0.94);
}

.btn-send:disabled {
  background: var(--color-divider);
  cursor: not-allowed;
}

/* 日志视图 */
.admin-logs-view {
  min-height: 100vh;
  padding-bottom: var(--spacing-lg);
}

.top-bar {
  position: sticky;
  top: 0;
  z-index: 30;
  background: var(--color-card);
  border-bottom: 1px solid var(--color-divider);
  padding: var(--spacing-md) var(--spacing-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.top-bar h1 {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
}

.placeholder {
  width: 36px;
}

.content-pad {
  padding: var(--spacing-md) var(--spacing-lg);
}

.log-item {
  background: var(--color-card);
  border-radius: 16px;
  padding: var(--spacing-lg);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  margin-bottom: var(--spacing-md);
}

.log-type-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  margin-bottom: var(--spacing-sm);
}

.type-insert { color: #237804; background: #f6ffed; }
.type-update { color: #ad6800; background: #fffbe6; }
.type-delete { color: #a8071a; background: #fff1f0; }
.type-select { color: #0958d9; background: #e6f4ff; }

.log-content {
  font-size: 13px;
  color: var(--color-text-primary);
  line-height: 1.5;
  word-break: break-word;
  margin-bottom: var(--spacing-sm);
}

.log-meta {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.log-operator {
  display: inline-block;
  margin-top: var(--spacing-sm);
  font-size: 11px;
  color: var(--color-primary);
  background: var(--color-primary-light);
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

.load-more-wrap {
  padding: var(--spacing-md) 0 var(--spacing-lg);
  text-align: center;
}

.btn-load-more,
.no-more {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.btn-load-more {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: var(--spacing-sm) var(--spacing-lg);
}

.btn-load-more:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.no-more {
  color: var(--color-text-disabled);
}
</style>
