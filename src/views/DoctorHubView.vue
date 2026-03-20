<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { getSessionDetail } from '@/api/chat'
import { ApiError } from '@/api/core'
import {
  createDoctorFollowup,
  getDoctorElderlyDetail,
  listDoctorElderly,
  updateDoctorManagement
} from '@/api/doctor'
import { exportReportPdf, getReportDetail } from '@/api/report'
import EmptyStateCard from '@/components/EmptyStateCard.vue'
import ProfileOverview from '@/components/ProfileOverview.vue'
import ReportSummary from '@/components/ReportSummary.vue'
import { useAuthSession } from '@/session'
import type { ChatMessage, DoctorElderlyDetail, DoctorElderlySummary } from '@/types'
import { getIdentityTitle } from '@/utils/profile'
import { getReportGeneratedAt, getReportId, normalizeReportRecord } from '@/utils/report'

const managementStatusOptions = [
  { value: 'normal', label: '常规管理' },
  { value: 'priority_follow_up', label: '重点随访' }
]

const visitTypeOptions = ['电话', '门诊', '上门'] as const

const { session } = useAuthSession()

const elderlyList = ref<DoctorElderlySummary[]>([])
const selectedElderlyId = ref('')
const selectedDetail = ref<DoctorElderlyDetail | null>(null)
const latestConversation = ref<ChatMessage[]>([])
const loading = ref(false)
const detailLoading = ref(false)
const managementSaving = ref(false)
const followupSaving = ref(false)
const reportDetailLoading = ref(false)
const downloadingReportId = ref('')
const errorMessage = ref('')
const successMessage = ref('')
const searchQuery = ref('')
const selectedReportId = ref('')
const selectedReportDetail = ref<Record<string, unknown> | null>(null)

const managementForm = reactive({
  isKeyCase: false,
  managementStatus: 'normal',
  contactedFamily: false,
  arrangedRevisit: false,
  referred: false,
  nextFollowupAt: ''
})

const followupForm = reactive({
  visitType: '电话' as (typeof visitTypeOptions)[number],
  findings: '',
  recommendationsText: '',
  contactedFamily: false,
  arrangedRevisit: false,
  referred: false,
  nextFollowupAt: '',
  notes: ''
})

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

const summaryMetrics = computed(() => ({
  total: elderlyList.value.length,
  withProfile: elderlyList.value.filter((item) => item.has_profile).length,
  withReport: elderlyList.value.filter((item) => item.has_report).length,
  keyCases: elderlyList.value.filter((item) => item.management.is_key_case).length
}))

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

const sortedReports = computed(() =>
  [...(selectedDetail.value?.reports || [])].sort((left, right) =>
    getReportGeneratedAt(right).localeCompare(getReportGeneratedAt(left))
  )
)

const activeReport = computed(() => {
  if (!selectedReportId.value || !selectedDetail.value) {
    return null
  }

  return selectedDetail.value.reports.find((report) => getReportId(report) === selectedReportId.value) || null
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

function formatDateTimeLocalInput(value: string | null | undefined) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 16)
  }

  const pad = (input: number) => String(input).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
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
  const matchedOption = managementStatusOptions.find((option) => option.value === value)
  return matchedOption?.label || value || '未设置'
}

function parseRecommendations(rawValue: string) {
  return rawValue
    .split(/\n|[;；]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function getDoctorErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback
  }

  if (error.message.includes('The string did not match the expected pattern.')) {
    return fallback
  }

  return error.message || fallback
}

function resetFollowupForm() {
  followupForm.visitType = '电话'
  followupForm.findings = ''
  followupForm.recommendationsText = ''
  followupForm.contactedFamily = false
  followupForm.arrangedRevisit = false
  followupForm.referred = false
  followupForm.nextFollowupAt = ''
  followupForm.notes = ''
}

function applyManagementForm(detail: DoctorElderlyDetail) {
  managementForm.isKeyCase = detail.management.is_key_case
  managementForm.managementStatus = detail.management.management_status || 'normal'
  managementForm.contactedFamily = detail.management.contacted_family
  managementForm.arrangedRevisit = detail.management.arranged_revisit
  managementForm.referred = detail.management.referred
  managementForm.nextFollowupAt = formatDateTimeLocalInput(detail.management.next_followup_at)
}

