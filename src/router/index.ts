import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { isTokenExpired } from '@/composables/useAuth'

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

router.beforeEach(async (to, _from, next) => {
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
      localStorage.setItem('disclaimer_accepted', 'true')
      next()
    } else {
      next('/home')
    }
    return
  }

  next()
})
