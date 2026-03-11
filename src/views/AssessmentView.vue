<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownIt from 'markdown-it'
import {
  getChatHistory,
  getChatProgress,
  getSessionDetail,
  listSessions,
  sendChatMessage,
  startChat,
  deleteSession
} from '@/api/chat'
import type { ChatMessage, ReportData, SessionMetadata } from '@/types'

const router = useRouter()

const sessions = ref<SessionMetadata[]>([])
const activeSessionId = ref('')
const messages = ref<ChatMessage[]>([])

const inputText = ref('')
const isSending = ref(false)
const loadingSession = ref(false)
const actionError = ref('')

const progress = ref(0)
const progressState = ref('greeting')
const completedGroups = ref<string[]>([])
const pendingGroups = ref<string[]>([])

const reportData = ref<ReportData | null>(null)

const chatBodyRef = ref<HTMLElement | null>(null)
const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true
})

const progressPercent = computed(() => Math.round(progress.value * 100))

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function typewriterFill(messageIndex: number, content: string) {
  const step = content.length > 400 ? 6 : content.length > 200 ? 4 : 2
  for (let i = 0; i < content.length; i += step) {
    const current = messages.value[messageIndex]
    if (!current) {
      return
    }
    current.content += content.slice(i, i + step)
    await sleep(14)
  }
}

function mapConversation(items: ChatMessage[] | null | undefined): ChatMessage[] {
  if (!items || !items.length) {
    return []
  }
  return items.map((item) => ({
    role: item.role,
    content: item.content,
    timestamp: item.timestamp
  }))
}

function renderMarkdown(content: string) {
  return md.render(content || '')
}

