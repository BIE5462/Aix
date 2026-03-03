import { createRouter, createWebHistory } from 'vue-router'
import Login from '../views/Login.vue'
import AdminLayout from '../components/AdminLayout.vue'
import Dashboard from '../views/Dashboard.vue'
import UserManagement from '../views/UserManagement.vue'
import ContentManagement from '../views/ContentManagement.vue'
import ModelManagement from '../views/ModelManagement.vue'
import VideoModelManagement from '../views/VideoModelManagement.vue'
import TextModelManagement from '../views/TextModelManagement.vue'
import ModelPricingManagement from '../views/ModelPricingManagement.vue'
import { useAuthStore } from '../utils/auth.js'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    component: AdminLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: Dashboard
      },
      {
        path: '/users',
        name: 'UserManagement',
        component: UserManagement
      },
      {
        path: '/content',
        name: 'ContentManagement',
        component: ContentManagement
      },
      {
        path: '/models',
        name: 'ModelManagement',
        component: ModelManagement
      },
      {
        path: '/model-pricing',
        name: 'ModelPricingManagement',
        component: ModelPricingManagement
      },
      {
        path: '/video-models',
        name: 'VideoModelManagement',
        component: VideoModelManagement
      },
      {
        path: '/text-models',
        name: 'TextModelManagement',
        component: TextModelManagement
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } else if (to.path === '/login' && authStore.isAuthenticated) {
    next('/')
  } else {
    next()
  }
})

export default router
