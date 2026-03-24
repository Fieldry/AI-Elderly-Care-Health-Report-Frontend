<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { getDoctorElderlyDetail, listDoctorElderly } from '@/api/doctor'
import EmptyStateCard from '@/components/EmptyStateCard.vue'
import { useAuthSession } from '@/session'
import type { DoctorElderlyDetail, DoctorElderlySummary } from '@/types'
import { formatProfileValue, getIdentityTitle } from '@/utils/profile'

const router = useRouter()
const { session } = useAuthSession()

const elderlyList = ref<DoctorElderlySummary[]>([])
const selectedElderlyId = ref('')
const selectedDetail = ref<DoctorElderlyDetail | null>(null)
const loading = ref(false)
const detailLoading = ref(false)
const errorMessage = ref('')
const searchQuery = ref('')

let detailRequestId = 0

const doctorToken = computed(() =>
  session.value?.role === 'doctor' ? session.value.token : ''
)
const filteredRecords = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  if (!keyword) {
    return elderlyList.value
  }

  return elderlyList.value.filter((record) => {
    const sourceText = [
      record.name,
      record.elderly_id,
      record.overview?.summary,
      record.overview?.chronic_summary,
      ...(record.overview?.risk_tags || [])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return sourceText.includes(keyword)
  })
})
const selectedSummary = computed(
  () => elderlyList.value.find((item) => item.elderly_id === selectedElderlyId.value) || null
)
const selectedOverview = computed(() => selectedDetail.value?.overview || null)
const selectedTitle = computed(() => {
  if (!selectedDetail.value) {
    return '请选择一位老人'
  }

  return getIdentityTitle(
    selectedDetail.value.profile || {},
    selectedDetail.value.name || `老人 ${selectedDetail.value.elderly_id.slice(0, 8)}`
  )
})
const selectedSummaryItems = computed(() => {
  const profile = selectedDetail.value?.profile || {}

  return [
    {
      label: '年龄',
      value: formatProfileValue(selectedOverview.value?.age ?? profile.age)
    },
    {
      label: '性别',
      value: formatProfileValue(selectedOverview.value?.sex ?? profile.sex)
    },
    {
      label: '居住地类型',
      value: formatProfileValue(selectedOverview.value?.residence ?? profile.residence)
    },
    {
      label: '居住安排',
      value: formatProfileValue(selectedOverview.value?.living_arrangement ?? profile.living_arrangement)
    },
    {
      label: '婚姻状况',
      value: formatProfileValue(selectedOverview.value?.marital_status ?? profile.marital_status)
    },
    {
      label: '上次评估',
      value: formatDateTime(
        selectedOverview.value?.last_assessment_at ||
          selectedSummary.value?.updated_at ||
          selectedSummary.value?.created_at ||
          ''
      )
    }
  ]
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
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatRiskLevel(value: string | undefined) {
  const normalizedValue = (value || '').trim().toLowerCase()
  const map: Record<string, string> = {
    high: '高风险',
    medium: '中风险',
    low: '低风险',
    unknown: '待评估'
  }

  return map[normalizedValue] || value || '待评估'
}

function formatManagementStatus(value: string | undefined) {
  const normalizedValue = (value || '').trim()
  const map: Record<string, string> = {
    normal: '常规管理',
    priority_follow_up: '重点随访'
  }

  return map[normalizedValue] || normalizedValue || '未设置'
}

async function selectElderly(elderlyId: string) {
  if (!doctorToken.value || !elderlyId) {
    return
  }

  selectedElderlyId.value = elderlyId
  detailLoading.value = true
  errorMessage.value = ''

  const requestId = ++detailRequestId

  try {
    const detail = await getDoctorElderlyDetail(elderlyId, doctorToken.value)
    if (requestId !== detailRequestId) {
      return
    }

    selectedDetail.value = detail
  } catch (error) {
    if (requestId !== detailRequestId) {
      return
    }

    selectedDetail.value = null
    errorMessage.value = error instanceof Error ? error.message : '加载老人基本信息失败，请稍后重试。'
  } finally {
    if (requestId === detailRequestId) {
      detailLoading.value = false
    }
  }
}

async function loadElderlyList() {
  if (!doctorToken.value) {
    errorMessage.value = '当前医生登录已失效，请重新进入医生端。'
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const records = (await listDoctorElderly(doctorToken.value)).sort((left, right) =>
      right.updated_at.localeCompare(left.updated_at)
    )
    elderlyList.value = records

    if (records.length === 0) {
      selectedElderlyId.value = ''
      selectedDetail.value = null
      detailLoading.value = false
      return
    }

    const nextElderlyId = records.some((item) => item.elderly_id === selectedElderlyId.value)
      ? selectedElderlyId.value
      : records[0].elderly_id

    await selectElderly(nextElderlyId)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载老人总览失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

function openDoctorDetail(elderlyId: string) {
  if (!elderlyId) {
    return
  }

  router.push(`/doctor/elderly/${elderlyId}`)
}

function openSelectedDoctorDetail() {
  openDoctorDetail(selectedElderlyId.value)
}

onMounted(async () => {
  await loadElderlyList()
})
</script>

<template>
  <div class="page-width role-page doctor-page">
    <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>

    <section class="doctor-layout">
      <article class="surface-card record-list-card">
        <header class="record-list-card__header">
          <div>
            <p class="eyebrow">医生端</p>
            <h1>老人总览</h1>
          </div>

          <div class="record-list-card__actions">
            <button class="secondary-button" type="button" @click="loadElderlyList">刷新列表</button>
          </div>
        </header>

        <input
          v-model="searchQuery"
          class="search-input"
          type="search"
          placeholder="按姓名、老人 ID、风险标签搜索"
        />

        <div v-if="loading" class="loading-card">正在加载老人总览...</div>

        <div v-else-if="filteredRecords.length > 0" class="record-list scroll-panel">
          <button
            v-for="record in filteredRecords"
            :key="record.elderly_id"
            class="record-item"
            :class="{ 'is-active': selectedElderlyId === record.elderly_id }"
            type="button"
            @click="selectElderly(record.elderly_id)"
          >
            <div class="record-item__top">
              <strong>{{ record.name }}</strong>
              <span>{{ formatDateTime(record.updated_at || record.created_at) }}</span>
            </div>

            <div class="record-item__meta">
              <span>{{ formatRiskLevel(record.overview?.current_risk_level) }}</span>
              <span>{{ formatManagementStatus(record.management.management_status) }}</span>
            </div>

            <p class="record-item__summary">
              {{ record.overview?.summary || record.overview?.chronic_summary || '暂无医生侧摘要。' }}
            </p>
          </button>
        </div>

        <EmptyStateCard
          v-else
          title="暂无老人数据"
          description="当前医生端还没有可展示的老人记录。"
        />
      </article>

      <aside class="doctor-summary">
        <div v-if="detailLoading" class="surface-card loading-card">正在加载老人基本信息...</div>

        <article
          v-else-if="selectedDetail"
          class="surface-card doctor-summary-card"
          role="button"
          tabindex="0"
          @click="openSelectedDoctorDetail"
          @keydown.enter.prevent="openSelectedDoctorDetail"
          @keydown.space.prevent="openSelectedDoctorDetail"
        >
          <header class="doctor-summary-card__header">
            <div>
              <p class="eyebrow">当前老人</p>
              <p class="doctor-summary-card__meta">
                更新时间：{{ formatDateTime(selectedDetail.updated_at || selectedDetail.created_at) }}
              </p>
            </div>

            <div class="summary-actions">
              <button class="primary-button" type="button" @click.stop="openSelectedDoctorDetail">
                查看详细信息
              </button>
            </div>
          </header>

          <div class="overview-grid">
            <article class="overview-card">
              <span>当前风险</span>
              <strong>{{ formatRiskLevel(selectedOverview?.current_risk_level) }}</strong>
            </article>
            <article class="overview-card">
              <span>管理状态</span>
              <strong>{{ formatManagementStatus(selectedDetail.management.management_status) }}</strong>
            </article>
          </div>

          <article class="overview-note">
            <strong>功能状态</strong>
            <p>{{ selectedOverview?.functional_status_text || '暂无' }}</p>
          </article>



        </article>

        <EmptyStateCard
          v-else
          class="surface-card empty-side-card"
          title="尚未选中老人"
          description="请先从左侧列表选择一位老人。"
        />
      </aside>
    </section>
  </div>
</template>

<style scoped>
.doctor-page {
  display: grid;
  gap: 18px;
}

.doctor-layout {
  display: grid;
  grid-template-columns: minmax(300px, 0.82fr) minmax(0, 1.18fr);
  gap: 20px;
  align-items: start;
}

.record-list-card,
.doctor-summary-card,
.loading-card,
.empty-side-card {
  padding: 22px;
}

.record-list-card__header,
.doctor-summary-card__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.record-list-card__header h1,
.doctor-summary-card h2,
.overview-card strong,
.summary-item strong,
.overview-note strong,
.record-item__top strong {
  color: var(--ink-strong);
}

.record-list-card__header h1 {
  margin: 10px 0 0;
  font-size: clamp(1.9rem, 2.8vw, 2.4rem);
  color: var(--ink-strong);
}

.record-list-card__header p,
.doctor-summary-card__meta,
.record-item__meta,
.record-item__summary,
.summary-item span,
.overview-note p,
.overview-card span,
.muted-text {
  color: var(--ink-muted);
}

.record-list-card__header p {
  margin: 10px 0 0;
  line-height: 1.7;
}

.doctor-summary-card__meta,
.record-item__summary,
.overview-note p {
  margin: 8px 0 0;
  line-height: 1.7;
}

.record-list-card__actions,
.summary-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.search-input {
  width: 100%;
  min-height: 48px;
  margin: 16px 0 0;
  border-radius: 16px;
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.94);
}

.record-list {
  margin-top: 16px;
  display: grid;
  gap: 12px;
  max-height: 65rem;
  overflow: auto;
  padding-right: 6px;
}

.record-item {
  width: 100%;
  padding: 16px 18px;
  border-radius: 20px;
  text-align: left;
  background: rgba(255, 255, 255, 0.76);
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
  align-items: flex-start;
}

.record-item__meta {
  margin-top: 10px;
  font-size: 0.92rem;
}

.doctor-summary-card {
  display: grid;
  gap: 18px;
  cursor: pointer;
}

.doctor-summary-card h2 {
  margin: 10px 0 0;
  font-size: clamp(1.8rem, 2.6vw, 2.3rem);
}

.overview-grid,
.summary-grid,
.overview-columns {
  display: grid;
  gap: 14px;
}

.overview-grid,
.summary-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.overview-card,
.summary-item,
.overview-note {
  padding: 18px 20px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.overview-card strong,
.summary-item strong {
  display: block;
  margin-top: 10px;
}

.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.chip {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(90, 142, 209, 0.12);
  color: var(--brand-strong);
  font-weight: 700;
}

.overview-columns h3 {
  margin: 0 0 10px;
  color: var(--ink-strong);
}

.plain-list {
  margin: 0;
  padding-left: 18px;
  color: var(--ink-muted);
  line-height: 1.8;
}

.error-banner {
  margin: 0;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(183, 75, 75, 0.08);
  color: var(--danger);
}

.loading-card {
  color: var(--ink-muted);
}

@media (max-width: 1080px) {
  .doctor-layout,
  .overview-columns {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .record-list-card,
  .doctor-summary-card,
  .loading-card,
  .empty-side-card {
    padding: 20px;
  }

  .record-list-card__header,
  .doctor-summary-card__header,
  .record-item__top,
  .record-item__meta {
    flex-direction: column;
    align-items: stretch;
  }

  .overview-grid,
  .summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
