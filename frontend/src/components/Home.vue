<template>
  <div class="home">
    <div class="home-content">
      <div class="logo">🤫</div><!-- 保留！品牌标志，不许换成图标 -->
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
        <span class="feature-tag"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg> 随机匹配</span>
        <span class="feature-tag"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> 实时聊天</span>
        <span class="feature-tag"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> 图片分享</span>
        <span class="feature-tag"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> 匿名隐私</span>
        <span class="feature-tag"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg> 无需下载</span>
      </div>
    </div>
    <div class="home-footer">
      <div class="footer-links">
        <router-link to="/guide">使用说明</router-link>
        <span class="sep">·</span>
        <a href="mailto:jiuhe1129@gmail.com">联系我们</a>
        <span class="sep">·</span>
        <button class="more-btn" @click="showMore = !showMore">更多 {{ showMore ? '▴' : '▾' }}</button>
      </div>
      <div class="footer-more" v-if="showMore">
        <router-link to="/terms">服务条款</router-link>
        <router-link to="/privacy">隐私政策</router-link>
        <router-link to="/disclaimer">免责声明</router-link>
        <router-link to="/about">关于我们</router-link>
      </div>
      <div class="footer-online">
        <span class="online-dot"></span>
        {{ onlineCount }} 人在线
      </div>
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
    const showMore = ref(false)

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
      onlineCount, gender, age, saved, profile, showMore,
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
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.feature-tag :deep(svg) {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 2;
  fill: none;
  flex-shrink: 0;
}

.home-footer {
  position: absolute;
  bottom: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.footer-links {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.footer-links a {
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.2s;
}

.footer-links a:hover { color: var(--text-secondary); }
.footer-links .sep { color: var(--text-muted); opacity: 0.4; }

.more-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
  transition: color 0.2s;
}

.more-btn:hover { color: var(--text-secondary); }

.footer-more {
  display: flex;
  gap: 12px;
  font-size: 12px;
  animation: fadeIn 0.2s ease;
}

.footer-more a {
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.2s;
}

.footer-more a:hover { color: var(--text-secondary); }

.footer-online {
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
