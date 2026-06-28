import { api } from '@/composables/useApi'
import type { ChangePasswordRequest } from '@/types/api'

/**
 * 修改密码
 * PUT /api/user/password
 *
 * 管理员首次登录强制修改密码场景可不传 old_password
 */
export async function changePassword(data: ChangePasswordRequest): Promise<void> {
  await api.put('/user/password', data)
}
