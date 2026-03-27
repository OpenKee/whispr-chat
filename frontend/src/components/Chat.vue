<template>
  <div class="chat-page">
    <!-- Reconnecting -->
    <div v-if="state === 'reconnecting'" class="searching">
      <div class="searching-content">
        <div class="spinner">
          <div class="dot dot1"></div>
          <div class="dot dot2"></div>
          <div class="dot dot3"></div>
        </div>
        <h2>正在重新连接...</h2>
      </div>
    </div>

    <!-- Searching -->
    <div v-else-if="state === 'searching'" class="searching">
      <div class="searching-content">
        <div class="spinner">
          <div class="dot dot1"></div>
          <div class="dot dot2"></div>
          <div class="dot dot3"></div>
        </div>
        <h2>正在寻找聊天对象...</h2>
        <p class="searching-hint">{{ searchingSeconds }}s</p>
        <button class="btn-ghost" @click="cancelSearch">取消</button>
      </div>
    </div>

    <!-- Chatting -->
    <template v-else-if="state === 'chatting'">
      <div class="chat-header">
        <div class="chat-header-left">
          <span class="partner-avatar">🎭</span>
          <div>
            <div class="partner-name">
              {{ partnerNickname }}
              <span class="partner-tag" v-if="partnerGender">{{ genderLabel }}</span>
              <span class="partner-tag" v-if="partnerAge">{{ partnerAge }}</span>
              <span class="partner-tag" v-if="partnerCity">📍 {{ partnerCity }}</span>
            </div>
            <div class="partner-status" :class="{ typing: isPartnerTyping }">
              {{ isPartnerTyping ? '正在输入...' : '正在聊天' }}
            </div>
          </div>
        </div>
        <button class="btn-danger-sm" @click="leaveChat">离开</button>
      </div>

      <div class="chat-messages" ref="messagesEl">
        <div class="messages-system" v-if="messages.length === 0">
          已匹配成功，开始聊天吧 ✨
        </div>
        <div
          v-for="(msg, i) in messages"
          :key="i"
          class="message"
          :class="{ self: msg.self, system: msg.system }"
        >
          <div v-if="msg.system" class="system-text">{{ msg.content }}</div>
          <template v-else>
            <div v-if="msg.imageUrl" class="message-image" @click="previewImage(msg.imageUrl)">
              <img :src="msg.imageUrl" loading="lazy" />
            </div>
            <div v-if="msg.content" class="message-bubble">{{ msg.content }}</div>
            <div class="message-time">{{ formatTime(msg.timestamp) }}</div>
          </template>
        </div>
      </div>

      <!-- Image preview before sending -->
      <div v-if="imagePreview" class="image-preview-bar">
        <div class="image-preview-thumb">
          <img :src="imagePreview" />
          <button class="image-preview-close" @click="cancelImage">×</button>
        </div>
        <span class="image-preview-size">{{ imageSizeText }}</span>
      </div>

      <div class="chat-input">
        <input
          type="file"
          ref="fileInputEl"
          accept="image/jpeg,image/png,image/gif,image/webp"
          @change="onFileSelected"
          style="display:none"
        />
        <button class="btn-icon" @click="$refs.fileInputEl.click()" title="发送图片">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
        </button>
        <input
          ref="inputEl"
          v-model="inputText"
          @keydown.enter="sendMessage"
          @input="onTyping"
          placeholder="输入消息..."
          maxlength="500"
        />
        <button class="btn-send" @click="sendMessage" :disabled="sending">
          <svg v-if="!sending" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
          <span v-else class="send-loading"></span>
        </button>
      </div>
    </template>

    <!-- Image lightbox -->
    <div v-if="lightboxUrl" class="lightbox" @click="lightboxUrl = ''">
      <img :src="lightboxUrl" />
    </div>

    <!-- Partner Left -->
    <div v-else-if="state === 'left'" class="left-screen">
      <div class="left-content">
        <div class="left-emoji">👋</div>
        <h2>对方已离开</h2>
        <div class="left-actions">
          <button class="btn-primary" @click="startChat">再匹配一个</button>
          <router-link to="/" class="btn-ghost">回到首页</router-link>
        </div>
      </div>
    </div>

  </div>
</template>

<script>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const SESSION_KEY = 'whispr_session'
const MAX_IMAGE_SIZE = 20 * 1024 * 1024

function saveSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data))
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (Date.now() - (s.savedAt || 0) > 30000) return null
    return s
  } catch { return null }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

