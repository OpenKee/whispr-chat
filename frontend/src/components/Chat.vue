<template>
  <div class="chat-page">
    <!-- Searching -->
    <div v-if="state === 'searching'" class="searching">
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
            <div class="partner-name">{{ partnerNickname }}</div>
            <div class="partner-status">正在聊天</div>
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
            <div class="message-bubble">{{ msg.content }}</div>
            <div class="message-time">{{ formatTime(msg.timestamp) }}</div>
          </template>
        </div>
      </div>

      <div class="chat-input">
        <input
          ref="inputEl"
          v-model="inputText"
          @keydown.enter="sendMessage"
          placeholder="输入消息..."
          maxlength="500"
        />
        <button class="btn-send" @click="sendMessage" :disabled="!inputText.trim()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    </template>

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

    <!-- Idle (initial / after cancel) -->
    <div v-else class="idle-screen">
      <div class="idle-content">
        <router-link to="/" class="back-link">← 返回</router-link>
        <div class="logo-sm">🤫</div>
        <h2>准备好了吗？</h2>
        <button class="btn-primary" @click="startChat">开始匹配</button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, nextTick, onUnmounted } from 'vue'

export default {
  name: 'Chat',
  setup() {
    const state = ref('idle')
    const nickname = ref('')
    const partnerNickname = ref('')
    const roomId = ref('')
    const messages = ref([])
    const inputText = ref('')
    const searchingSeconds = ref(0)
    const messagesEl = ref(null)
    const inputEl = ref(null)

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

      ws.onopen = () => {
        console.log('[ws] connected')
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        handleMessage(data)
      }

      ws.onclose = () => {
        console.log('[ws] disconnected')
        if (state.value === 'chatting') {
          state.value = 'left'
        } else if (state.value === 'searching') {
          stopSearching()
          state.value = 'idle'
        }
      }

      ws.onerror = () => {
        console.error('[ws] error')
      }
    }

    function handleMessage(data) {
      switch (data.type) {
        case 'matched':
          nickname.value = data.nickname
          partnerNickname.value = data.partnerNickname
          roomId.value = data.roomId
          messages.value = []
          state.value = 'chatting'
          stopSearching()
          nextTick(() => {
            inputEl.value?.focus()
          })
          break

        case 'waiting':
          state.value = 'searching'
          break

        case 'message':
          messages.value.push({
            content: data.content,
            nickname: data.nickname,
            timestamp: data.timestamp,
            self: false
          })
          scrollToBottom()
          break

        case 'partner_left':
          state.value = 'left'
          break

        case 'partner_reconnected':
          break

        case 'timeout':
          stopSearching()
          state.value = 'idle'
          break

        case 'history':
          if (data.messages) {
            data.messages.forEach(m => {
              messages.value.push({
                content: m.content,
                nickname: m.nickname,
                timestamp: new Date(m.created_at + 'Z').getTime(),
                self: m.nickname === nickname.value
              })
            })
            scrollToBottom()
          }
          break
      }
    }

    function startChat() {
      state.value = 'searching'
      searchingSeconds.value = 0
      messages.value = []

      searchTimer = setInterval(() => {
        searchingSeconds.value++
        if (searchingSeconds.value > 120) {
          stopSearching()
          state.value = 'idle'
        }
      }, 1000)

      connect()
      setTimeout(() => {
        if (ws?.readyState === 1) {
          ws.send(JSON.stringify({ type: 'join', clientId }))
        }
      }, 300)
    }

    function cancelSearch() {
      if (ws) {
        ws.send(JSON.stringify({ type: 'leave' }))
        ws.close()
        ws = null
      }
      stopSearching()
      state.value = 'idle'
    }

    function stopSearching() {
      if (searchTimer) {
        clearInterval(searchTimer)
        searchTimer = null
      }
    }

    function sendMessage() {
      const content = inputText.value.trim()
      if (!content || state.value !== 'chatting' || !ws) return

      ws.send(JSON.stringify({ type: 'message', content }))

      messages.value.push({
        content,
        nickname: nickname.value,
        timestamp: Date.now(),
        self: true
      })

      inputText.value = ''
      scrollToBottom()
    }

    function leaveChat() {
      if (ws) {
        ws.send(JSON.stringify({ type: 'leave' }))
        ws.close()
        ws = null
      }
      state.value = 'idle'
      messages.value = []
    }

    function scrollToBottom() {
      nextTick(() => {
        if (messagesEl.value) {
          messagesEl.value.scrollTop = messagesEl.value.scrollHeight
        }
      })
    }

    function formatTime(ts) {
      if (!ts) return ''
      const d = new Date(ts)
      return (
        d.getHours().toString().padStart(2, '0') +
        ':' +
        d.getMinutes().toString().padStart(2, '0')
      )
    }

    onUnmounted(() => {
      if (ws) ws.close()
      if (searchTimer) clearInterval(searchTimer)
    })

    return {
      state, nickname, partnerNickname, roomId,
      messages, inputText, searchingSeconds,
      messagesEl, inputEl,
      startChat, cancelSearch, sendMessage, leaveChat,
      formatTime
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

/* ===== Idle ===== */
.idle-screen {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.3s ease;
}

.idle-content {
  text-align: center;
}

.back-link {
  display: inline-block;
  color: var(--text-muted);
  text-decoration: none;
  font-size: 14px;
  margin-bottom: 32px;
  transition: color 0.2s;
}

.back-link:hover {
  color: var(--text-primary);
}

.logo-sm {
  font-size: 48px;
  margin-bottom: 16px;
}

.idle-content h2 {
  font-size: 22px;
  font-weight: 500;
  margin-bottom: 24px;
  color: var(--text-secondary);
}

/* ===== Searching ===== */
.searching {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.3s ease;
}

.searching-content {
  text-align: center;
}

.spinner {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 24px;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent);
  animation: dotBounce 1.4s infinite ease-in-out both;
}

.dot1 { animation-delay: -0.32s; }
.dot2 { animation-delay: -0.16s; }
.dot3 { animation-delay: 0s; }

.searching h2 {
  font-size: 20px;
  font-weight: 500;
  margin-bottom: 8px;
}

.searching-hint {
  color: var(--text-muted);
  font-size: 14px;
  margin-bottom: 24px;
}

/* ===== Chat ===== */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.partner-avatar {
  font-size: 28px;
}

.partner-name {
  font-weight: 600;
  font-size: 15px;
}

.partner-status {
  font-size: 12px;
  color: var(--success);
}

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
  max-width: 75%;
  animation: slideUp 0.2s ease;
}

