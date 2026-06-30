<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chatStore'
import { useAuthStore } from '@/stores/authStore'
import AppIcon from '@/components/icons/AppIcon.vue'
import DiabetesIcon from '@/components/icons/DiabetesIcon.vue'
import DisclaimerBar from './DisclaimerBar.vue'
import { renderMarkdown } from '@/composables/useMarkdown'
import { hasAcceptedDisclaimer, showDisclaimer, setDisclaimerAccepted } from '@/composables/useUI'
import { formatTime } from '@/utils/helpers'

const router = useRouter()
const chatStore = useChatStore()
const authStore = useAuthStore()

const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

const isOpen = computed(() => chatStore.fabOpen)
const isLoggedIn = computed(() => !!authStore.token)
const messages = computed(() => chatStore.conversations)

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
      let agreed = hasAcceptedDisclaimer()
      if (!agreed) {
        agreed = await showDisclaimer()
        if (agreed) setDisclaimerAccepted(true)
      }
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

onUnmounted(() => {
  chatStore.abortActiveConnection()
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
            <AppIcon name="chevron-right" :size="18" class="icon-rotate" />
          </button>
          <div class="dialog-title">
            <div class="title-icon">
              <DiabetesIcon name="doctor-bag" :size="22" color="#fff" />
              <span class="title-dot" aria-hidden="true"></span>
            </div>
            <div>
              <h3>AI 智能助手</h3>
              <p class="title-sub">小糖 · 7×24 在线</p>
            </div>
          </div>
          <button
            class="btn-clear"
            :disabled="messages.length === 0 || chatStore.isStreaming"
            aria-label="清空对话"
            @click="chatStore.clearAssistantConversation(); chatStore.clearMessages()"
          >
            <AppIcon name="trash" :size="18" />
          </button>
        </header>

        <!-- 消息区 -->
        <div ref="messagesContainer" class="dialog-messages">
          <!-- 未登录引导 -->
          <div v-if="!isLoggedIn" id="fab-login-prompt" class="login-prompt">
            <div class="welcome-avatar">
              <DiabetesIcon name="doctor-bag" :size="34" color="#fff" />
              <span class="welcome-dot" aria-hidden="true"></span>
            </div>
            <h3>欢迎使用 AI 智能助手</h3>
            <p>登录后即可享受个性化健康咨询、方案推荐与数据分析服务。</p>
            <button class="btn-login" @click="goLogin">前往登录</button>
          </div>

          <!-- 已登录欢迎 -->
          <template v-else>
            <div v-if="messages.length === 0" id="fab-welcome-logged-in" class="welcome-area">
              <div class="welcome-avatar">
                <DiabetesIcon name="doctor-bag" :size="34" color="#fff" />
                <span class="welcome-dot" aria-hidden="true"></span>
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
              v-for="(msg, idx) in messages"
              :key="msg.id"
              :class="['message-bubble', msg.role === 'user' ? 'sent' : 'received']"
            >
              <div class="msg-meta">
                <span class="msg-name">{{ msg.role === 'user' ? '我' : 'AI 小糖' }}</span>
                <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
              </div>
              <div class="msg-content" v-html="renderMarkdown(msg.content)"></div>
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
            <AppIcon name="send" :size="18" color="#fff" />
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
  background: rgba(26, 26, 46, 0.55);
  backdrop-filter: blur(2px);
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
  border-radius: 28px 28px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -8px 32px rgba(26, 26, 46, 0.2);
  border: 1.5px solid var(--color-border);
  border-bottom: none;
}

.dialog-panel::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 64px;
  height: 4px;
  background: var(--color-divider);
  border-radius: 0 0 var(--radius-full) var(--radius-full);
  z-index: 10;
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--color-card);
  border-bottom: 1.5px solid var(--color-divider);
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
  border-radius: 30%;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
  flex-shrink: 0;
}

.btn-back:hover,
.btn-clear:hover {
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.btn-back:active,
.btn-clear:active {
  background: var(--color-primary-light);
}

.btn-clear:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-back .icon-rotate {
  transform: rotate(90deg);
}

.dialog-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
}

