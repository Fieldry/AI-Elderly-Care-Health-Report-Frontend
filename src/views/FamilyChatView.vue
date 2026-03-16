<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()
const route = useRoute()

const elderlyId = computed(() => route.params.elderly_id as string)
const token = computed(() => localStorage.getItem('token') || '')
const apiOrigin = import.meta.env.VITE_BACKEND_ORIGIN || ''

const messages = ref<Array<{ role: string; content: string }>>([])
const inputMessage = ref('')
const isLoading = ref(false)
const messagesContainer = ref<HTMLElement>()
const elderlyName = ref('老年人')

async function loadChatHistory() {
  try {
    const response = await fetch(`${apiOrigin}/chat/history/${elderlyId.value}`, {
      headers: { 'Authorization': `Bearer ${token.value}` }
    })
    if (response.ok) {
      const data = await response.json()
      messages.value = data || []
    }
  } catch (error) {
    console.error('加载历史失败', error)
  }
}

async function sendMessage() {
  if (!inputMessage.value.trim()) return

  const userMsg = inputMessage.value
  inputMessage.value = ''

  messages.value.push({ role: 'user', content: userMsg })

  isLoading.value = true
  try {
    const response = await fetch(`${apiOrigin}/chat/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.value}`
      },
      body: JSON.stringify({
        sessionId: elderlyId.value,
        message: userMsg
      })
    })

    if (!response.ok) throw new Error('发送失败')

    const data = await response.json()
    messages.value.push({ role: 'assistant', content: data.content })
  } catch (error) {
    ElMessage.error('发送消息失败')
    messages.value.pop()
  } finally {
    isLoading.value = false
    await nextTick()
    scrollToBottom()
  }
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

function goBack() {
  router.push('/family/hub')
}

onMounted(() => {
  loadChatHistory()
  scrollToBottom()
})
</script>

<template>
  <div class="chat-page">
    <header class="chat-header">
      <button class="back-btn" @click="goBack">← 返回</button>
      <h1>💬 与 {{ elderlyName }} 对话</h1>
      <div style="width: 60px"></div>
    </header>

    <div class="chat-container">
      <div ref="messagesContainer" class="messages-container">
        <div v-if="messages.length === 0" class="empty-state">
          <p>暂无对话记录</p>
          <p class="hint">开始与老年人对话吧</p>
        </div>

        <div v-for="(msg, idx) in messages" :key="idx" class="message-group" :class="msg.role">
          <div class="message-bubble">{{ msg.content }}</div>
        </div>
      </div>

      <div class="input-area">
        <div class="input-wrapper">
          <input
            v-model="inputMessage"
            type="text"
            placeholder="输入消息..."
            @keyup.enter="sendMessage"
            :disabled="isLoading"
          />
          <button @click="sendMessage" :disabled="isLoading || !inputMessage.trim()">
            {{ isLoading ? '发送中...' : '发送' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f7fa;
}

.chat-header {
  background: white;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  gap: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.back-btn {
  padding: 8px 16px;
  background: #f0f9ff;
  color: #409eff;
  border: 1px solid #b3d8ff;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}

.chat-header h1 {
  margin: 0;
  flex: 1;
  font-size: 20px;
  color: #333;
}

.chat-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
}

.empty-state p {
  margin: 0;
  font-size: 16px;
}

.empty-state .hint {
  font-size: 14px;
  margin-top: 8px;
}

.message-group {
  display: flex;
  margin-bottom: 12px;
}

.message-group.user {
  justify-content: flex-end;
}

.message-group.assistant {
  justify-content: flex-start;
}

.message-bubble {
  max-width: 60%;
  padding: 12px 16px;
  border-radius: 12px;
  word-wrap: break-word;
  line-height: 1.5;
}

.message-group.user .message-bubble {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.message-group.assistant .message-bubble {
  background: #e8e8e8;
  color: #333;
}

.input-area {
  background: white;
  padding: 16px 24px;
  border-top: 1px solid #e8e8e8;
}

.input-wrapper {
  display: flex;
  gap: 12px;
  max-width: 1000px;
  margin: 0 auto;
}

.input-wrapper input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
}

.input-wrapper input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
}

.input-wrapper button {
  padding: 12px 24px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s;
}

.input-wrapper button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 12px rgba(102, 126, 234, 0.3);
}

.input-wrapper button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
