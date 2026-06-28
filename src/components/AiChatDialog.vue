<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chatStore'
import { useAuthStore } from '@/stores/authStore'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import DisclaimerBar from './DisclaimerBar.vue'

const router = useRouter()
const chatStore = useChatStore()
const authStore = useAuthStore()

const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

const isOpen = computed(() => chatStore.fabOpen)
const isLoggedIn = computed(() => !!authStore.token)
const messages = computed(() => chatStore.conversations)

function hasAcceptedDisclaimer(): boolean {
  return localStorage.getItem('disclaimer_accepted') === 'true'
}

async function showDisclaimer(): Promise<boolean> {
  const Swal = (await import('sweetalert2')).default
  const result = await Swal.fire({
    title: '医学免责声明',
    html: '<p style="text-align:left;font-size:14px">本平台的 AI 健康建议、风险预测、方案生成等内容仅供健康参考，<b>不能替代专业医疗诊断、治疗或建议</b>。如有健康问题，请及时就医咨询专业医师。</p>',
    icon: 'info',
    showCancelButton: true,
    confirmButtonText: '我已知晓并同意',
    cancelButtonText: '不同意',
    allowOutsideClick: false,
  })
  return result.isConfirmed
}

async function ensureDisclaimer(): Promise<boolean> {
  if (hasAcceptedDisclaimer()) return true
  const agreed = await showDisclaimer()
  if (agreed) {
    localStorage.setItem('disclaimer_accepted', 'true')
    return true
  }
  return false
}

async function scrollToBottom() {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

watch(messages, scrollToBottom, { deep: true })
watch(isOpen, async (open) => {
  if (open) {
    if (isLoggedIn.value) {
      const agreed = await ensureDisclaimer()
      if (!agreed) {
        chatStore.toggleFab()
        return
      }
    }
    await scrollToBottom()
  } else {
    chatStore.abortActiveConnection()
  }
})

function closeDialog() {
  chatStore.abortActiveConnection()
  chatStore.toggleFab()
}

function goLogin() {
  chatStore.toggleFab()
  router.push('/login')
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || chatStore.isStreaming) return

  const token = authStore.token
  if (!token) {
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

  inputText.value = ''
  await chatStore.sendAssistantMessage(text, token)
  await scrollToBottom()
}

function formatTime(timestamp: number): string {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function renderContent(content: string): string {
  if (!content) return ''
  try {
    const html = marked.parse(content, { async: false })
    if (typeof html !== 'string') return ''
    return DOMPurify.sanitize(html)
  } catch {
    return DOMPurify.sanitize(content)
  }
}

const quickQuestions = [
  '如何制定糖尿病饮食计划？',
  '帮我分析最近的健康风险',
  '推荐适合的运动方式',
]

function askQuick(q: string) {
  inputText.value = q
  handleSend()
}

onMounted(() => {
  if (isOpen.value) scrollToBottom()
})
</script>

<template>
  <Transition name="dialog-fade">
    <div v-if="isOpen" class="ai-chat-dialog" role="dialog" aria-modal="true" aria-label="AI 智能助手">
      <!-- 遮罩 -->
      <div class="dialog-overlay" @click="closeDialog"></div>

      <!-- 对话框 -->
      <div class="dialog-panel">
        <header class="dialog-header">
          <button class="btn-back" aria-label="关闭" @click="closeDialog">
            <i class="fas fa-chevron-down" aria-hidden="true"></i>
          </button>
          <div class="dialog-title">
            <i class="fas fa-robot title-icon" aria-hidden="true"></i>
            <div>
              <h3>AI 智能助手</h3>
              <p class="title-sub">小糖 · 7×24 在线</p>
            </div>
          </div>
          <button
            class="btn-clear"
            :disabled="messages.length === 0 || chatStore.isStreaming"
            aria-label="清空对话"
            @click="chatStore.clearAssistantConversation(); chatStore.conversations.length = 0"
          >
            <i class="fas fa-trash-alt" aria-hidden="true"></i>
          </button>
        </header>

        <!-- 消息区 -->
        <div ref="messagesContainer" class="dialog-messages">
          <!-- 未登录引导 -->
          <div v-if="!isLoggedIn" class="login-prompt">
            <div class="welcome-avatar">
              <i class="fas fa-robot" aria-hidden="true"></i>
            </div>
            <h3>欢迎使用 AI 智能助手</h3>
            <p>登录后即可享受个性化健康咨询、方案推荐与数据分析服务。</p>
            <button class="btn-login" @click="goLogin">前往登录</button>
          </div>

          <!-- 已登录欢迎 -->
          <template v-else>
            <div v-if="messages.length === 0" class="welcome-area">
              <div class="welcome-avatar">
                <i class="fas fa-robot" aria-hidden="true"></i>
              </div>
              <h3>您好，我是小糖</h3>
              <p>我可以帮您查询健康记录、生成饮食运动方案、分析糖尿病风险等。</p>
              <div class="quick-questions">
                <button
                  v-for="(q, idx) in quickQuestions"
                  :key="idx"
                  class="quick-chip"
                  @click="askQuick(q)"
                >
                  {{ q }}
                </button>
              </div>
            </div>

            <div
              v-for="msg in messages"
              :key="msg.id"
              :class="['message-bubble', msg.role === 'user' ? 'sent' : 'received']"
            >
              <div class="msg-meta">
                <span class="msg-name">{{ msg.role === 'user' ? '我' : 'AI 小糖' }}</span>
                <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
              </div>
              <div class="msg-content" v-html="renderContent(msg.content)"></div>
            </div>

            <div v-if="chatStore.isStreaming" class="typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </template>
        </div>

        <!-- 免责声明 -->
        <DisclaimerBar
          text="AI 生成内容仅供健康参考，不能替代专业医疗诊断、治疗或建议。"
          class="dialog-disclaimer"
        />

        <!-- 输入区 -->
        <div v-if="isLoggedIn" class="dialog-input">
          <input
            v-model="inputText"
            type="text"
            placeholder="输入您的问题..."
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
    </div>
  </Transition>
</template>

<style scoped>
.ai-chat-dialog {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.dialog-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
}

.dialog-panel {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
  height: 85vh;
  max-height: 720px;
  background: var(--color-bg);
  border-radius: 20px 20px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.15);
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--color-card);
  border-bottom: 1px solid var(--color-divider);
  flex-shrink: 0;
}