.title-icon {
  position: relative;
  width: 42px;
  height: 42px;
  border-radius: 28%;
  background: var(--color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: var(--shadow-primary);
  transform: rotate(3deg);
}

.title-dot {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  animation: dataPulse 2s ease-in-out infinite;
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
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 30%;
  background: var(--color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--spacing-md);
  box-shadow: var(--shadow-primary);
  transform: rotate(3deg);
}

.welcome-dot {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  animation: dataPulse 2s ease-in-out infinite;
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
  padding: 11px 30px;
  border-radius: var(--radius-button);
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-size-body);
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast), transform var(--transition-fast);
  box-shadow: var(--shadow-primary);
}

.btn-login:active {
  transform: scale(0.97);
  box-shadow: var(--shadow-md);
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
  border-radius: var(--radius-button);
  background: var(--color-card);
  border: 1.5px solid var(--color-border);
  color: var(--color-primary);
  font-size: var(--font-size-caption);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-fast), transform var(--transition-fast), border-color var(--transition-fast);
}

.quick-chip:nth-child(2) {
  color: var(--color-accent-dark);
  border-color: var(--color-accent-light);
  background: var(--color-accent-light);
}

.quick-chip:nth-child(3) {
  color: var(--color-vivid-dark);
  border-color: var(--color-vivid-light);
  background: var(--color-vivid-light);
}

.quick-chip:active {
  transform: scale(0.97);
  filter: brightness(0.97);
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
  font-weight: 600;
}

.msg-time {
  font-size: 10px;
  color: var(--color-text-tertiary);
  font-family: var(--font-mono);
}

.msg-content {
  padding: 11px 15px;
  font-size: var(--font-size-body);
  line-height: 1.55;
  word-break: break-word;
}

/* G19: Markdown 子元素排版穿透 */
.msg-content :deep(p) {
  margin-bottom: var(--spacing-sm);
}
.msg-content :deep(p):last-child {
  margin-bottom: 0;
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
  background: rgba(79, 70, 229, 0.08);
  font-family: var(--font-mono);
  font-size: 13px;
}
.msg-content :deep(blockquote) {
  border-left: 3px solid var(--color-accent);
  padding-left: var(--spacing-md);
  margin: var(--spacing-sm) 0;
  color: var(--color-text-secondary);
}
.msg-content :deep(strong) {
  color: var(--color-text-primary);
  font-weight: 700;
}

.message-bubble.sent .msg-content {
  background: var(--color-primary);
  color: #fff;
  border-radius: 18px 6px 18px 18px;
}

.message-bubble.received .msg-content {
  background: var(--color-card);
  color: var(--color-text-primary);
  border-radius: 6px 18px 18px 18px;
  box-shadow: var(--shadow-sm);
  border: 1.5px solid var(--color-border);
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 11px 15px;
  align-self: flex-start;
  background: var(--color-card);
  border-radius: 6px 18px 18px 18px;
  box-shadow: var(--shadow-sm);
  border: 1.5px solid var(--color-border);
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
  border-top: 1.5px solid var(--color-divider);
  flex-shrink: 0;
}

.dialog-input input {
  flex: 1;
  padding: 11px 16px;
  border: 1.5px solid var(--color-border);
  border-radius: 20px 8px 20px 8px;
  font-size: var(--font-size-body);
  outline: none;
  background: var(--color-bg);
  color: var(--color-text-primary);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.dialog-input input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.btn-send {
  width: 46px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 28%;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform var(--transition-fast), opacity var(--transition-fast), background var(--transition-fast);
  box-shadow: var(--shadow-primary);
  transform: rotate(3deg);
}

.btn-send:active:not(:disabled) {
  transform: rotate(0deg) scale(0.94);
  box-shadow: var(--shadow-md);
}

.btn-send:disabled {
  background: var(--color-divider);
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
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
    border-radius: 28px;
    margin-bottom: 24px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .title-dot,
  .welcome-dot {
    animation: none;
  }
}
</style>
