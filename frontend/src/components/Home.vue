<template>
  <div class="home">
    <div class="home-content">
      <div class="logo">🤫</div>
      <h1 class="title">Whispr</h1>
      <p class="subtitle">随机匹配，匿名畅聊</p>

      <div class="setup-card" v-if="!saved">
        <div class="setup-group">
          <label>性别</label>
          <div class="options">
            <button
              v-for="g in genders" :key="g.value"
              class="option-btn"
              :class="{ active: gender === g.value }"
              @click="gender = g.value"
            >{{ g.label }}</button>
          </div>
        </div>

        <div class="setup-group">
          <label>年龄段</label>
          <div class="options">
            <button
              v-for="a in ages" :key="a"
              class="option-btn"
              :class="{ active: age === a }"
              @click="age = a"
            >{{ a }}</button>
          </div>
        </div>

        <button
          class="btn-primary"
          :disabled="!gender || !age"
          @click="saveAndGo"
        >开始聊天</button>
      </div>

      <div class="setup-card" v-else>
        <div class="saved-info">
          <span>{{ profile.gender === 'male' ? '男' : profile.gender === 'female' ? '女' : '其他' }}</span>
          <span class="sep">·</span>
          <span>{{ profile.age }}</span>
          <button class="btn-edit" @click="saved = false">修改</button>
        </div>
        <router-link to="/chat" class="btn-primary">开始聊天</router-link>
      </div>

      <p class="hint">匹配到陌生人后即可开始对话</p>

      <!-- SEO: Feature highlights -->
      <div class="features" aria-label="功能特点">
        <span class="feature-tag">🎲 随机匹配</span>
        <span class="feature-tag">💬 实时聊天</span>
        <span class="feature-tag">🖼️ 图片分享</span>
        <span class="feature-tag">🔒 匿名隐私</span>
        <span class="feature-tag">📱 无需下载</span>
      </div>
    </div>
    <div class="home-footer">
      <span class="online-dot"></span>
      {{ onlineCount }} 人在线
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue'

const PROFILE_KEY = 'whispr_profile'

export default {
  name: 'Home',
  setup() {
    const onlineCount = ref(0)
    const gender = ref('')
    const age = ref('')
    const saved = ref(false)
    const profile = ref({})

    const genders = [
      { value: 'male', label: '男' },
      { value: 'female', label: '女' },
      { value: 'other', label: '其他' }
    ]

    const ages = ['18-25', '26-35', '36-45', '45+']

    function loadProfile() {
      try {
        const raw = localStorage.getItem(PROFILE_KEY)
        if (raw) {
          const p = JSON.parse(raw)
          if (p.gender && p.age) {
            profile.value = p
            saved.value = true
          }
        }
      } catch {}
    }

    function saveAndGo() {
      const p = { gender: gender.value, age: age.value }
      localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
      profile.value = p
      saved.value = true
    }

    let statsTimer = null

    function fetchStats() {
      fetch('/api/stats')
        .then(r => r.json())
        .then(d => { onlineCount.value = d.online })
        .catch(() => {})
    }

    onMounted(() => {
      loadProfile()
      fetchStats()
      statsTimer = setInterval(fetchStats, 10000)
    })

    onUnmounted(() => {
      if (statsTimer) clearInterval(statsTimer)
    })

    return {
      onlineCount, gender, age, saved, profile,
      genders, ages,
      saveAndGo
    }
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
  width: 100%;
  max-width: 380px;
  padding: 0 20px;
}

.logo {
  font-size: 72px;
  margin-bottom: 16px;
  line-height: 1;
  animation: logoFloat 3s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
  cursor: default;
  user-select: none;
  will-change: transform;
}

@keyframes logoFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
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
  margin-bottom: 32px;
}

.setup-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 28px 24px;
  margin-bottom: 16px;
}

.setup-group {
  margin-bottom: 24px;
  text-align: left;
}

.setup-group label {
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 10px;
  font-weight: 500;
}

.options {
  display: flex;
  gap: 8px;
}

.option-btn {
  flex: 1;
  padding: 10px 8px;
  font-size: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.option-btn:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

.option-btn.active {
  border-color: var(--accent);
  background: var(--accent-glow);
  color: var(--accent);
}

.btn-primary {
  display: inline-block;
  width: 100%;
  padding: 14px;
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
  box-sizing: border-box;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: default;
}

.saved-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 20px;
  font-size: 15px;
  color: var(--text-primary);
}

.sep {
  color: var(--text-muted);
}

.btn-edit {
  font-size: 12px;
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 50px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  margin-left: 4px;
}

.btn-edit:hover {
  color: var(--text-primary);
  border-color: var(--text-muted);
}

.hint {
  color: var(--text-muted);
  font-size: 13px;
  margin-top: 8px;
}

.features {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 24px;
}

.feature-tag {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 20px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-muted);
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

.icon-inline { display: inline-flex; vertical-align: middle; }

@media (max-width: 400px) {
  .title { font-size: 36px; }
  .setup-card { padding: 20px 16px; }
}
</style>
