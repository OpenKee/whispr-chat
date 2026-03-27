<template>
  <div class="home">
    <div class="home-content">
      <div class="logo">🤫</div>
      <h1 class="title">Whispr</h1>
      <p class="subtitle">随机匹配，匿名畅聊</p>
      <router-link to="/chat" class="btn-primary">开始聊天</router-link>
      <p class="hint">匹配到陌生人后即可开始对话</p>
    </div>
    <div class="home-footer">
      <span class="online-dot"></span>
      {{ onlineCount }} 人在线
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue'

export default {
  name: 'Home',
  setup() {
    const onlineCount = ref(0)
    let statsTimer = null

    function fetchStats() {
      fetch('/api/stats')
        .then(r => r.json())
        .then(d => { onlineCount.value = d.online })
        .catch(() => {})
    }

    onMounted(() => {
      fetchStats()
      statsTimer = setInterval(fetchStats, 10000)
    })

    onUnmounted(() => {
      if (statsTimer) clearInterval(statsTimer)
    })

    return { onlineCount }
  }
}
</script>

<style scoped>
.home {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.5s ease;
}

.home-content {
  text-align: center;
}

.logo {
  font-size: 64px;
  margin-bottom: 16px;
}

.title {
  font-size: 48px;
  font-weight: 700;
  letter-spacing: -2px;
  margin-bottom: 8px;
  background: linear-gradient(135deg, var(--text-primary), var(--accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 16px;
  margin-bottom: 40px;
}

.btn-primary {
  display: inline-block;
  padding: 14px 48px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: 50px;
  background: var(--accent);
  color: white;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.2s;
  box-shadow: 0 4px 20px var(--accent-glow);
}

.btn-primary:hover {
  background: var(--accent-hover);
  transform: translateY(-1px);
  box-shadow: 0 6px 28px var(--accent-glow);
}

.btn-primary:active {
  transform: translateY(0);
}

.hint {
  color: var(--text-muted);
  font-size: 13px;
  margin-top: 16px;
}

.home-footer {
  position: absolute;
  bottom: 32px;
  color: var(--text-muted);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.online-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
  animation: pulse 2s infinite;
}
</style>