function formatDateTime(value?: string) {
  if (!value) {
    return '--'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function stateLabel(state: string) {
  const map: Record<string, string> = {
    greeting: '初始引导',
    collecting: '信息采集中',
    confirming: '待确认',
    generating: '生成中',
    completed: '已完成',
    follow_up: '报告后答疑'
  }
  return map[state] || state
}

function summarizeSession(meta: SessionMetadata) {
  if (meta.title) {
    return meta.title
  }
  return `会话 ${meta.session_id.slice(0, 8)}`
}

async function refreshSessions() {
  sessions.value = await listSessions()
}

async function handleDeleteSession(sessionId: string, event: Event) {
  event.stopPropagation()

  if (!confirm('确定要删除这个会话吗？删除后无法恢复。')) {
    return
  }

  try {
    await deleteSession(sessionId)

    if (sessionId === activeSessionId.value) {
      activeSessionId.value = ''
      messages.value = []
      progress.value = 0
      reportData.value = null
    }

    await refreshSessions()

    if (sessions.value.length > 0 && !activeSessionId.value) {
      await selectSession(sessions.value[0].session_id)
    }
  } catch (error) {
    console.error('删除会话失败:', error)
    alert('删除会话失败，请重试')
  }
}

function loadLatestReportFromSession(reports: Array<Record<string, unknown>>) {
  if (!reports.length) {
    reportData.value = null
    return
  }

  const sorted = [...reports].sort((a, b) => {
    const ta = String(a.generated_at || '')
    const tb = String(b.generated_at || '')
    return tb.localeCompare(ta)
  })

  const latest = sorted[0]
  const reportPayload = latest.report_data as ReportData | undefined
  reportData.value = reportPayload || null
}

async function syncProgress(sessionId: string) {
  const result = await getChatProgress(sessionId)
  progress.value = result.progress
  progressState.value = result.state
  completedGroups.value = result.completedGroups
  pendingGroups.value = result.pendingGroups
}

async function selectSession(sessionId: string) {
  if (!sessionId) {
    return
  }

  loadingSession.value = true
  actionError.value = ''

  try {
    activeSessionId.value = sessionId
    const detail = await getSessionDetail(sessionId)

    let sessionMessages = mapConversation(detail.conversation)
    if (!sessionMessages.length) {
      sessionMessages = mapConversation(await getChatHistory(sessionId))
    }
    messages.value = sessionMessages

    loadLatestReportFromSession(detail.reports)
    await syncProgress(sessionId)
  } catch (error) {
    actionError.value = (error as Error).message
  } finally {
    loadingSession.value = false
  }
}

async function createNewSession() {
  actionError.value = ''
  reportData.value = null

  try {
    const session = await startChat()
    activeSessionId.value = session.sessionId
    messages.value = [
      {
        role: 'assistant',
        content: session.welcomeMessage
      }
    ]
    progress.value = 0
    progressState.value = 'greeting'
    completedGroups.value = []
    pendingGroups.value = []

    await refreshSessions()
  } catch (error) {
    actionError.value = (error as Error).message
  }
}

async function ensureActiveSession() {
  if (activeSessionId.value) {
    return
  }
  await createNewSession()
}

async function sendMessage() {
  if (!inputText.value.trim() || isSending.value) {
    return
  }

  await ensureActiveSession()
  if (!activeSessionId.value) {
    return
  }

  actionError.value = ''

  const userMessage = inputText.value.trim()
  inputText.value = ''

  messages.value.push({ role: 'user', content: userMessage })
  messages.value.push({ role: 'assistant', content: '' })
  const assistantIndex = messages.value.length - 1

  isSending.value = true
  try {
    const response = await sendChatMessage(activeSessionId.value, userMessage)

    progress.value = response.progress
    progressState.value = response.state

    await typewriterFill(assistantIndex, response.message)
    await refreshSessions()
  } catch (error) {
    messages.value[assistantIndex].content = '抱歉，消息发送失败，请稍后重试。'
    actionError.value = (error as Error).message
  } finally {
    isSending.value = false
  }
}

watch(
  () => [messages.value.length, reportData.value?.generatedAt],
  async () => {
    await nextTick()
    if (chatBodyRef.value) {
      chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight
    }
  }
)

onMounted(async () => {
  try {
    await refreshSessions()
    if (sessions.value.length > 0) {
      await selectSession(sessions.value[0].session_id)
    } else {
      await createNewSession()
    }
  } catch (error) {
    actionError.value = (error as Error).message
  }
})
</script>

<template>
  <main class="role-page assessment-page">
    <section class="assessment-layout">
      <section class="progress-card surface-card">
        <div class="progress-head">
          <div>
            <p class="progress-title">信息收集进度</p>
            <p class="progress-state">{{ progressPercent }}% · {{ stateLabel(progressState) }}</p>
          </div>

          <div class="progress-actions">
            <button class="ghost-btn" type="button" @click="router.push('/elderly')">返回老年人入口</button>
            <button
              class="primary-btn"
              type="button"
              :disabled="isSending"
              @click="createNewSession"
            >
              新建评估
            </button>
          </div>
        </div>

        <div class="progress-track">
          <div class="progress-bar" :style="{ width: `${progressPercent}%` }" />
        </div>

        <div class="progress-groups">
          <div class="group-card">
            <strong>已完成</strong>
            <div class="tag-list">
              <span v-for="group in completedGroups" :key="group">{{ group }}</span>
              <span v-if="!completedGroups.length">暂无</span>
            </div>
          </div>
        </div>
      </section>

      <aside class="history-sidebar surface-card">
        <div class="history-topbar">
          <div>
            <h2>历史会话</h2>
          </div>
          <button class="ghost-btn" type="button" @click="refreshSessions">刷新</button>
        </div>

        <div class="session-list">
          <article
            v-for="session in sessions"
            :key="session.session_id"
            class="session-item"
            :class="{ active: session.session_id === activeSessionId }"
          >
            <button
              class="session-select"
              type="button"
              @click="selectSession(session.session_id)"
            >
              <div class="session-content">
                <p class="session-title">{{ summarizeSession(session) }}</p>
                <p class="session-meta">{{ formatDateTime(session.created_at) }}</p>
                <p class="session-tags">
                  <span v-if="session.has_report">已生成报告</span>
                  <span v-else>评估中</span>
                </p>
              </div>
            </button>
            <button
              class="delete-btn"
              type="button"
              title="删除会话"
              @click="handleDeleteSession(session.session_id, $event)"
            >
              ×
            </button>
          </article>
        </div>
      </aside>

      <section class="chat-section surface-card">
        <div ref="chatBodyRef" class="chat-body">
          <div
            v-for="(message, idx) in messages"
            :key="`${message.role}-${idx}`"
            class="message-row"
            :class="message.role"
          >
            <p class="message-role">{{ message.role === 'user' ? '您' : '助手' }}</p>
            <div
              v-if="message.role === 'assistant'"
              class="message-bubble markdown-body"
              v-html="renderMarkdown(message.content)"
            ></div>
            <div v-else class="message-bubble">{{ message.content }}</div>
          </div>

          <div v-if="loadingSession" class="hint-text">会话加载中...</div>
          <div v-if="actionError" class="error-text">{{ actionError }}</div>

          <article v-if="reportData" class="report-panel">
            <h2>健康报告结果</h2>
            <p class="report-time">生成时间：{{ formatDateTime(reportData.generatedAt) }}</p>

            <section>
              <h3>1. 健康总结</h3>
              <p>{{ reportData.summary }}</p>
            </section>

            <section>
              <h3>2. 健康画像</h3>
              <p>{{ reportData.healthPortrait.functionalStatus }}</p>
              <p>优势：{{ reportData.healthPortrait.strengths.join('、') || '暂无' }}</p>
              <p>问题：{{ reportData.healthPortrait.problems.join('、') || '暂无' }}</p>
            </section>

            <section>
              <h3>3. 风险因素</h3>
              <p class="report-label">短期风险（1-4周）</p>
              <ul>
                <li v-for="item in reportData.riskFactors.shortTerm" :key="`s-${item.name}`">
                  {{ item.name }}（{{ item.level }}）：{{ item.description }}
                </li>
              </ul>
              <p class="report-label">中期风险（1-6月）</p>
              <ul>
                <li v-for="item in reportData.riskFactors.midTerm" :key="`m-${item.name}`">
                  {{ item.name }}（{{ item.level }}）：{{ item.description }}
                </li>
              </ul>
            </section>

            <section>
              <h3>4. 行动建议</h3>
              <p class="report-label">优先级 A</p>
              <ul>
                <li v-for="item in reportData.recommendations.priority1" :key="item.id">
                  {{ item.title }}：{{ item.description }}
                </li>
              </ul>
              <p class="report-label">优先级 B</p>
              <ul>
                <li v-for="item in reportData.recommendations.priority2" :key="item.id">
                  {{ item.title }}：{{ item.description }}
                </li>
              </ul>
              <p class="report-label">优先级 C</p>
              <ul>
                <li v-for="item in reportData.recommendations.priority3" :key="item.id">
                  {{ item.title }}：{{ item.description }}
                </li>
              </ul>
            </section>
          </article>
        </div>

        <div class="chat-actions">
          <textarea
            v-model="inputText"
            placeholder="请输入老人健康情况，例如：80岁女性，近一年行动不便，需要协助洗澡。"
            :disabled="isSending"
            @keydown.enter.exact.prevent="sendMessage"
          />

          <div class="action-row">
            <button class="primary-btn" type="button" :disabled="isSending || !inputText.trim()" @click="sendMessage">
              {{ isSending ? '发送中...' : '发送' }}
            </button>
          </div>

          <p class="hint-text">信息收集完成后，在对话里回复“确认”即可开始生成报告。</p>
        </div>
      </section>
    </section>
  </main>
</template>

<style scoped>
.assessment-page {
  min-height: auto;
  display: block;
  overflow-x: hidden;
  overflow-y: auto;
  padding-top: 24px;
  padding-bottom: 24px;
}

.assessment-layout {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  grid-template-rows: auto minmax(780px, 100dvh);
  gap: 18px;
  align-items: start;
}

.progress-card {
  grid-column: 1 / -1;
  padding: 22px 24px 18px;
}

.history-sidebar,
.chat-section {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border-radius: 28px;
}

.history-sidebar {
  align-self: start;
  padding: 22px;
  display: flex;
  flex-direction: column;
}

.history-topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.history-topbar h2 {
  margin: 8px 0 0;
  color: var(--ink-strong);
  font-size: 28px;
}

.session-list {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding-right: 4px;
}

.session-item {
  width: 100%;
  padding: 16px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  border-radius: 22px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.76);
  transition: transform 0.18s ease, border-color 0.18s ease;
}

.session-item:hover {
  transform: translateY(-1px);
}

.session-item.active {
  border-color: rgba(12, 112, 109, 0.28);
  background: linear-gradient(135deg, rgba(216, 241, 236, 0.84), rgba(255, 255, 255, 0.9));
}

.session-content {
  flex: 1;
  min-width: 0;
}

.session-select {
  flex: 1;
  min-width: 0;
  text-align: left;
}

.session-title,
.session-meta,
.session-tags {
  margin: 0;
}

.session-title {
  color: var(--ink-strong);
  font-size: 18px;
  font-weight: 700;
}

.session-meta,
.session-tags {
  margin-top: 8px;
  color: var(--ink-muted);
  font-size: 15px;
}

.delete-btn {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.86);
  color: var(--ink-muted);
  font-size: 24px;
  line-height: 1;
}

