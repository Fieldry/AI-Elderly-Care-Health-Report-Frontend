<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { getSessionDetail, listSessions } from '@/api/chat'
import EmptyStateCard from '@/components/EmptyStateCard.vue'
import ProfileOverview from '@/components/ProfileOverview.vue'
import ReportSummary from '@/components/ReportSummary.vue'
import type { SessionDetail, SessionMetadata } from '@/types'
import { getIdentityTitle } from '@/utils/profile'

const records = ref<SessionMetadata[]>([])
const selectedSessionId = ref('')
const selectedDetail = ref<SessionDetail | null>(null)
const loading = ref(false)
const detailLoading = ref(false)
const errorMessage = ref('')
const searchQuery = ref('')

const filteredRecords = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  if (!keyword) {
    return records.value
  }

  return records.value.filter((record) => {
    const sourceText = `${record.title || ''} ${record.session_id}`.toLowerCase()
    return sourceText.includes(keyword)
  })
})

const summaryMetrics = computed(() => ({
  total: records.value.length,
  withProfile: records.value.filter((item) => item.has_profile).length,
  withReport: records.value.filter((item) => item.has_report).length
}))

const selectedTitle = computed(() => {
  if (!selectedDetail.value) {
    return '请选择一条老人记录'
  }

  return getIdentityTitle(
    selectedDetail.value.profile || {},
    selectedDetail.value.metadata.title || `记录 ${selectedDetail.value.metadata.session_id.slice(0, 8)}`
  )
})

const latestConversation = computed(() => {
  return (selectedDetail.value?.conversation || []).slice(-6)
})

