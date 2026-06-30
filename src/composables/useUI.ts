import { ref } from 'vue'
import type SwalType from 'sweetalert2'

/**
 * 统一 UI 工具 Composable。
 *
 * 设计依据: docs/4_frontend_gap_todo_v2.md A5
 * 将散落于各页面组件的 SweetAlert2 Toast/Loading 调用，以及路由守卫中的
 * 免责声明判断与展示，统一封装到本 composable，便于复用和后续样式调整。
 */

// 懒加载 SweetAlert2，避免在不需要时引入全部模块
let SwalPromise: Promise<typeof SwalType> | null = null

async function getSwal(): Promise<typeof SwalType> {
  if (!SwalPromise) {
    SwalPromise = import('sweetalert2').then((m) => m.default)
  }
  return SwalPromise
}

// ========== Toast 提示 ==========

export interface ToastOptions {
  icon?: 'success' | 'error' | 'warning' | 'info' | 'question'
  title: string
  position?: 'top' | 'top-start' | 'top-end' | 'center' | 'center-start' | 'center-end' | 'bottom' | 'bottom-start' | 'bottom-end'
  timer?: number
}

const DEFAULT_TOAST_TIMER = 2500

/**
 * 显示一条 Toast 提示。
 */
export async function showToast(options: ToastOptions): Promise<void> {
  const Swal = await getSwal()
  await Swal.fire({
    toast: true,
    position: options.position || 'top',
    icon: options.icon || 'info',
    title: options.title,
    showConfirmButton: false,
    timer: options.timer ?? DEFAULT_TOAST_TIMER,
    timerProgressBar: true,
  })
}

export async function showSuccess(title: string, timer?: number): Promise<void> {
  await showToast({ icon: 'success', title, timer })
}

export async function showError(title: string, timer?: number): Promise<void> {
  await showToast({ icon: 'error', title, timer })
}

export async function showWarning(title: string, timer?: number): Promise<void> {
  await showToast({ icon: 'warning', title, timer })
}

export async function showInfo(title: string, timer?: number): Promise<void> {
  await showToast({ icon: 'info', title, timer })
}

// ========== Loading 提示 ==========

const loadingCounter = ref(0)

/**
 * 显示 Loading 遮罩（支持并发调用：需调用同等次数 hideLoading 才会关闭）。
 *
 * @param title - 提示文本，默认 '加载中...'
 */
export async function showLoading(title = '加载中...'): Promise<void> {
  const Swal = await getSwal()
  loadingCounter.value++
  Swal.fire({
    title,
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: () => {
      Swal.showLoading()
    },
  })
}

/**
 * 关闭 Loading 遮罩。
 * 若存在多次 showLoading 调用，仅减少计数器；计数器归零时关闭弹窗。
 */
export async function hideLoading(): Promise<void> {
  if (loadingCounter.value > 0) {
    loadingCounter.value--
  }
  if (loadingCounter.value <= 0) {
    const Swal = await getSwal()
    Swal.close()
    loadingCounter.value = 0
  }
}

// ========== 免责声明 ==========

const DISCLAIMER_KEY = 'disclaimer_accepted'

/**
 * 用户是否已同意免责声明。
 */
export function hasAcceptedDisclaimer(): boolean {
  return localStorage.getItem(DISCLAIMER_KEY) === 'true'
}

/**
 * 展示医学免责声明弹窗。
 *
 * @returns true 表示用户同意，false 表示拒绝
 */
export async function showDisclaimer(): Promise<boolean> {
  const Swal = await getSwal()
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

/**
 * 设置免责声明同意状态。
 */
export function setDisclaimerAccepted(accepted: boolean): void {
  if (accepted) {
    localStorage.setItem(DISCLAIMER_KEY, 'true')
  } else {
    localStorage.removeItem(DISCLAIMER_KEY)
  }
}

// ========== 登录提示 ==========

/**
 * 显示"请先登录"提示并重定向到登录页。
 * 统一 DoctorChatView / Admin / AiChatDialog 三处的重复 toast 逻辑。
 */
export async function showLoginRequired(): Promise<void> {
  await showInfo('请先登录')
  const { router } = await import('@/router')
  router.push('/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search))
}

// ========== Composable 入口 ==========

export function useUI() {
  return {
    // Toast
    showToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    // Loading
    showLoading,
    hideLoading,
    loadingCounter,
    // Disclaimer
    hasAcceptedDisclaimer,
    showDisclaimer,
    setDisclaimerAccepted,
  }
}