.delete-btn:hover {
  border-color: rgba(189, 71, 71, 0.24);
  color: var(--danger);
}

.chat-section {
  display: grid;
  grid-template-rows: 1fr auto;
  height: 100%;
}

.progress-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.progress-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.progress-actions :deep(.ghost-btn),
.progress-actions :deep(.primary-btn) {
  min-height: 50px;
  min-width: 144px;
  font-size: 17px;
}

.progress-title,
.progress-state {
  margin: 0;
}

.progress-title {
  color: var(--ink-strong);
  font-size: 24px;
  font-weight: 800;
}

.progress-state {
  margin-top: 6px;
  color: var(--ink-muted);
  font-size: 17px;
}

.progress-track {
  margin-top: 16px;
  position: relative;
  height: 14px;
  border-radius: 999px;
  background: rgba(18, 53, 59, 0.08);
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--brand), #3ab1a7);
  transition: width 0.28s ease;
}

.progress-groups {
  margin-top: 18px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.group-card {
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(18, 53, 59, 0.08);
}

.group-card strong {
  display: inline-flex;
  color: var(--ink-strong);
  font-size: 16px;
}

.tag-list {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-list span {
  min-height: 36px;
  padding: 8px 12px;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: rgba(15, 122, 119, 0.08);
  color: var(--brand-strong);
  font-size: 14px;
  font-weight: 700;
}

.chat-body {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 22px 24px;
}

.message-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 90%;
}

.message-row.user {
  margin-left: auto;
  align-items: flex-end;
}

.message-role {
  margin: 0;
  color: var(--ink-muted);
  font-size: 14px;
  font-weight: 600;
}

.message-bubble {
  padding: 16px 18px;
  border-radius: 22px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.88);
  color: var(--ink);
  font-size: 18px;
  line-height: 1.8;
  white-space: pre-wrap;
}

