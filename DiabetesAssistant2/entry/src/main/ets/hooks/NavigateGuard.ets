import { NavPathStack } from '@kit.ArkUI';
import { AuthStore } from '../stores/AuthStore';
import { LOGIN, CHANGE_PASSWORD } from '../common/constants/RouteNames';

const REQUIRES_AUTH = new Set<string>([
  'DoctorChat', 'Risk', 'Punch', 'HealthAdvice', 'ArticleDetail',
  'Admin', 'ChangePassword', 'Collections'
])

const REQUIRES_ADMIN = new Set<string>(['Admin'])

const AI_ENTRIES = new Set<string>(['HealthAdvice', 'DoctorChat'])

export function navigate(target: string, params?: Record<string, ESObject>, navStack?: NavPathStack): void {
  const stack = navStack ?? (AppStorage.get<NavPathStack>('__navStack') as NavPathStack)
  const authStore = AuthStore.getInstance()

  if (authStore.mustChangePassword === true && target !== CHANGE_PASSWORD) {
    stack.pushPathByName(CHANGE_PASSWORD, { redirect: target, ...params } as ESObject)
    return
  }

  if (REQUIRES_AUTH.has(target) && authStore.token === null) {
    stack.pushPathByName(LOGIN, { redirect: target, redirectParams: params } as ESObject)
    return
  }

  if (REQUIRES_ADMIN.has(target) && authStore.role !== 'admin') {
    return
  }

  if (AI_ENTRIES.has(target)) {
    stack.pushPathByName(target, params as ESObject)
    return
  }

  stack.pushPathByName(target, params as ESObject)
}

export function navigateBack(navStack: NavPathStack): void {
  navStack.pop()
}
