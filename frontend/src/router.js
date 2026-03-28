import { createRouter, createWebHistory } from 'vue-router'
import Home from './components/Home.vue'
import Chat from './components/Chat.vue'
import StaticPage from './components/StaticPage.vue'
import { terms, privacy, disclaimer, about } from './pages'

const routes = [
  { path: '/', component: Home },
  { path: '/chat', component: Chat },
  { path: '/terms', component: StaticPage, props: { title: '服务条款', content: terms } },
  { path: '/privacy', component: StaticPage, props: { title: '隐私政策', content: privacy } },
  { path: '/disclaimer', component: StaticPage, props: { title: '免责声明', content: disclaimer } },
  { path: '/about', component: StaticPage, props: { title: '关于我们', content: about } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