.btn-back,
.btn-clear {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: background var(--transition-fast);
  flex-shrink: 0;
}

.btn-back:active,
.btn-clear:active {
  background: var(--color-bg);
}

.btn-clear:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dialog-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
}

.title-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.dialog-title h3 {
  font-size: var(--font-size-body);
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.2;
}

.title-sub {
  font-size: 11px;
  color: var(--color-text-tertiary);
  line-height: 1.2;
}

.dialog-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md) var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  -webkit-overflow-scrolling: touch;
}

.login-prompt,
.welcome-area {
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
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  margin-bottom: var(--spacing-md);
}

.login-prompt h3,
.welcome-area h3 {
  font-size: var(--font-size-h3);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-xs);
}

.login-prompt p,
.welcome-area p {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  line-height: 1.5;
  max-width: 280px;
  margin-bottom: var(--spacing-lg);
}

.btn-login {
  padding: 10px 28px;
  border-radius: var(--radius-button);
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-size-body);
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: transform var(--transition-fast);
}

.btn-login:active {
  transform: scale(0.96);
}

.quick-questions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--spacing-sm);
  max-width: 320px;
}

.quick-chip {
  padding: 8px 14px;
  border-radius: var(--radius-full);
  background: var(--color-card);
  border: 1px solid var(--color-divider);
  color: var(--color-primary);
  font-size: 12px;
  cursor: pointer;
  transition: background var(--transition-fast), transform var(--transition-fast);
}

.quick-chip:active {
  background: var(--color-primary-light);
  transform: scale(0.97);
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

.dialog-disclaimer {
  flex-shrink: 0;
}

.dialog-input {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-lg) calc(var(--spacing-md) + env(safe-area-inset-bottom));
  background: var(--color-card);
  border-top: 1px solid var(--color-divider);
  flex-shrink: 0;
}

.dialog-input input {
  flex: 1;
  padding: 11px 14px;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-full);
  font-size: var(--font-size-body);
  outline: none;
  background: var(--color-bg);
  color: var(--color-text-primary);
}

.dialog-input input:focus {
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

/* 过渡动画 */
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.25s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.dialog-fade-enter-active .dialog-panel,
.dialog-fade-leave-active .dialog-panel {
  transition: transform 0.25s ease;
}

.dialog-fade-enter-from .dialog-panel,
.dialog-fade-leave-to .dialog-panel {
  transform: translateY(20px);
}

@media (min-width: 768px) {
  .dialog-panel {
    height: 70vh;
    border-radius: 20px;
    margin-bottom: 24px;
  }
}
</style>