export default {
  name: 'Chat',
  setup() {
    const router = useRouter()
    const state = ref('reconnecting')
    const nickname = ref('')
    const partnerNickname = ref('')
    const partnerGender = ref('')
    const partnerAge = ref('')
    const partnerCity = ref('')
    const roomId = ref('')
    const messages = ref([])
    const inputText = ref('')
    const searchingSeconds = ref(0)
    const messagesEl = ref(null)
    const inputEl = ref(null)
    const fileInputEl = ref(null)
    const imagePreview = ref('')
    const imageFile = ref(null)
    const imageSizeText = ref('')
    const lightboxUrl = ref('')
    const sending = ref(false)
    const isPartnerTyping = ref(false)
    let typingTimer = null
    let partnerTypingTimer = null
    let isTyping = false

    const genderLabel = computed(() => {
      const map = { male: '男', female: '女', other: '其他' }
      return map[partnerGender.value] || ''
    })

    let clientId = localStorage.getItem('whispr_client_id')
    if (!clientId) {
      clientId = crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36)
      localStorage.setItem('whispr_client_id', clientId)
    }

    let ws = null
    let searchTimer = null

    function getWsUrl() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      return proto + '//' + location.host + '/ws'
    }

    function connect() {
      if (ws && ws.readyState <= 1) return
      ws = new WebSocket(getWsUrl())
      ws.onmessage = (event) => {
        handleMessage(JSON.parse(event.data))
      }
      ws.onclose = () => {
        if (state.value === 'chatting') {
          saveSession({
            nickname: nickname.value,
            partnerNickname: partnerNickname.value,
            partnerGender: partnerGender.value,
            partnerAge: partnerAge.value,
            roomId: roomId.value,
            savedAt: Date.now()
          })
          state.value = 'reconnecting'
          autoReconnect()
        } else if (state.value === 'searching') {
          stopSearching()
        }
      }
    }

    function handleMessage(data) {
      switch (data.type) {
        case 'matched':
          nickname.value = data.nickname
          partnerNickname.value = data.partnerNickname
          partnerGender.value = data.partnerGender || ''
          partnerAge.value = data.partnerAge || ''
          partnerCity.value = data.partnerCity || ''
          roomId.value = data.roomId
          state.value = 'chatting'
          stopSearching()
          saveSession({
            nickname: data.nickname,
            partnerNickname: data.partnerNickname,
            partnerGender: data.partnerGender,
            partnerAge: data.partnerAge,
            partnerCity: data.partnerCity,
            roomId: data.roomId,
            savedAt: Date.now()
          })
          // Load history
          if (ws?.readyState === 1) {
            ws.send(JSON.stringify({ type: 'history' }))
          }
          nextTick(() => inputEl.value?.focus())
          break

        case 'message':
          isPartnerTyping.value = false
          clearTimeout(partnerTypingTimer)
          messages.value.push({
            content: data.content || '',
            imageUrl: data.imageUrl || '',
            nickname: data.nickname,
            timestamp: data.timestamp,
            self: false
          })
          scrollToBottom()
          break

        case 'partner_left':
          clearSession()
          state.value = 'left'
          break

        case 'partner_reconnected':
          break

        case 'typing':
          isPartnerTyping.value = data.isTyping
          clearTimeout(partnerTypingTimer)
          if (data.isTyping) {
            partnerTypingTimer = setTimeout(() => {
              isPartnerTyping.value = false
            }, 3000)
          }
          break

        case 'history':
          if (data.messages && data.messages.length > 0) {
            const historyMsgs = data.messages.map(m => ({
              content: m.content || '',
              imageUrl: m.image_url || '',
              nickname: m.nickname,
              timestamp: new Date(m.created_at + 'Z').getTime(),
              self: m.nickname === nickname.value
            }))
            messages.value = [...historyMsgs, ...messages.value]
            scrollToBottom()
          }
          break

        case 'timeout':
          stopSearching()
          clearSession()
          break
      }
    }

    function sendJoin() {
      if (ws?.readyState === 1) {
        let profile = {}
        try { profile = JSON.parse(localStorage.getItem('whispr_profile') || '{}') } catch {}
        ws.send(JSON.stringify({
          type: 'join', clientId,
          gender: profile.gender || '', age: profile.age || ''
        }))
      }
    }

    function startChat() {
      state.value = 'searching'
      searchingSeconds.value = 0
      messages.value = []
      clearSession()
      searchTimer = setInterval(() => {
        searchingSeconds.value++
        if (searchingSeconds.value > 120) {
          stopSearching()
          clearSession()
          router.push('/')
        }
      }, 1000)
      connect()
      setTimeout(sendJoin, 300)
    }

    function autoReconnect() {
      connect()
      setTimeout(sendJoin, 300)
      setTimeout(() => {
        if (state.value === 'reconnecting') {
          clearSession()
          router.push('/')
        }
      }, 5000)
    }

    function cancelSearch() {
      if (ws) { ws.send(JSON.stringify({ type: 'leave' })); ws.close(); ws = null }
      stopSearching(); clearSession(); router.push('/')
    }

    function stopSearching() {
      if (searchTimer) { clearInterval(searchTimer); searchTimer = null }
    }

    function onTyping() {
      if (!ws || ws.readyState !== 1) return
      if (!isTyping) {
        isTyping = true
        ws.send(JSON.stringify({ type: 'typing', isTyping: true }))
      }
      clearTimeout(typingTimer)
      typingTimer = setTimeout(() => {
        isTyping = false
        if (ws?.readyState === 1) {
          ws.send(JSON.stringify({ type: 'typing', isTyping: false }))
        }
      }, 1500)
    }

    function sendMessage() {
      // If there's an image to send
      if (imageFile.value) {
        uploadAndSendImage()
        return
      }
      const content = inputText.value.trim()
      if (!content || state.value !== 'chatting' || !ws) return
      ws.send(JSON.stringify({ type: 'message', content }))
      messages.value.push({ content, nickname: nickname.value, timestamp: Date.now(), self: true })
      inputText.value = ''
      // Stop typing indicator
      isTyping = false
      clearTimeout(typingTimer)
      if (ws?.readyState === 1) {
        ws.send(JSON.stringify({ type: 'typing', isTyping: false }))
      }
      scrollToBottom()
    }

    function onFileSelected(e) {
      const file = e.target.files[0]
      if (!file) return
      if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
        alert('仅支持 JPG/PNG/GIF/WEBP 格式')
        return
      }
      if (file.size > MAX_IMAGE_SIZE) {
        alert('图片太大，最大 20MB')
        return
      }
      imageFile.value = file
      imageSizeText.value = (file.size / 1024).toFixed(0) + ' KB'
      const reader = new FileReader()
      reader.onload = (ev) => { imagePreview.value = ev.target.result }
      reader.readAsDataURL(file)
      // Reset file input
      e.target.value = ''
    }

    function cancelImage() {
      imageFile.value = null
      imagePreview.value = ''
      imageSizeText.value = ''
    }

    async function uploadAndSendImage() {
      if (!imageFile.value || state.value !== 'chatting' || sending.value) return
      sending.value = true
      const file = imageFile.value
      const preview = imagePreview.value

      // Optimistically show the image
      messages.value.push({
        content: '',
        imageUrl: preview,
        nickname: nickname.value,
        timestamp: Date.now(),
        self: true
      })
      scrollToBottom()

      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await res.json()
        if (data.url) {
          // Send compressed to partner, keep original for self
          ws.send(JSON.stringify({
            type: 'image',
            url: data.url,
            compressed: data.compressed || data.url
          }))
          // Update optimistic message with original URL
          const lastMsg = messages.value[messages.value.length - 1]
          if (lastMsg && lastMsg.self) {
            lastMsg.imageUrl = data.url
          }
        }
      } catch (err) {
        console.error('Upload failed:', err)
      }

      cancelImage()
      sending.value = false
    }

    function previewImage(url) {
      lightboxUrl.value = url
    }

    function leaveChat() {
      if (ws) { ws.send(JSON.stringify({ type: 'leave' })); ws.close(); ws = null }
      clearSession(); messages.value = []; router.push('/')
    }

    function scrollToBottom() {
      nextTick(() => {
        if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
      })
    }

    function formatTime(ts) {
      if (!ts) return ''
      const d = new Date(ts)
      return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0')
    }

    onMounted(() => {
      const session = loadSession()
      if (session) {
        nickname.value = session.nickname
        partnerNickname.value = session.partnerNickname
        partnerGender.value = session.partnerGender || ''
        partnerAge.value = session.partnerAge || ''
        partnerCity.value = session.partnerCity || ''
        roomId.value = session.roomId
        state.value = 'reconnecting'
        autoReconnect()
      } else {
        startChat()
      }
    })

    onUnmounted(() => {
      if (ws) ws.close()
      if (searchTimer) clearInterval(searchTimer)
    })

    return {
      state, nickname, partnerNickname, partnerGender, partnerAge, partnerCity, genderLabel, roomId,
      messages, inputText, searchingSeconds,
      messagesEl, inputEl, fileInputEl,
      imagePreview, imageSizeText, lightboxUrl, sending, isPartnerTyping,
      startChat, cancelSearch, sendMessage, leaveChat, onTyping,
      onFileSelected, cancelImage, previewImage, formatTime
    }
  }
}
</script>

