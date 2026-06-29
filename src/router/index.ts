import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { isTokenExpired } from '@/composables/useAuth'
import { hasAcceptedDisclaimer, showDisclaimer, setDisclaimerAccepted } from '@/composables/useUI'

const routes: RouteRecordRaw[] = [
  {
    path: '/home',
    component: () => import('@/views/Home.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/consultation',
    component: () => import('@/views/Consultation.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/consultation/doctor/:id',
    name: 'DoctorChat',
    component: () => import('@/views/DoctorChatView.vue'),
    meta: {
      requiresAuth: true,
      requiresDisclaimer: true,
    },
  },
  {
    path: '/life-plan',
    component: () => import('@/views/LifePlan.vue'),
    meta: { requiresAuth: true, requiresDisclaimer: true },
  },
  {
    path: '/news/article/:id',
    name: 'ArticleDetail',
    component: () => import('@/views/ArticleDetailView.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/news',
    component: () => import('@/views/NewsView.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/profile',
    component: () => import('@/views/Profile.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: 'risk',
        component: () => import('@/views/Risk.vue'),
        meta: { requiresAuth: true, requiresDisclaimer: true },
      },
      {
        path: 'punch',
        component: () => import('@/views/Punch.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'advice',
        component: () => import('@/views/HealthAdvice.vue'),
        meta: { requiresAuth: true, requiresDisclaimer: true },
      },
    ],
  },
  {
    path: '/admin',
    component: () => import('@/views/Admin.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/change-password',
    component: () => import('@/views/ChangePassword.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/login',
    component: () => import('@/views/Login.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/home',
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

function isValidRedirect(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('://')
}

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth === false) {
    return next()
  }

  if (!authStore.token || isTokenExpired(authStore.token)) {
    authStore.clearAuth()
    const redirect = encodeURIComponent(to.fullPath)
    return next({ path: '/login', query: { redirect } })
  }

  if (to.meta.requiresAdmin && authStore.role !== 'admin') {
    return next('/home')
  }

  if (authStore.mustChangePassword && to.path !== '/change-password') {
    return next('/change-password')
  }

  if (to.meta.requiresDisclaimer && !hasAcceptedDisclaimer()) {
    const agreed = await showDisclaimer()
    if (agreed) {
      setDisclaimerAccepted(true)
      next()
    } else {
      // 有来源页时中止导航保留来源页；无来源页（直接打开/刷新）回首页
      if (from && from.path && from.path !== to.path) {
        next(false)
      } else {
        next('/home')
      }
    }
    return
  }

  next()
})
