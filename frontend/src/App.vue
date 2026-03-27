<template>
  <div class="app">
    <router-view />
  </div>
</template>

<script>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

const SESSION_KEY = 'whispr_session'

export default {
  name: 'App',
  setup() {
    const router = useRouter()

    onMounted(() => {
      // Check for active chat session — redirect to /chat for reconnection
      try {
        const raw = localStorage.getItem(SESSION_KEY)
        if (raw) {
          const session = JSON.parse(raw)
          // Session valid for 30 seconds
          if (session && session.roomId && (Date.now() - (session.savedAt || 0) < 30000)) {
            if (router.currentRoute.value.path !== '/chat') {
              router.push('/chat')
            }
          }
        }
      } catch {}
    })

    return {}
  }
}
</script>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