<style scoped>
.chat-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* ===== Searching ===== */
.searching {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.3s ease;
}

.searching-content { text-align: center; }

.spinner {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 24px;
}

.dot {
  width: 12px; height: 12px;
  border-radius: 50%;
  background: var(--accent);
  animation: dotBounce 1.4s infinite ease-in-out both;
}
.dot1 { animation-delay: -0.32s; }
.dot2 { animation-delay: -0.16s; }

.searching h2 { font-size: 20px; font-weight: 500; margin-bottom: 8px; }
.searching-hint { color: var(--text-muted); font-size: 14px; margin-bottom: 24px; }

/* ===== Chat Header ===== */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
}

.chat-header-left { display: flex; align-items: center; gap: 12px; }
.partner-avatar { font-size: 28px; }

.partner-name {
  font-weight: 600; font-size: 15px;
  display: flex; align-items: center; gap: 6px;
}

.partner-tag {
  font-size: 11px; font-weight: 400;
  padding: 2px 8px; border-radius: 10px;
  background: var(--bg-input); color: var(--text-muted);
}

.partner-status { font-size: 12px; color: var(--success); transition: color 0.2s; }
.partner-status.typing { color: var(--accent); }

/* ===== Messages ===== */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.messages-system {
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 40px 0;
}

.message {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 75%;
  animation: slideUp 0.2s ease;
}

