import { createRouter, createWebHistory } from 'vue-router'

import { getStoredSession, roleHomePath } from '@/session'
import type { Role } from '@/types'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }

    if (to.hash) {
      return {
        el: to.hash,
        behavior: 'smooth'
      }
    }

    if (to.fullPath !== from.fullPath) {
      return { top: 0 }
    }

    return undefined
  },
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue')
    },
    {
      path: '/access/:role(elderly|family|doctor)',
      name: 'access',
      component: () => import('@/views/AccessView.vue'),
      props: true
    },
    {
      path: '/elderly/assessment',
      name: 'elderly-assessment',
      component: () => import('@/views/ElderlyAssessmentView.vue')
    },
    {
      path: '/family/hub',
      name: 'family-hub',
      component: () => import('@/views/FamilyHubView.vue'),
      meta: {
        requiresAuth: true,
        roles: ['family']
      }
    },
    {
      path: '/family/elderly/:elderlyId',
      name: 'family-elderly-detail',
      component: () => import('@/views/FamilyDetailView.vue'),
      props: true,
      meta: {
        requiresAuth: true,
        roles: ['family']
      }
    },
    {
      path: '/doctor/hub',
      name: 'doctor-hub',
      component: () => import('@/views/DoctorHubView.vue'),
      meta: {
        requiresAuth: true,
        roles: ['doctor']
      }
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

router.beforeEach((to) => {
  if (!to.meta.requiresAuth) {
    return true
  }

  const session = getStoredSession()
  const requiredRoles = (to.meta.roles || []) as Role[]

  if (!session) {
    const targetRole = requiredRoles[0] || 'family'
    return {
      name: 'access',
      params: {
        role: targetRole
      }
    }
  }

  if (requiredRoles.length > 0 && !requiredRoles.includes(session.role)) {
    return roleHomePath(session.role)
  }

  return true
})

export default router
