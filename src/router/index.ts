import { createRouter, createWebHistory } from 'vue-router'

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

    if (to.path !== from.path) {
      return { top: 0 }
    }

    return undefined
  },
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue')
    },
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue')
    },
    {
      path: '/elderly',
      name: 'elderly',
      component: () => import('@/views/ElderlyHubView.vue')
    },
    {
      path: '/elderly/assessment',
      name: 'elderly-assessment',
      component: () => import('@/views/AssessmentView.vue')
    },
    {
      path: '/elderly/companion',
      name: 'elderly-companion',
      component: () => import('@/views/CompanionView.vue')
    },
    {
      path: '/family',
      name: 'family',
      component: () => import('@/views/FamilyPortalView.vue')
    },
    {
      path: '/family/hub',
      name: 'family-hub',
      component: () => import('@/views/FamilyHubView.vue')
    },
    {
      path: '/family/supplement/:elderly_id',
      name: 'family-supplement',
      component: () => import('@/views/FamilySupplementView.vue')
    },
    {
      path: '/family/chat/:elderly_id',
      name: 'family-chat',
      component: () => import('@/views/FamilyChatView.vue')
    },
    {
      path: '/family/edit/:elderly_id',
      name: 'family-edit',
      component: () => import('@/views/FamilyEditView.vue')
    },
    {
      path: '/family/reports/:elderly_id',
      name: 'family-reports',
      component: () => import('@/views/FamilyReportsView.vue')
    },
    {
      path: '/doctor',
      name: 'doctor',
      component: () => import('@/views/DoctorPortalView.vue')
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

export default router
