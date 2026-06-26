import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

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
    path: '/life-plan',
    component: () => import('@/views/LifePlan.vue'),
    meta: { requiresAuth: true },
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
        meta: { requiresAuth: true },
      },
      {
        path: 'punch',
        component: () => import('@/views/Punch.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'advice',
        component: () => import('@/views/HealthAdvice.vue'),
        meta: { requiresAuth: true },
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

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth === false) {
    return next()
  }

  if (!authStore.token) {
    return next({ path: '/login', query: { redirect: to.fullPath } })
  }

  if (to.meta.requiresAdmin && authStore.role !== 'admin') {
    return next('/home')
  }

  if (authStore.mustChangePassword && to.path !== '/change-password') {
    return next('/change-password')
  }

  next()
})