.message.self { align-self: flex-end; align-items: flex-end; }
.message.system { align-self: center; max-width: none; }
.system-text { color: var(--text-muted); font-size: 12px; padding: 8px 0; }

.message-bubble {
  padding: 10px 16px;
  border-radius: 18px;
  font-size: 15px;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
}

.message.self .message-bubble {
  background: var(--bg-message-self);
  border-bottom-right-radius: 4px;
}

.message:not(.self) .message-bubble {
  background: var(--bg-message-partner);
  border-bottom-left-radius: 4px;
}

.message-time {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
  padding: 0 4px;
}

/* ===== Image Messages ===== */
.message-image {
  max-width: 220px;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  margin-bottom: 4px;
}

.message.self .message-image {
  border-bottom-right-radius: 4px;
}

.message:not(.self) .message-image {
  border-bottom-left-radius: 4px;
}

.message-image img {
  width: 100%;
  display: block;
  transition: opacity 0.2s;
}

.message-image:hover img {
  opacity: 0.9;
}

/* ===== Image Preview Bar ===== */
.image-preview-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
}

.image-preview-thumb {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 8px;
  overflow: hidden;
}

.image-preview-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-preview-close {
  position: absolute;
  top: 2px; right: 2px;
  width: 18px; height: 18px;
  border-radius: 50%;
  border: none;
  background: rgba(0,0,0,0.7);
  color: white;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.image-preview-size {
  font-size: 12px;
  color: var(--text-muted);
}

/* ===== Chat Input ===== */
.chat-input {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-secondary);
  align-items: center;
}

.chat-input input[type="text"],
.chat-input input:not([type]) {
  flex: 1;
  padding: 12px 16px;
  font-size: 15px;
  border: 1px solid var(--border);
  border-radius: 24px;
  background: var(--bg-input);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.2s;
}

.chat-input input:focus { border-color: var(--accent); }
.chat-input input::placeholder { color: var(--text-muted); }

.btn-icon {
  width: 40px; height: 40px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.btn-icon:hover {
  color: var(--accent);
  background: var(--accent-glow);
}

.btn-send {
  width: 44px; height: 44px;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.btn-send:hover:not(:disabled) { background: var(--accent-hover); }
.btn-send:disabled { opacity: 0.4; cursor: default; }

.send-loading {
  width: 18px; height: 18px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ===== Lightbox ===== */
.lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  cursor: zoom-out;
  animation: fadeIn 0.2s ease;
}

.lightbox img {
  max-width: 90vw;
  max-height: 90vh;
  border-radius: 8px;
}

/* ===== Buttons ===== */
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

.btn-primary:hover { background: var(--accent-hover); transform: translateY(-1px); }

.btn-ghost {
  padding: 10px 32px;
  font-size: 14px;
  border: 1px solid var(--border);
  border-radius: 50px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  text-decoration: none;
  transition: all 0.2s;
  display: inline-block;
}

.btn-ghost:hover { border-color: var(--text-muted); color: var(--text-primary); }

.btn-danger-sm {
  padding: 8px 20px;
  font-size: 13px;
  border: none;
  border-radius: 50px;
  background: rgba(255, 85, 85, 0.15);
  color: var(--danger);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-danger-sm:hover { background: rgba(255, 85, 85, 0.25); }

/* ===== Partner Left ===== */
.left-screen {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.3s ease;
}

.left-content { text-align: center; }
.left-emoji { font-size: 56px; margin-bottom: 16px; }

.left-content h2 {
  font-size: 22px; font-weight: 500;
  margin-bottom: 24px; color: var(--text-secondary);
}

.left-actions { display: flex; gap: 12px; justify-content: center; }

/* ===== Mobile ===== */
@media (max-width: 600px) {
  .chat-header { padding: 10px 14px; }
  .chat-messages { padding: 14px; }
  .chat-input { padding: 10px 12px; }
  .message { max-width: 85%; }
  .message-image { max-width: 180px; }
}
</style>
