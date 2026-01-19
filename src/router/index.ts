import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/Home.vue'),
      meta: {
        title: '首页 - AI 养老健康评估'
      }
    },
    {
      path: '/assessment',
      name: 'assessment',
      component: () => import('@/views/AssessmentChat.vue'),
      meta: {
        title: '健康评估对话 - AI 养老健康评估'
      }
    },
    {
      path: '/report',
      name: 'report',
      component: () => import('@/views/ReportView.vue'),
      meta: {
        title: '健康评估报告 - AI 养老健康评估'
      }
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

// 路由守卫 - 更新页面标题
router.beforeEach((to, from, next) => {
  document.title = (to.meta.title as string) || 'AI 养老健康评估'
  next()
})

export default router
