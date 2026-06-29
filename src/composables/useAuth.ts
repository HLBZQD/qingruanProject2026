import { computed } from 'vue'
import { useAuthStore } from '@/stores/authStore'

/**
 * JWT Payload 结构。
 *
 * 仅声明后端可能返回的公共字段，额外字段通过索引签名保留，
 * 便于后续扩展而无需频繁修改类型定义。
 */
export interface JwtPayload {
  /** 主题（通常为用户标识） */
  sub?: string;
  /** 用户名 */
  username?: string;
  /** 用户 ID */
  user_id?: number;
  /** 角色 */
  role?: 'user' | 'admin';
  /** 过期时间（Unix 秒） */
  exp?: number;
  /** 签发时间（Unix 秒） */
  iat?: number;
  /** 签发者 */
  iss?: string;
  /** 其他自定义声明 */
  [key: string]: any;
}

/**
 * 解析 JWT Token，返回 Payload 对象。
 *
 * 算法：split('.') → base64Url 解码 → JSON.parse。
 * 不校验签名，仅做结构/JSON 解析防御。
 *
 * @param token - JWT 字符串
 * @returns JwtPayload 或 null（解析失败/格式非法）
 */
export function parseToken(token: string): JwtPayload | null {
  if (!token || typeof token !== 'string') return null

  const parts = token.split('.')
  if (parts.length !== 3) {
    console.warn('[useAuth] Token 格式非法：缺少三段结构')
    return null
  }

  const payloadBase64 = parts[1]
  try {
    // base64Url → base64：替换 '-' -> '+', '_' -> '/'
    const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/')
    // 补齐 padding
    const padding = normalized.length % 4
    const padded = padding ? normalized + '='.repeat(4 - padding) : normalized

    const payloadJson = atob(padded)

    return JSON.parse(payloadJson) as JwtPayload
  } catch (err) {
    console.warn('[useAuth] Token payload 解析失败:', err)
    return null
  }
}

/**
 * 判断 Token 是否已过期。
 *
 * @param token - JWT 字符串
 * @returns true 表示已过期或无法解析
 */
export function isTokenExpired(token: string): boolean {
  const payload = parseToken(token)
  if (!payload || typeof payload.exp !== 'number') {
    // 无 exp 视为过期，避免无过期时间的 token 长期有效
    return true
  }
  return Math.floor(Date.now() / 1000) >= payload.exp
}

/**
 * 获取 Token 剩余有效时间（秒）。
 *
 * @param token - JWT 字符串
 * @returns 剩余秒数；已过期或非法返回 0
 */
export function getTokenRemainingTime(token: string): number {
  const payload = parseToken(token)
  if (!payload || typeof payload.exp !== 'number') return 0
  const remaining = payload.exp - Math.floor(Date.now() / 1000)
  return remaining > 0 ? remaining : 0
}

/**
 * JWT 认证工具 Composable。
 *
 * 设计依据: docs/4_frontend_gap_todo_v2.md A4
 * 提供对 authStore.token 的解析、过期检测能力，
 * 供路由守卫、页面组件等场景使用。
 */
export function useAuth() {
  const authStore = useAuthStore()

  const token = computed(() => authStore.token)
  const payload = computed(() => (authStore.token ? parseToken(authStore.token) : null))
  const isExpired = computed(() => (authStore.token ? isTokenExpired(authStore.token) : true))
  const remainingTime = computed(() => (authStore.token ? getTokenRemainingTime(authStore.token) : 0))

  return {
    token,
    payload,
    isExpired,
    remainingTime,
    parseToken,
    isTokenExpired,
    getTokenRemainingTime,
  }
}