async function loadLatestConversation(sessionId: string) {
  if (!doctorToken.value || !sessionId) {
    latestConversation.value = []
    return
  }

  try {
    const sessionDetail = await getSessionDetail(sessionId, doctorToken.value)
    latestConversation.value = (sessionDetail.conversation || []).slice(-6)
  } catch {
    latestConversation.value = []
  }
}

async function openReportDetail(reportId: string) {
  if (!doctorToken.value || !reportId) {
    return
  }

  selectedReportId.value = reportId
  reportDetailLoading.value = true
  errorMessage.value = ''

  try {
    selectedReportDetail.value = await getReportDetail(reportId, doctorToken.value)
  } catch (error) {
    errorMessage.value = getDoctorErrorMessage(error, '加载报告详情失败，请稍后重试。')
  } finally {
    reportDetailLoading.value = false
  }
}

async function selectElderly(elderlyId: string) {
  if (!doctorToken.value || !elderlyId) {
    return
  }

  selectedElderlyId.value = elderlyId
  detailLoading.value = true
  errorMessage.value = ''

  try {
    const detail = await getDoctorElderlyDetail(elderlyId, doctorToken.value)
    selectedDetail.value = detail
    applyManagementForm(detail)

    if (
      selectedReportId.value &&
      !detail.reports.some((report) => getReportId(report) === selectedReportId.value)
    ) {
      selectedReportId.value = ''
      selectedReportDetail.value = null
    }

    await loadLatestConversation(detail.sessions[0]?.session_id || '')
  } catch (error) {
    errorMessage.value = getDoctorErrorMessage(error, '加载老人详情失败，请稍后重试。')
    selectedDetail.value = null
    latestConversation.value = []
  } finally {
    detailLoading.value = false
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
    elderlyList.value = (await listDoctorElderly(doctorToken.value)).sort((left, right) =>
      right.updated_at.localeCompare(left.updated_at)
    )

    if (elderlyList.value.length === 0) {
      selectedElderlyId.value = ''
      selectedDetail.value = null
      latestConversation.value = []
      selectedReportId.value = ''
      selectedReportDetail.value = null
      return
    }

    const nextElderlyId = elderlyList.value.some((item) => item.elderly_id === selectedElderlyId.value)
      ? selectedElderlyId.value
      : elderlyList.value[0].elderly_id

    await selectElderly(nextElderlyId)
  } catch (error) {
    errorMessage.value = getDoctorErrorMessage(error, '加载老人总览失败，请稍后重试。')
  } finally {
    loading.value = false
  }
}

async function saveManagement() {
  if (!doctorToken.value || !selectedElderlyId.value) {
    errorMessage.value = '当前医生登录已失效，请重新进入医生端。'
    return
  }

  managementSaving.value = true
  errorMessage.value = ''

  try {
    await updateDoctorManagement(selectedElderlyId.value, doctorToken.value, {
      isKeyCase: managementForm.isKeyCase,
      managementStatus: managementForm.managementStatus,
      contactedFamily: managementForm.contactedFamily,
      arrangedRevisit: managementForm.arrangedRevisit,
      referred: managementForm.referred,
      nextFollowupAt: managementForm.nextFollowupAt || undefined
    })

    successMessage.value = '管理状态已更新。'
    await loadElderlyList()
  } catch (error) {
    errorMessage.value = getDoctorErrorMessage(error, '更新管理状态失败，请稍后重试。')
  } finally {
    managementSaving.value = false
  }
}

async function submitFollowup() {
  if (!doctorToken.value || !selectedElderlyId.value) {
    errorMessage.value = '当前医生登录已失效，请重新进入医生端。'
    return
  }

  if (!followupForm.findings.trim()) {
    errorMessage.value = '请先填写本次发现。'
    return
  }

  followupSaving.value = true
  errorMessage.value = ''

  try {
    await createDoctorFollowup(selectedElderlyId.value, doctorToken.value, {
      visitType: followupForm.visitType,
      findings: followupForm.findings.trim(),
      recommendations: parseRecommendations(followupForm.recommendationsText),
      contactedFamily: followupForm.contactedFamily,
      arrangedRevisit: followupForm.arrangedRevisit,
      referred: followupForm.referred,
      nextFollowupAt: followupForm.nextFollowupAt || undefined,
      notes: followupForm.notes.trim()
    })

    resetFollowupForm()
    successMessage.value = '随访记录已保存。'
    await loadElderlyList()
  } catch (error) {
    errorMessage.value = getDoctorErrorMessage(error, '保存随访记录失败，请稍后重试。')
  } finally {
    followupSaving.value = false
  }
}