.message.self {
  align-self: flex-end;
  align-items: flex-end;
}

.message.system {
  align-self: center;
  max-width: none;
}

.system-text {
  color: var(--text-muted);
  font-size: 12px;
  padding: 8px 0;
}

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

.chat-input {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-secondary);
}

.chat-input input {
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

.chat-input input:focus {
  border-color: var(--accent);
}

.chat-input input::placeholder {
  color: var(--text-muted);
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

.btn-primary:hover {
  background: var(--accent-hover);
  transform: translateY(-1px);
}

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

.btn-ghost:hover {
  border-color: var(--text-muted);
  color: var(--text-primary);
}

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

.btn-danger-sm:hover {
  background: rgba(255, 85, 85, 0.25);
}

.btn-send {
  width: 44px;
  height: 44px;
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

.btn-send:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn-send:disabled {
  opacity: 0.4;
  cursor: default;
}

/* ===== Partner Left ===== */
.left-screen {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.3s ease;
}

.left-content {
  text-align: center;
}

.left-emoji {
  font-size: 56px;
  margin-bottom: 16px;
}

.left-content h2 {
  font-size: 22px;
  font-weight: 500;
  margin-bottom: 24px;
  color: var(--text-secondary);
}

.left-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

/* ===== Mobile ===== */
@media (max-width: 600px) {
  .chat-header {
    padding: 10px 14px;
  }
  .chat-messages {
    padding: 14px;
  }
  .chat-input {
    padding: 10px 12px;
  }
  .message {
    max-width: 85%;
  }
}
</style>
