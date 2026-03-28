import { createRouter, createWebHistory } from 'vue-router'
import Home from './components/Home.vue'
import Chat from './components/Chat.vue'
import StaticPage from './components/StaticPage.vue'

const routes = [
  { path: '/', component: Home },
  { path: '/chat', component: Chat },
  { path: '/terms', component: StaticPage, props: { pageKey: 'terms' } },
  { path: '/privacy', component: StaticPage, props: { pageKey: 'privacy' } },
  { path: '/disclaimer', component: StaticPage, props: { pageKey: 'disclaimer' } },
  { path: '/about', component: StaticPage, props: { pageKey: 'about' } },
  { path: '/guide', component: StaticPage, props: { pageKey: 'guide' } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