async function handleDownloadReport(reportId: string) {
  if (!doctorToken.value || !reportId) {
    return
  }

  downloadingReportId.value = reportId
  errorMessage.value = ''

  try {
    const blob = await exportReportPdf(reportId, doctorToken.value)
    const downloadUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = downloadUrl
    anchor.download = `${reportId}.pdf`
    anchor.click()
    URL.revokeObjectURL(downloadUrl)
  } catch (error) {
    if (error instanceof ApiError && error.status === 501) {
      errorMessage.value = '后端尚未实现 PDF 导出，目前仅支持在线查看报告。'
    } else {
      errorMessage.value = getDoctorErrorMessage(error, '导出 PDF 失败，请稍后重试。')
    }
  } finally {
    downloadingReportId.value = ''
  }
}

onMounted(async () => {
  await loadElderlyList()
})
</script>

<template>
  <div class="page-width role-page doctor-page">
    <section class="surface-card doctor-hero">
      <div>
        <p class="eyebrow">医生端</p>
        <h1>老人总览与随访管理</h1>
      </div>

      <div class="doctor-hero__metrics">
        <article class="metric-card">
          <span>老人总数</span>
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
        <article class="metric-card">
          <span>重点个案</span>
          <strong>{{ summaryMetrics.keyCases }}</strong>
        </article>
      </div>
    </section>

    <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>
    <p v-if="successMessage" class="success-banner">{{ successMessage }}</p>

    <section class="doctor-layout">
      <article class="surface-card record-list-card">
        <header class="record-list-card__header">
          <div>
            <h2>老人总览</h2>
            <p>按老人维度查看医生可访问的全部画像、报告和管理状态。</p>
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

      <aside class="doctor-detail">
        <div v-if="detailLoading" class="surface-card loading-card">正在加载老人详情...</div>

        <template v-else-if="selectedDetail">
          <section class="surface-card detail-card">
            <header class="detail-card__header">
              <div>
                <p class="eyebrow">当前老人</p>
                <h2>{{ selectedTitle }}</h2>
                <p class="detail-card__meta">
                  更新时间：{{ formatDateTime(selectedDetail.updated_at || selectedDetail.created_at) }}
                </p>
              </div>
            </header>

            <div class="overview-grid">
              <article class="overview-card">
                <span>当前风险</span>
                <strong>{{ formatRiskLevel(selectedOverview?.current_risk_level) }}</strong>
              </article>
              <article class="overview-card">
                <span>功能状态</span>
                <strong>{{ selectedOverview?.functional_status_text || '暂无' }}</strong>
              </article>
              <article class="overview-card">
                <span>慢病摘要</span>
                <strong>{{ selectedOverview?.chronic_summary || '暂无' }}</strong>
              </article>
              <article class="overview-card">
                <span>管理状态</span>
                <strong>{{ formatManagementStatus(selectedDetail.management.management_status) }}</strong>
              </article>
            </div>

            <article class="overview-note">
              <strong>医生派生摘要</strong>
              <p>{{ selectedOverview?.summary || '暂无最新报告总结。' }}</p>
            </article>

            <div v-if="(selectedOverview?.risk_tags || []).length > 0" class="chip-list">
              <span v-for="tag in selectedOverview?.risk_tags" :key="tag" class="chip">{{ tag }}</span>
            </div>

            <div class="overview-columns">
              <section>
                <h3>主要问题</h3>
                <ul v-if="(selectedOverview?.main_problems || []).length > 0" class="plain-list">
                  <li v-for="item in selectedOverview?.main_problems" :key="item">{{ item }}</li>
                </ul>
                <p v-else class="muted-text">暂无主要问题摘要。</p>
              </section>

              <section>
                <h3>建议动作</h3>
                <ul v-if="(selectedOverview?.recommended_actions || []).length > 0" class="plain-list">
                  <li v-for="item in selectedOverview?.recommended_actions" :key="item">{{ item }}</li>
                </ul>
                <p v-else class="muted-text">暂无建议动作。</p>
              </section>
            </div>
          </section>

          <ProfileOverview :profile="selectedDetail.profile" title="患者画像" />

          <ReportSummary
            :reports="selectedDetail.reports"
            title="最新评估报告"
            empty-title="当前老人暂无报告"
            empty-description="医生端可读取全部报告，但仍保持只读。"
          />

          <section class="surface-card report-list-card">
            <header class="section-header">
              <div>
                <h3>报告列表</h3>
                <p>通过共享报告接口查看详情和导出状态。</p>
              </div>
              <span>{{ sortedReports.length }} 份</span>
            </header>

            <div v-if="sortedReports.length > 0" class="panel-list scroll-panel">
              <article
                v-for="report in sortedReports"
                :key="getReportId(report) || JSON.stringify(report)"
                class="panel-item"
              >
                <div>
                  <strong>{{ getReportId(report) || '未命名报告' }}</strong>
                  <p>{{ formatDateTime(getReportGeneratedAt(report)) }}</p>
                </div>
                <div class="panel-actions">
                  <button class="secondary-button" type="button" @click="openReportDetail(getReportId(report))">
                    查看详情
                  </button>
                  <button
                    class="ghost-button"
                    type="button"
                    :disabled="downloadingReportId === getReportId(report)"
                    @click="handleDownloadReport(getReportId(report))"
                  >
                    {{ downloadingReportId === getReportId(report) ? '导出中...' : '导出 PDF' }}
                  </button>
                </div>
              </article>
            </div>

            <EmptyStateCard
              v-else
              title="暂无报告记录"
              description="当前老人还没有已生成的报告。"
            />
          </section>

          <section v-if="selectedReportId" class="surface-card report-detail-card">
            <header class="section-header">
              <div>
                <h3>报告详情</h3>
                <p>读取 `/report/{report_id}` 的标准化内容。</p>
              </div>
              <span>{{ reportDetailLoading ? '加载中' : selectedReportId }}</span>
            </header>

            <div v-if="reportDetailLoading" class="loading-card">正在加载报告详情...</div>
            <ReportSummary
              v-else
              :reports="[normalizeReportRecord(selectedReportDetail || activeReport || {}) || {}]"
              title="当前报告"
              empty-title="报告详情为空"
              empty-description="当前报告没有返回可展示的结构化内容。"
            />
          </section>

          <section class="surface-card session-card">
            <header class="section-header">
              <div>
                <h3>工作区会话</h3>
                <p>展示该老人全部工作区元数据。</p>
              </div>
              <span>{{ selectedDetail.sessions.length }} 条</span>
            </header>

            <div v-if="selectedDetail.sessions.length > 0" class="panel-list scroll-panel">
              <article
                v-for="sessionItem in selectedDetail.sessions"
                :key="sessionItem.session_id"
                class="panel-item"
              >
                <div>
                  <strong>{{ sessionItem.title || `会话 ${sessionItem.session_id.slice(0, 8)}` }}</strong>
                  <p>{{ formatDateTime(sessionItem.created_at) }}</p>
                </div>
                <div class="session-flags">
                  <span>{{ sessionItem.has_profile ? '已有画像' : '画像待补齐' }}</span>
                  <span>{{ sessionItem.has_report ? '已有报告' : '暂无报告' }}</span>
                </div>
              </article>
            </div>

            <EmptyStateCard
              v-else
              title="暂无工作区会话"
              description="当前老人尚未形成可读取的工作区会话。"
            />
          </section>

          <section class="surface-card conversation-card">
            <header class="section-header">
              <div>
                <h3>最近对话摘要</h3>
                <p>基于最新工作区会话读取最后 6 条对话。</p>
              </div>
              <span>{{ latestConversation.length }} 条</span>
            </header>

            <div v-if="latestConversation.length > 0" class="panel-list scroll-panel">
              <article
                v-for="(message, index) in latestConversation"
                :key="`${message.role}-${index}`"
                class="panel-item conversation-item"
              >
                <strong>{{ message.role === 'assistant' ? '助手' : '用户' }}</strong>
                <p>{{ message.content }}</p>
              </article>
            </div>

            <EmptyStateCard
              v-else
              title="暂无可读对话"
              description="当前最新工作区没有可展示的对话内容。"
            />
          </section>

          <section class="surface-card management-card">
            <header class="section-header">
              <div>
                <h3>医生管理状态</h3>
                <p>这部分仅写入医生侧管理表，不会改写老人画像。</p>
              </div>
            </header>

            <form class="form-grid" @submit.prevent="saveManagement">
              <label class="field field--checkbox">
                <input v-model="managementForm.isKeyCase" type="checkbox" />
                <span>标记为重点个案</span>
              </label>

              <label class="field">
                <span>管理状态</span>
                <select v-model="managementForm.managementStatus">
                  <option v-for="option in managementStatusOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </label>

              <label class="field field--checkbox">
                <input v-model="managementForm.contactedFamily" type="checkbox" />
                <span>已联系家属</span>
              </label>

              <label class="field field--checkbox">
                <input v-model="managementForm.arrangedRevisit" type="checkbox" />
                <span>已安排复诊/复评</span>
              </label>

              <label class="field field--checkbox">
                <input v-model="managementForm.referred" type="checkbox" />
                <span>已转诊</span>
              </label>

              <label class="field">
                <span>下次随访时间</span>
                <input v-model="managementForm.nextFollowupAt" type="datetime-local" />
              </label>

              <button class="primary-button form-submit" type="submit" :disabled="managementSaving">
                {{ managementSaving ? '保存中...' : '保存管理状态' }}
              </button>
            </form>
          </section>

          <section class="surface-card followup-card">
            <header class="section-header">
              <div>
                <h3>医生随访</h3>
                <p>保存电话、门诊或上门随访记录，并同步刷新最近随访信息。</p>
              </div>
            </header>

            <div v-if="selectedDetail.followups.length > 0" class="panel-list scroll-panel">
              <article
                v-for="followup in selectedDetail.followups"
                :key="followup.followup_id"
                class="panel-item"
              >
                <div class="followup-item__top">
                  <strong>{{ followup.visit_type }}</strong>
                  <span>{{ formatDateTime(followup.created_at) }}</span>
                </div>
                <p>{{ followup.findings }}</p>
                <ul v-if="followup.recommendations.length > 0" class="plain-list">
                  <li v-for="item in followup.recommendations" :key="item">{{ item }}</li>
                </ul>
              </article>
            </div>

            <EmptyStateCard
              v-else
              title="暂无随访记录"
              description="当前老人还没有医生随访记录。"
            />

            <form class="form-grid followup-form" @submit.prevent="submitFollowup">
              <label class="field">
                <span>随访方式</span>
                <select v-model="followupForm.visitType">
                  <option v-for="option in visitTypeOptions" :key="option" :value="option">{{ option }}</option>
                </select>
              </label>

              <label class="field field--full">
                <span>本次发现</span>
                <textarea
                  v-model="followupForm.findings"
                  rows="4"
                  placeholder="例如：近一周夜间起身增多，家属反馈步态较前变慢。"
                />
              </label>

              <label class="field field--full">
                <span>建议措施</span>
                <textarea
                  v-model="followupForm.recommendationsText"
                  rows="3"
                  placeholder="每行一条建议，例如：两周内复评步态"
                />
              </label>

              <label class="field field--checkbox">
                <input v-model="followupForm.contactedFamily" type="checkbox" />
                <span>本次已联系家属</span>
              </label>

              <label class="field field--checkbox">
                <input v-model="followupForm.arrangedRevisit" type="checkbox" />
                <span>已安排复诊/复评</span>
              </label>

              <label class="field field--checkbox">
                <input v-model="followupForm.referred" type="checkbox" />
                <span>已转诊</span>
              </label>

              <label class="field">
                <span>下次随访时间</span>
                <input v-model="followupForm.nextFollowupAt" type="datetime-local" />
              </label>

              <label class="field field--full">
                <span>补充备注</span>
                <textarea
                  v-model="followupForm.notes"
                  rows="3"
                  placeholder="例如：建议继续观察夜间如厕风险。"
                />
              </label>

              <button class="primary-button form-submit" type="submit" :disabled="followupSaving">
                {{ followupSaving ? '保存中...' : '保存随访记录' }}
              </button>
            </form>
          </section>
        </template>

        <EmptyStateCard
          v-else
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
  gap: 22px;
}