.message-row.user .message-bubble {
  background: rgba(15, 122, 119, 0.08);
  border-color: rgba(15, 122, 119, 0.16);
}

.report-events {
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
}

.report-events h3 {
  margin: 0 0 8px;
  color: var(--ink-strong);
  font-size: 19px;
}

.report-events p,
.hint-text,
.error-text {
  margin: 0;
  font-size: 15px;
  line-height: 1.75;
}

.hint-text {
  color: var(--ink-muted);
}

.error-text {
  color: var(--danger);
}

.report-panel {
  margin-top: 6px;
  padding: 24px;
  border-radius: 26px;
  background: linear-gradient(135deg, rgba(251, 253, 253, 0.94), rgba(236, 244, 247, 0.92));
  border: 1px solid rgba(31, 99, 147, 0.12);
  color: var(--ink);
  line-height: 1.8;
}

.report-panel h2,
.report-panel h3 {
  color: var(--ink-strong);
}

.report-panel h2 {
  margin: 0 0 8px;
  font-size: 28px;
}

.report-panel h3 {
  margin: 0 0 10px;
  font-size: 22px;
}

.report-panel section + section {
  margin-top: 18px;
}

.report-panel p,
.report-panel li {
  font-size: 17px;
  line-height: 1.8;
}

.report-panel ul {
  margin: 8px 0 0;
  padding-left: 20px;
}

.report-time,
.report-label {
  color: var(--ink-muted);
}

.chat-actions {
  padding: 18px 24px 24px;
  border-top: 1px solid var(--line);
}

.chat-actions textarea {
  width: 100%;
  min-height: 124px;
  padding: 16px 18px;
  resize: vertical;
  border-radius: 22px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.8);
  color: var(--ink-strong);
  font-size: 18px;
  line-height: 1.8;
}

.action-row {
  margin-top: 14px;
  display: flex;
  gap: 12px;
}

.action-row :deep(.primary-btn) {
  min-height: 56px;
  padding-inline: 24px;
  font-size: 18px;
}

:deep(.markdown-body p) {
  margin: 0 0 10px;
}

:deep(.markdown-body p:last-child) {
  margin-bottom: 0;
}

:deep(.markdown-body ul),
:deep(.markdown-body ol) {
  margin: 8px 0;
  padding-left: 20px;
}

:deep(.markdown-body li + li) {
  margin-top: 6px;
}

:deep(.markdown-body strong) {
  font-weight: 800;
}

:deep(.markdown-body code) {
  padding: 2px 6px;
  border-radius: 8px;
  background: rgba(18, 53, 59, 0.06);
  font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
}

@media (max-width: 1080px) {
  .assessment-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(320px, 38dvh) minmax(780px, 100dvh);
  }

  .history-sidebar {
    align-self: start;
  }
}

@media (max-width: 800px) {
  .progress-head,
  .progress-groups {
    grid-template-columns: 1fr;
  }

  .progress-head {
    flex-direction: column;
  }

  .progress-actions {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .assessment-page {
    padding-top: 18px;
    padding-bottom: 16px;
  }

  .message-bubble,
  .chat-actions textarea,
  .report-panel p,
  .report-panel li {
    font-size: 18px;
  }

  .history-sidebar,
  .chat-section {
    border-radius: 24px;
  }

  .history-sidebar,
  .progress-card,
  .chat-body,
  .chat-actions {
    padding-left: 18px;
    padding-right: 18px;
  }

  .progress-groups {
    grid-template-columns: 1fr;
  }

  .message-row {
    max-width: 100%;
  }
}
</style>