function formatDateTime(value: string) {
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

async function selectRecord(sessionId: string) {
  selectedSessionId.value = sessionId
  detailLoading.value = true
  errorMessage.value = ''

  try {
    selectedDetail.value = await getSessionDetail(sessionId)
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '加载记录详情失败，请稍后重试。'
  } finally {
    detailLoading.value = false
  }
}

async function loadRecords() {
  loading.value = true
  errorMessage.value = ''

  try {
    records.value = (await listSessions()).sort((left, right) =>
      right.created_at.localeCompare(left.created_at)
    )

    if (records.value.length > 0) {
      await selectRecord(records.value[0].session_id)
    } else {
      selectedDetail.value = null
      selectedSessionId.value = ''
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '加载系统记录失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadRecords()
})
</script>

<template>
  <div class="page-width role-page doctor-page">
    <section class="surface-card doctor-hero">
      <div>
        <p class="eyebrow">医生端</p>
        <h1>老人画像与报告总览</h1>
        <p>医生登录后可查看系统内全部老人记录，并按需打开结构化画像、对话摘要与最新报告。</p>
      </div>

      <div class="doctor-hero__metrics">
        <article class="metric-card">
          <span>总记录数</span>
          <strong>{{ summaryMetrics.total }}</strong>
        </article>
        <article class="metric-card">
          <span>已有画像</span>
          <strong>{{ summaryMetrics.withProfile }}</strong>
        </article>
        <article class="metric-card">
          <span>已有报告</span>
          <strong>{{ summaryMetrics.withReport }}</strong>
        </article>
      </div>
    </section>

    <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>

    <section class="doctor-layout">
      <article class="surface-card record-list-card">
        <header class="record-list-card__header">
          <div>
            <h2>系统记录</h2>
            <p>当前医生端以 `/api/sessions` 为真实数据来源。</p>
          </div>
          <button class="secondary-button" type="button" @click="loadRecords">刷新</button>
        </header>

        <input v-model="searchQuery" class="search-input" type="search" placeholder="按会话标题或 ID 搜索" />

        <div v-if="loading" class="loading-card">正在加载系统记录...</div>

        <div v-else-if="filteredRecords.length > 0" class="record-list scroll-panel">
          <button
            v-for="record in filteredRecords"
            :key="record.session_id"
            class="record-item"
            :class="{ 'is-active': selectedSessionId === record.session_id }"
            type="button"
            @click="selectRecord(record.session_id)"
          >
            <div class="record-item__top">
              <strong>{{ record.title || `记录 ${record.session_id.slice(0, 8)}` }}</strong>
              <span>{{ formatDateTime(record.created_at) }}</span>
            </div>
            <div class="record-item__meta">
              <span>{{ record.has_profile ? '已有画像' : '画像待形成' }}</span>
              <span>{{ record.has_report ? '已有报告' : '报告待返回' }}</span>
            </div>
          </button>
        </div>

        <EmptyStateCard
          v-else
          title="暂无系统记录"
          description="当前后端没有返回任何会话记录，因此医生端暂时无法展示老人画像和报告。"
        />
      </article>

      <aside class="doctor-detail">
        <section class="surface-card detail-card">
          <header class="detail-card__header">
            <div>
              <p class="eyebrow">当前选中</p>
              <h2>{{ selectedTitle }}</h2>
              <p v-if="selectedDetail" class="detail-card__meta">
                创建时间：{{ formatDateTime(selectedDetail.metadata.created_at) }}
              </p>
            </div>
          </header>

          <div v-if="detailLoading" class="loading-card">正在加载记录详情...</div>

          <template v-else-if="selectedDetail">
            <ProfileOverview :profile="selectedDetail.profile" title="患者画像" />
            <ReportSummary
              :reports="selectedDetail.reports"
              title="最新评估报告"
              empty-title="当前记录暂无报告"
              empty-description="医生端使用系统会话中的 `reports` 字段作为唯一报告来源；若为空，则保持只读空态。"
            />

            <section class="surface-card conversation-card">
              <header class="conversation-card__header">
                <h3>最近对话摘要</h3>
                <span>{{ latestConversation.length }} 条</span>
              </header>

              <div v-if="latestConversation.length > 0" class="conversation-list scroll-panel">
                <article
                  v-for="(message, index) in latestConversation"
                  :key="`${message.role}-${index}`"
                  class="conversation-item"
                >
                  <strong>{{ message.role === 'assistant' ? '助手' : '用户' }}</strong>
                  <p>{{ message.content }}</p>
                </article>
              </div>

              <EmptyStateCard
                v-else
                title="暂无对话摘要"
                description="该会话当前没有可展示的对话记录。"
              />
            </section>
          </template>

          <EmptyStateCard
            v-else
            title="尚未选中记录"
            description="请先从左侧列表选择一条老人记录。"
          />
        </section>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.doctor-page {
  display: grid;
  gap: 22px;
}

.doctor-hero {
  padding: 30px 32px;
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 22px;
}

.doctor-hero h1 {
  margin: 12px 0;
  color: var(--ink-strong);
  font-size: clamp(2.3rem, 3.8vw, 3.4rem);
}

.doctor-hero p {
  margin: 0;
  color: var(--ink-muted);
  line-height: 1.8;
}

.doctor-hero__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.metric-card {
  padding: 18px 20px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.metric-card span {
  display: block;
  color: var(--ink-muted);
  margin-bottom: 10px;
}

.metric-card strong {
  color: var(--ink-strong);
  font-size: 1.72rem;
}

.doctor-layout {
  display: grid;
  grid-template-columns: minmax(280px, 0.86fr) minmax(0, 1.14fr);
  gap: 20px;
}

.record-list-card,
.detail-card,
.conversation-card {
  padding: 22px;
}

.record-list-card__header,
.detail-card__header,
.conversation-card__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.record-list-card__header h2,
.detail-card__header h2,
.conversation-card__header h3 {
  margin: 0;
  color: var(--ink-strong);
}

.record-list-card__header p,
.detail-card__meta {
  margin: 8px 0 0;
  color: var(--ink-muted);
}

.search-input {
  width: 100%;
  min-height: 48px;
  border-radius: 16px;
  padding: 0 14px;
  margin: 16px 0;
}

.record-list {
  display: grid;
  gap: 12px;
  max-height: 55rem;
  overflow: auto;
  padding-right: 6px;
}

.record-item {
  width: 100%;
  padding: 16px 18px;
  border-radius: 18px;
  text-align: left;
  background: rgba(255, 255, 255, 0.74);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.record-item.is-active {
  border-color: rgba(72, 111, 166, 0.34);
  background: rgba(72, 111, 166, 0.08);
}

.record-item__top,
.record-item__meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.record-item__top strong {
  color: var(--ink-strong);
}

.record-item__top span,
.record-item__meta span {
  color: var(--ink-muted);
  font-size: 0.92rem;
}

.doctor-detail {
  display: grid;
}

.detail-card {
  display: grid;
  gap: 18px;
}

.conversation-list {
  display: grid;
  gap: 12px;
  max-height: 18rem;
  overflow: auto;
}

.conversation-item {
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.conversation-item strong {
  color: var(--ink-strong);
}

.conversation-item p {
  margin: 8px 0 0;
  color: var(--ink-muted);
  line-height: 1.7;
  max-height: 8rem;
  overflow: auto;
}

.loading-card {
  padding: 24px;
  color: var(--ink-muted);
}

@media (max-width: 1120px) {
  .doctor-hero,
  .doctor-hero__metrics,
  .doctor-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .doctor-hero {
    padding: 22px;
  }
}
</style>