.doctor-hero {
  padding: 30px 32px;
  display: grid;
  grid-template-columns: 1.1fr 1fr;
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

.doctor-hero__metrics,
.overview-grid,
.overview-columns {
  display: grid;
  gap: 14px;
}

.doctor-hero__metrics {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.metric-card,
.overview-card,
.overview-note,
.panel-item {
  padding: 18px 20px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.metric-card span,
.overview-card span,
.section-header p,
.detail-card__meta,
.panel-item p,
.muted-text {
  color: var(--ink-muted);
}

.metric-card strong,
.overview-card strong,
.detail-card h2,
.section-header h3 {
  color: var(--ink-strong);
}

.metric-card strong,
.overview-card strong {
  display: block;
  margin-top: 10px;
  font-size: 1.4rem;
}

.doctor-layout {
  display: grid;
  grid-template-columns: minmax(300px, 0.82fr) minmax(0, 1.18fr);
  gap: 20px;
  align-items: start;
}

.record-list-card,
.detail-card,
.report-list-card,
.report-detail-card,
.session-card,
.conversation-card,
.management-card,
.followup-card,
.loading-card {
  padding: 22px;
}

.record-list-card__header,
.section-header,
.detail-card__header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
}

.record-list-card__header h2,
.detail-card h2,
.section-header h3 {
  margin: 0;
}

.record-list-card__header p,
.section-header p,
.detail-card__meta {
  margin: 8px 0 0;
  line-height: 1.7;
}

.search-input,
.field input,
.field select,
.field textarea {
  width: 100%;
  min-height: 48px;
  border-radius: 16px;
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.94);
}

.search-input {
  margin: 16px 0;
}

.field textarea {
  min-height: 120px;
  padding-top: 14px;
  resize: vertical;
}

.record-list,
.panel-list {
  display: grid;
  gap: 12px;
}

.record-list {
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
.record-item__meta,
.panel-actions,
.followup-item__top,
.session-flags {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}

.record-item__meta,
.session-flags {
  margin-top: 10px;
  color: var(--ink-muted);
  font-size: 0.92rem;
}

.record-item__summary {
  margin: 10px 0 0;
  line-height: 1.7;
}

.doctor-detail {
  display: grid;
  gap: 18px;
}

.overview-grid {
  margin-top: 18px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.overview-note {
  margin-top: 16px;
}

.overview-note strong {
  color: var(--ink-strong);
}

.overview-note p {
  margin: 10px 0 0;
  line-height: 1.8;
}

.overview-columns {
  margin-top: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.overview-columns h3 {
  margin: 0 0 10px;
  color: var(--ink-strong);
}

.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.chip {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(90, 142, 209, 0.12);
  color: var(--brand-strong);
  font-weight: 700;
}

.plain-list {
  margin: 0;
  padding-left: 18px;
  color: var(--ink-muted);
  line-height: 1.8;
}

.panel-list {
  max-height: 24rem;
  overflow: auto;
  padding-right: 6px;
}

.conversation-item p,
.panel-item p {
  margin: 8px 0 0;
  line-height: 1.7;
}

.form-grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.followup-form {
  margin-top: 18px;
}

.field {
  display: grid;
  gap: 8px;
}

.field span {
  color: var(--ink-strong);
  font-weight: 600;
}

.field--checkbox {
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.field--checkbox input {
  width: 18px;
  height: 18px;
  margin: 0;
}

.field--checkbox span {
  font-weight: 500;
}

.field--full,
.form-submit {
  grid-column: 1 / -1;
}

.error-banner,
.success-banner {
  margin: 0;
  padding: 14px 16px;
  border-radius: 16px;
}

.error-banner {
  background: rgba(183, 75, 75, 0.08);
  color: var(--danger);
}

.success-banner {
  background: rgba(59, 174, 106, 0.1);
  color: #28724f;
}

.loading-card {
  color: var(--ink-muted);
}

@media (max-width: 1180px) {
  .doctor-layout,
  .doctor-hero,
  .overview-columns {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .doctor-hero,
  .record-list-card,
  .detail-card,
  .report-list-card,
  .report-detail-card,
  .session-card,
  .conversation-card,
  .management-card,
  .followup-card {
    padding: 20px;
  }

  .doctor-hero__metrics,
  .overview-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .record-item__top,
  .record-item__meta,
  .panel-actions,
  .followup-item__top,
  .session-flags,
  .record-list-card__header,
  .section-header,
  .detail-card__header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
