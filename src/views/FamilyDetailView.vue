<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { ApiError } from '@/api/core'
import { bindFamilyElderly } from '@/api/auth'
import {
  getFamilyElderly,
  getFamilyReports,
  listFamilyElderly,
  unbindFamilyElderly,
  updateFamilyElderly
} from '@/api/family'
import { exportReportPdf, generateReportForElderly, getReportDetail } from '@/api/report'
import EmptyStateCard from '@/components/EmptyStateCard.vue'
import ReportDetailModal from '@/components/ReportDetailModal.vue'
import iconLinkedElderly from '@/assets/lanhu/icon-linked-elderly.png'
import iconProfileEdit from '@/assets/lanhu/icon-profile-edit.png'
import {
  clearStoredFamilyConversationSessionId,
  updateStoredFamilyElderlyIds,
  useAuthSession
} from '@/session'
import {
  cloneProfileForForm,
  getIdentityTitle,
  PROFILE_FIELDS,
  PROFILE_GROUPS,
  serializeProfilePayload
} from '@/utils/profile'
import {
  getReportGeneratedAt,
  getReportId,
  getReportRecommendationPreview,
  getSequentialReportName
} from '@/utils/report'

const props = defineProps<{
  elderlyId: string
}>()

const router = useRouter()
const { session } = useAuthSession()

const elderlyList = ref<Array<{ elderly_id: string; name?: string; relation?: string; created_at?: string; completion_rate?: number }>>([])
const cardDrafts = reactive<Record<string, { name: string; relation: string }>>({})
const cardSaving = reactive<Record<string, boolean>>({})
const loading = ref(false)
const loadingList = ref(false)
const saving = ref(false)
const reportsLoading = ref(false)
const generatingReport = ref(false)
const reportDetailLoading = ref(false)
const downloadingReportId = ref('')
const binding = ref(false)
const unbindingElderlyId = ref('')
const showBindForm = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const familyReports = ref<Array<Record<string, unknown>>>([])
const selectedReportId = ref('')
const selectedReportDetail = ref<Record<string, unknown> | null>(null)
const bindForm = reactive({
  elderlyId: '',
  relation: '子女'
})
const profileForm = reactive<Record<string, unknown>>({})

const groupedFields = PROFILE_GROUPS.map((group) => ({
  group,
  fields: PROFILE_FIELDS.filter((field) => field.group === group)
}))

const displayTitle = computed(() =>
  getIdentityTitle(profileForm, `老人档案 ${props.elderlyId.slice(0, 8)}`)
)
const selectedSummary = computed(
  () => elderlyList.value.find((item) => item.elderly_id === props.elderlyId) || null
)
const selectedCompletionPercent = computed(() =>
  Math.round((selectedSummary.value?.completion_rate ?? 0) * 100)
)
const sortedReports = computed(() =>
  [...familyReports.value].sort((left, right) =>
    getReportGeneratedAt(right).localeCompare(getReportGeneratedAt(left))
  )
)
const reportCards = computed(() =>
  sortedReports.value.map((report, index) => ({
    report,
    reportId: getReportId(report),
    reportTitle: getSequentialReportName(index + 1),
    generatedAt: getReportGeneratedAt(report),
    recommendations: getReportRecommendationPreview(report, 3)
  }))
)
const activeReport = computed(() => {
  if (!selectedReportId.value) {
    return null
  }

  return familyReports.value.find((report) => getReportId(report) === selectedReportId.value) || null
})
const selectedReportTitle = computed(() => {
  if (!selectedReportId.value) {
    return '历史报告'
  }

  const reportIndex = sortedReports.value.findIndex((report) => getReportId(report) === selectedReportId.value)
  return getSequentialReportName(reportIndex + 1)
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

function resetMessages() {
  errorMessage.value = ''
  successMessage.value = ''
}

function syncCardDrafts(records: Array<{ elderly_id: string; name?: string; relation?: string }>) {
  for (const elderly of records) {
    cardDrafts[elderly.elderly_id] = {
      name: elderly.name || '',
      relation: elderly.relation || ''
    }
  }
}

function applyCardPatch(elderlyId: string, patch: { name?: string; relation?: string }) {
  const summary = elderlyList.value.find((item) => item.elderly_id === elderlyId)
  if (summary) {
    if (patch.name !== undefined) {
      summary.name = patch.name || summary.name
    }
    if (patch.relation !== undefined) {
      summary.relation = patch.relation || summary.relation
    }
  }

  if (props.elderlyId === elderlyId && profileForm) {
    if (patch.name !== undefined) {
      profileForm.name = patch.name || profileForm.name
    }
  }
}

async function saveCardDraft(elderlyId: string) {
  if (!session.value?.token || session.value.role !== 'family') {
    errorMessage.value = '当前登录已失效，请重新进入家属端。'
    return
  }

  const draft = cardDrafts[elderlyId]
  if (!draft) {
    return
  }

  const payload: Record<string, unknown> = {}
  const nextName = draft.name.trim()
  const nextRelation = draft.relation.trim()
  const currentSummary = elderlyList.value.find((item) => item.elderly_id === elderlyId)

  if (nextName && nextName !== (currentSummary?.name || '')) {
    payload.name = nextName
  }
  if (nextRelation && nextRelation !== (currentSummary?.relation || '')) {
    payload.relation = nextRelation
  }

  if (Object.keys(payload).length === 0) {
    return
  }

  cardSaving[elderlyId] = true
  resetMessages()

  try {
    await updateFamilyElderly(elderlyId, session.value.token, payload)
    applyCardPatch(elderlyId, {
      name: nextName,
      relation: nextRelation
    })
    successMessage.value = '老人备注与关系已更新。'
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '保存老人信息失败，请稍后重试。'
  } finally {
    cardSaving[elderlyId] = false
  }
}

function closeReportModal() {
  selectedReportId.value = ''
  selectedReportDetail.value = null
}

function formatDate(value: string) {
  if (!value) {
    return '--'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString('zh-CN')
}

function applyProfileForm(profile: Record<string, unknown> | null | undefined) {
  const clonedProfile = cloneProfileForForm(profile || {})

  for (const key of Object.keys(profileForm)) {
    delete profileForm[key]
  }

  Object.assign(profileForm, clonedProfile)
}

async function loadProfileDetail() {
  if (!session.value?.token || session.value.role !== 'family') {
    errorMessage.value = '当前登录已失效，请重新进入家属端。'
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const detail = await getFamilyElderly(props.elderlyId, session.value.token)
    applyProfileForm(detail.profile)
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '加载老人画像失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

async function loadFamilyElderly() {
  if (!session.value?.token || session.value.role !== 'family') {
    return
  }

  loadingList.value = true

  try {
    elderlyList.value = await listFamilyElderly(session.value.token)
    syncCardDrafts(elderlyList.value)
  } catch {
    elderlyList.value = []
  } finally {
    loadingList.value = false
  }
}

async function loadReports() {
  if (!session.value?.token || session.value.role !== 'family') {
    return
  }

  reportsLoading.value = true

  try {
    familyReports.value = await getFamilyReports(props.elderlyId, session.value.token)

    if (
      selectedReportId.value &&
      !familyReports.value.some((report) => getReportId(report) === selectedReportId.value)
    ) {
      selectedReportId.value = ''
      selectedReportDetail.value = null
    }
  } catch {
    familyReports.value = []
  } finally {
    reportsLoading.value = false
  }
}

async function handleBindElderly() {
  if (!session.value?.token || session.value.role !== 'family') {
    errorMessage.value = '当前登录已失效，请重新进入家属端。'
    return
  }

  if (!bindForm.elderlyId.trim()) {
    errorMessage.value = '请输入要绑定的老人绑定码。'
    return
  }

  if (!bindForm.relation.trim()) {
    errorMessage.value = '请输入与老人的关系。'
    return
  }

  binding.value = true
  resetMessages()

  try {
    const targetElderlyId = bindForm.elderlyId.trim()
    const response = await bindFamilyElderly(session.value.token, {
      elderlyId: targetElderlyId,
      relation: bindForm.relation.trim()
    })

    const mergedElderlyIds = response.elderly_ids || session.value.elderlyIds
    updateStoredFamilyElderlyIds(mergedElderlyIds)
    bindForm.elderlyId = ''
    bindForm.relation = '子女'
    showBindForm.value = false
    successMessage.value = '老人绑定成功，列表已刷新。'
    await loadFamilyElderly()
    await loadProfileDetail()
    await loadReports()
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '绑定老人失败，请稍后重试。'
  } finally {
    binding.value = false
  }
}

async function handleUnbindElderly(elderlyId: string) {
  if (!session.value?.token || session.value.role !== 'family') {
    errorMessage.value = '当前登录已失效，请重新进入家属端。'
    return
  }

  const target = elderlyList.value.find((item) => item.elderly_id === elderlyId)
  const targetName = target?.name || '该老人'
  if (!window.confirm(`确定要解除与“${targetName}”的绑定吗？解除后该老人将不再显示在家属端列表中。`)) {
    return
  }

  unbindingElderlyId.value = elderlyId
  resetMessages()

  try {
    const response = await unbindFamilyElderly(elderlyId, session.value.token)
    const remainingIds = response.elderly_ids || session.value.elderlyIds.filter((item) => item !== elderlyId)
    updateStoredFamilyElderlyIds(remainingIds)
    clearStoredFamilyConversationSessionId(elderlyId)

    elderlyList.value = elderlyList.value.filter((item) => item.elderly_id !== elderlyId)
    delete cardDrafts[elderlyId]
    successMessage.value = '已解除绑定。'

    if (props.elderlyId === elderlyId) {
      closeReportModal()
      if (remainingIds.length > 0) {
        await router.push(`/family/elderly/${remainingIds[0]}`)
      } else {
        await router.push('/family/hub')
      }
      return
    }

    await loadFamilyElderly()
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '解除绑定失败，请稍后重试。'
  } finally {
    unbindingElderlyId.value = ''
  }
}

function openElderlyDetail(elderlyId: string) {
  if (!elderlyId) {
    return
  }

  router.push(`/family/elderly/${elderlyId}`)
}

async function openReportDetail(reportId: string) {
  if (!session.value?.token || session.value.role !== 'family' || !reportId) {
    return
  }

  selectedReportId.value = reportId
  reportDetailLoading.value = true
  errorMessage.value = ''

  try {
    selectedReportDetail.value = await getReportDetail(reportId, session.value.token)
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '加载报告详情失败，请稍后重试。'
  } finally {
    reportDetailLoading.value = false
  }
}

async function saveProfile() {
  if (!session.value?.token || session.value.role !== 'family') {
    errorMessage.value = '当前登录已失效，请重新进入家属端。'
    return
  }

  saving.value = true
  resetMessages()

  try {
    const payload = serializeProfilePayload(profileForm)
    await updateFamilyElderly(props.elderlyId, session.value.token, payload)
    successMessage.value = '画像信息已保存。'
    await Promise.all([loadProfileDetail(), loadReports()])
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '保存失败，请稍后重试。'
  } finally {
    saving.value = false
  }
}

async function handleGenerateReport() {
  if (!session.value?.token || session.value.role !== 'family') {
    errorMessage.value = '当前登录已失效，请重新进入家属端。'
    return
  }

  generatingReport.value = true
  resetMessages()

  try {
    const response = await generateReportForElderly(props.elderlyId, session.value.token)
    successMessage.value = '报告已生成，正在刷新列表。'
    await loadReports()

    if (response.reportId) {
      await openReportDetail(response.reportId)
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '生成报告失败，请稍后重试。'
  } finally {
    generatingReport.value = false
  }
}

async function handleDownloadReport(reportId: string) {
  if (!session.value?.token || session.value.role !== 'family' || !reportId) {
    return
  }

  downloadingReportId.value = reportId
  errorMessage.value = ''

  try {
    const blob = await exportReportPdf(reportId, session.value.token)
    const downloadUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = downloadUrl
    anchor.download = `${reportId}.pdf`
    anchor.click()
    URL.revokeObjectURL(downloadUrl)
  } catch (error) {
    if (error instanceof ApiError && error.status === 501) {
      errorMessage.value = '后端尚未实现 PDF 导出，目前只能查看在线报告。'
    } else {
      errorMessage.value =
        error instanceof Error ? error.message : '导出 PDF 失败，请稍后重试。'
    }
  } finally {
    downloadingReportId.value = ''
  }
}

onMounted(async () => {
  await loadFamilyElderly()
  await Promise.all([loadProfileDetail(), loadReports()])
})

watch(
  () => props.elderlyId,
  async () => {
    closeReportModal()
    await Promise.all([loadProfileDetail(), loadReports(), loadFamilyElderly()])
  }
)
</script>

<template>
  <div class="page-width role-page family-detail-page">
    <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>
    <p v-if="successMessage" class="success-banner">{{ successMessage }}</p>

    <section class="detail-layout">
      <article class="surface-card record-list-card">
        <header class="record-list-card__header">
          <div class="family-hero">
            <p class="eyebrow">家属端</p>
            <div class="family-hero__title-row">
              <h1>关联老人</h1>
              <div class="family-hero__actions">
                <button class="secondary-button" type="button" @click="loadFamilyElderly">
                  <img class="tool-icon" :src="iconLinkedElderly" alt="" />
                  刷新列表
                </button>
                <button class="secondary-button" type="button" @click="showBindForm = !showBindForm">
                  <img class="tool-icon" :src="iconProfileEdit" alt="" />
                  {{ showBindForm ? '收起绑定' : '新增绑定' }}
                </button>
              </div>
            </div>
          </div>
        </header>

        <div v-if="showBindForm" class="bind-form-shell">
          <div class="bind-form">
            <label class="field">
              <span>老人绑定码</span>
              <input v-model="bindForm.elderlyId" type="text" placeholder="请输入老人绑定码" />
            </label>
            <label class="field">
              <span>与老人关系</span>
              <input v-model="bindForm.relation" type="text" placeholder="例如 子女 / 配偶" />
            </label>
            <button class="primary-button bind-form__submit" type="button" :disabled="binding" @click="handleBindElderly">
              {{ binding ? '绑定中...' : '确认绑定' }}
            </button>
          </div>
        </div>

        <div v-if="loadingList" class="loading-card">正在加载关联老人...</div>

        <div v-else-if="elderlyList.length > 0" class="record-list scroll-panel">
          <article
            v-for="elderly in elderlyList"
            :key="elderly.elderly_id"
            class="record-item"
            :class="{ 'is-active': props.elderlyId === elderly.elderly_id }"
            role="button"
            tabindex="0"
            @click="openElderlyDetail(elderly.elderly_id)"
            @keydown.enter.prevent="openElderlyDetail(elderly.elderly_id)"
          >
            <div class="record-item__top">
              <label class="record-item__editable">
                <span>备注</span>
                <input
                  v-model="cardDrafts[elderly.elderly_id].name"
                  type="text"
                  placeholder="未命名"
                  :disabled="cardSaving[elderly.elderly_id]"
                  @click.stop
                  @focus.stop
                  @blur="saveCardDraft(elderly.elderly_id)"
                  @keydown.enter.prevent="saveCardDraft(elderly.elderly_id)"
                />
              </label>
              <span class="completion-badge">{{ Math.round((elderly.completion_rate || 0) * 100) }}%</span>
            </div>

            <div class="record-item__meta">
              <label class="record-item__editable record-item__editable--compact">
                <span>与老人关系</span>
                <input
                  v-model="cardDrafts[elderly.elderly_id].relation"
                  type="text"
                  placeholder="例如 子女 / 配偶"
                  :disabled="cardSaving[elderly.elderly_id]"
                  @click.stop
                  @focus.stop
                  @blur="saveCardDraft(elderly.elderly_id)"
                  @keydown.enter.prevent="saveCardDraft(elderly.elderly_id)"
                />
              </label>
              <span>关联于 {{ formatDate(elderly.created_at || '') }}</span>
            </div>

            <p class="record-item__summary">
              已填写核心字段约 {{ Math.round((elderly.completion_rate || 0) * 100) }}%。
              <span v-if="cardSaving[elderly.elderly_id]" class="record-item__saving">保存中...</span>
            </p>

            <div class="record-item__progress" aria-hidden="true">
              <div
                class="record-item__progress-fill"
                :style="{ width: `${Math.round((elderly.completion_rate || 0) * 100)}%` }"
              />
            </div>

            <div class="record-item__actions">
              <button
                class="ghost-button record-item__unbind"
                type="button"
                :disabled="unbindingElderlyId === elderly.elderly_id"
                @click.stop="handleUnbindElderly(elderly.elderly_id)"
              >
                {{ unbindingElderlyId === elderly.elderly_id ? '解除中...' : '解除绑定' }}
              </button>
            </div>
          </article>
        </div>

        <EmptyStateCard
          v-else
          title="暂无关联老人"
          description="当前账号下没有已绑定老人。可在上方通过老人绑定码追加绑定。"
        />
      </article>

      <article class="surface-card detail-form-card">
        <header class="detail-form-card__header">
          <div class="detail-form-card__title">
            <p class="eyebrow">当前老人</p>
            <h1>{{ displayTitle }}</h1>
            <p>这里可以补全老人画像信息，并在保存后重新生成报告。</p>
          </div>

          <div class="detail-form-card__actions">
            <button class="secondary-button" type="button" @click="router.push('/family/hub')">返回列表</button>
            <button class="primary-button" type="button" :disabled="loading || saving" @click="saveProfile">
              {{ saving ? '保存中...' : '保存图像' }}
            </button>
            <button class="ghost-button" type="button" :disabled="generatingReport" @click="handleGenerateReport">
              {{ generatingReport ? '生成中...' : '生成报告' }}
            </button>
          </div>
        </header>

        <div v-if="loading" class="loading-card">正在加载老人画像...</div>

        <div v-else class="detail-form scroll-panel">
          <section v-for="group in groupedFields" :key="group.group" class="form-group-card">
            <div class="form-group-card__header">
              <h2>{{ group.group }}</h2>
            </div>

            <div class="field-grid">
              <label v-for="field in group.fields" :key="field.key" class="field">
                <span>{{ field.label }}</span>

                <select
                  v-if="field.type === 'select'"
                  v-model="profileForm[field.key]"
                >
                  <option value="">请选择</option>
                  <option v-for="option in field.options || []" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>

                <input
                  v-else
                  v-model="profileForm[field.key]"
                  :type="field.type === 'number' ? 'number' : 'text'"
                  :placeholder="field.placeholder || `请输入${field.label}`"
                />
              </label>
            </div>
          </section>
        </div>
      </article>

      <aside class="detail-side">
        <section class="surface-card reports-shell">
          <header class="reports-shell__header">
            <h3>报告列表</h3>
            <span>{{ reportsLoading ? '加载中' : reportCards.length > 0 ? `${reportCards.length} 份` : '0 份' }}</span>
          </header>

          <div v-if="reportCards.length > 0" class="report-list scroll-panel">
            <article
              v-for="reportCard in reportCards"
              :key="reportCard.reportId || JSON.stringify(reportCard.report)"
              class="report-item"
            >
              <div class="report-item__meta">
                <strong>{{ reportCard.reportTitle }}</strong>
                <p>{{ formatDateTime(reportCard.generatedAt) }}</p>
              </div>

              <section class="report-item__suggestions">
                <div class="report-item__suggestions-header">
                  <h4>行动建议</h4>
                </div>

                <ul v-if="reportCard.recommendations.length > 0" class="report-item__suggestion-list">
                  <li
                    v-for="item in reportCard.recommendations"
                    :key="`${reportCard.reportId}-${item.id}`"
                    class="report-item__suggestion"
                  >
                    <p class="report-item__suggestion-priority">{{ item.priorityLabel }}</p>
                    <strong>{{ item.title }}</strong>
                    <p v-if="item.description" class="report-item__suggestion-description">{{ item.description }}</p>
                  </li>
                </ul>

                <p v-else class="report-item__suggestion-empty">当前报告未返回可展示的结构化建议内容。</p>
              </section>

              <div class="report-item__actions">
                <button
                  class="secondary-button"
                  type="button"
                  :disabled="!reportCard.reportId"
                  @click="openReportDetail(reportCard.reportId)"
                >
                  查看报告
                </button>
                <button
                  class="ghost-button"
                  type="button"
                  :disabled="!reportCard.reportId || downloadingReportId === reportCard.reportId"
                  @click="handleDownloadReport(reportCard.reportId)"
                >
                  {{ downloadingReportId === reportCard.reportId ? '导出中...' : '导出 PDF' }}
                </button>
              </div>
            </article>
          </div>

          <EmptyStateCard
            v-else
            title="家属端暂无报告返回"
            description="当前老人还没有生成报告，可先补全画像。"
          />
        </section>
      </aside>
    </section>

    <ReportDetailModal
      v-if="selectedReportId"
      :report-id="selectedReportId"
      :report-title="selectedReportTitle"
      :report="selectedReportDetail || activeReport || null"
      :loading="reportDetailLoading"
      :downloading="downloadingReportId === selectedReportId"
      empty-text="当前报告没有返回可展示的结构化内容。"
      @close="closeReportModal"
      @download="handleDownloadReport(selectedReportId)"
    />
  </div>
</template>

<style scoped>
.family-detail-page {
  display: grid;
  gap: 18px;
  min-height: calc(100dvh - 8.5rem);
}

.detail-layout {
  --workspace-panel-height: calc(100dvh - 8.5rem);
  display: grid;
  grid-template-columns: minmax(300px, 0.84fr) minmax(0, 1.2fr) minmax(320px, 0.92fr);
  gap: 20px;
  align-items: stretch;
}

.record-list-card,
.detail-form-card,
.reports-shell,
.loading-card {
  padding: 20px;
}

.family-hero {
  display: grid;
  gap: 10px;
}

.record-list-card__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.family-hero__title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.family-hero h1,
.detail-form-card h1,
.reports-shell h3 {
  margin: 0;
  color: var(--ink-strong);
}

.family-hero h1,
.detail-form-card h1 {
  font-size: clamp(2rem, 3vw, 2.6rem);
}

.family-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.tool-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  margin-right: 8px;
  flex-shrink: 0;
}

.bind-form-shell {
  margin-top: 18px;
  padding: 18px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.76);
  border: 1px dashed rgba(120, 164, 199, 0.4);
}

.bind-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: end;
}

.bind-form__submit {
  grid-column: 1 / -1;
  justify-self: end;
  width: min(100%, 12rem);
}

.field {
  display: grid;
  gap: 8px;
}

.field span {
  color: var(--ink-strong);
  font-weight: 600;
}

.field input {
  width: 100%;
  min-height: 48px;
  border-radius: 16px;
  padding: 0 14px;
}

.record-list {
  margin-top: 18px;
  display: grid;
  gap: 12px;
  max-height: 65rem;
  overflow: auto;
  padding-right: 6px;
}

.record-item {
  width: 100%;
  cursor: pointer;
  padding: 16px 18px;
  border-radius: 20px;
  text-align: left;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.record-item:focus-within {
  border-color: rgba(72, 111, 166, 0.34);
  background: rgba(72, 111, 166, 0.08);
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

.record-item__editable {
  display: grid;
  gap: 6px;
  min-width: 0;
  flex: 1 1 auto;
}

.record-item__editable span {
  font-size: 0.82rem;
  color: var(--ink-muted);
}

.record-item__editable input {
  width: 100%;
  min-height: 40px;
  border-radius: 14px;
  padding: 0 12px;
  font-size: 1rem;
  background: rgba(255, 255, 255, 0.92);
}

.record-item__editable--compact input {
  min-height: 38px;
}

.record-item__meta {
  margin-top: 10px;
  font-size: 0.92rem;
  color: var(--ink-muted);
}

.record-item__summary {
  margin: 10px 0 0;
  line-height: 1.7;
  color: var(--ink-muted);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.record-item__saving {
  color: var(--brand-strong);
  font-weight: 600;
}

.record-item__progress {
  height: 10px;
  margin-top: 14px;
  border-radius: 999px;
  background: rgba(90, 142, 209, 0.12);
  overflow: hidden;
}

.record-item__progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(135deg, var(--brand), var(--brand-strong));
}

.record-item__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.record-item__unbind {
  min-height: 34px;
  padding: 0 12px;
  color: var(--ink-muted);
}

.completion-badge {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(90, 142, 209, 0.14);
  color: var(--brand-strong);
  font-weight: 700;
}

.detail-form-card__title {
  max-width: 40rem;
}

.detail-form-card__header,
.reports-shell__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.detail-form-card__header h1 {
  margin: 10px 0 0;
  color: var(--ink-strong);
  font-size: clamp(2rem, 3vw, 2.6rem);
}

.detail-form-card__header p,
.reports-shell__header span,
.report-item p {
  color: var(--ink-muted);
}

.detail-form-card__header p {
  margin: 10px 0 0;
  line-height: 1.7;
}

.detail-form-card__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.detail-form-card {
  height: var(--workspace-panel-height);
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.detail-form-card__title {
  max-width: 40rem;
}

.detail-form {
  margin-top: 16px;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding-right: 6px;
  display: grid;
  gap: 14px;
}

.form-group-card {
  padding: 16px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.form-group-card__header h2 {
  margin: 0 0 14px;
  color: var(--ink-strong);
  font-size: 1.1rem;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.field {
  display: grid;
  gap: 8px;
}

.field span {
  color: var(--ink-strong);
  font-weight: 600;
}

.field input,
.field select {
  min-height: 48px;
  border-radius: 16px;
  padding: 0 14px;
}

.detail-side {
  display: grid;
  gap: 18px;
  min-height: 0;
}

.reports-shell {
  height: var(--workspace-panel-height);
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.reports-shell__header h3 {
  margin: 0;
  color: var(--ink-strong);
}

.report-list {
  margin-top: 16px;
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 14px;
  overflow: auto;
  padding-right: 6px;
}

.report-item {
  padding: 16px 18px 18px;
  border-radius: 22px;
  border: 1px solid rgba(90, 142, 209, 0.12);
  background: rgba(255, 255, 255, 0.84);
  display: grid;
  gap: 14px;
}

.report-item__meta {
  display: grid;
  gap: 4px;
}

.report-item__suggestions {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(245, 251, 255, 0.92), rgba(238, 247, 253, 0.84));
  border: 1px solid rgba(120, 164, 199, 0.14);
}

.report-item__suggestions-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
}

.report-item__suggestions-header h4 {
  margin: 0;
  color: var(--ink-strong);
  font-size: 1rem;
}

.report-item__suggestions-header span,
.report-item__suggestion-priority,
.report-item__suggestion-description,
.report-item__suggestion-empty {
  color: var(--ink-muted);
}

.report-item__suggestion-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.report-item__suggestion {
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(90, 142, 209, 0.12);
}

.report-item__suggestion strong {
  display: block;
  color: var(--ink-strong);
  line-height: 1.6;
}

.report-item__suggestion-priority,
.report-item__suggestion-description,
.report-item__suggestion-empty {
  margin: 0;
  line-height: 1.7;
}

.report-item__suggestion-priority {
  margin-bottom: 4px;
  font-size: 0.86rem;
  letter-spacing: 0.04em;
}

.report-item__suggestion-description {
  margin-top: 6px;
  font-size: 0.92rem;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}

.report-item p {
  margin: 6px 0 0;
  line-height: 1.7;
}

.report-item__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: auto;
  padding-top: 2px;
}

.loading-card,
.error-banner,
.success-banner {
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

@media (max-width: 980px) {
  .detail-layout {
    grid-template-columns: 1fr;
    --workspace-panel-height: auto;
  }

  .family-detail-page {
    min-height: auto;
  }
}

@media (max-width: 760px) {
  .record-list-card__header,
  .detail-form-card__header,
  .reports-shell__header,
  .report-item__suggestions-header {
    flex-direction: column;
    align-items: stretch;
  }

  .family-hero__title-row,
  .detail-form-card__actions,
  .report-item__actions {
    display: grid;
  }

  .family-hero__title-row {
    grid-template-columns: 1fr;
  }

  .detail-form-card__actions,
  .report-item__actions,
  .field-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .detail-form-card,
  .reports-shell,
  .loading-card {
    padding: 20px;
  }
}

/* Design-shot layout override */
.family-detail-page {
  width: min(1840px, calc(100vw - 48px));
}

.detail-layout {
  --workspace-panel-height: calc(100vh - 122px);
  min-height: var(--workspace-panel-height);
  grid-template-columns: 410px minmax(0, 1fr) 560px;
  gap: 24px;
  align-items: stretch;
}

.record-list-card,
.detail-form-card,
.reports-shell,
.loading-card {
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.record-list-card {
  padding: 38px 0 0;
}

.family-hero__title-row {
  display: grid;
  gap: 18px;
}

.family-hero .eyebrow {
  letter-spacing: 0;
  text-transform: none;
  color: #0876d6;
  font-size: 1.08rem;
  font-weight: 900;
}

.family-hero h1 {
  color: #05080c;
  font-size: 2rem;
  font-weight: 900;
}

.family-hero__actions {
  justify-content: flex-start;
  gap: 22px;
}

.family-hero__actions .secondary-button {
  min-height: 36px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #0876d6;
  box-shadow: none;
  font-weight: 900;
}

.bind-form-shell {
  margin-top: 24px;
  padding: 16px 24px;
  border-radius: 0;
  border: 1px dashed rgba(8, 118, 214, 0.5);
  background: transparent;
}

.bind-form {
  grid-template-columns: 70px minmax(0, 1fr);
  gap: 14px 18px;
}

.bind-form .field {
  display: contents;
}

.bind-form .field span {
  align-self: center;
  color: #0876d6;
  font-size: 1.08rem;
  font-weight: 900;
}

.bind-form .field input {
  min-height: 46px;
  border-radius: 14px;
  background: #fff;
}

.bind-form__submit {
  grid-column: 2;
  justify-self: end;
  width: 180px;
  min-height: 46px;
  border-radius: 999px;
  background: linear-gradient(135deg, #66b3f3, #0678d8);
  font-weight: 900;
}

.record-list {
  margin-top: 24px;
  gap: 24px;
  max-height: calc(100vh - 290px);
  padding-right: 0;
}

.record-item {
  padding: 24px 22px;
  border: 0;
  border-radius: 12px;
  background: #fff;
  box-shadow: none;
}

.record-item.is-active {
  border: 2px solid #0876d6;
  background: #fff;
}

.record-item__top strong {
  color: #0876d6;
  font-size: 1.18rem;
}

.completion-badge {
  padding: 0;
  background: transparent;
  color: #0876d6;
  font-size: 1.08rem;
}

.detail-form-card {
  height: var(--workspace-panel-height);
  padding: 28px 24px 36px;
  border-radius: 12px;
  background: #fff;
}

.detail-form-card__header {
  align-items: start;
}

.detail-form-card__title .eyebrow {
  letter-spacing: 0;
  text-transform: none;
  color: #0876d6;
  font-size: 1.08rem;
  font-weight: 900;
}

.detail-form-card__title h1,
.detail-form-card__title p {
  display: none;
}

.detail-form-card__actions {
  gap: 24px;
}

.detail-form-card__actions .secondary-button {
  display: none;
}

.detail-form-card__actions .primary-button,
.detail-form-card__actions .ghost-button {
  min-width: 170px;
  min-height: 58px;
  border-radius: 999px;
  font-size: 1.08rem;
  font-weight: 900;
}

.detail-form-card__actions .primary-button {
  color: #fff;
  background: linear-gradient(135deg, #66b3f3, #0678d8);
}

.detail-form-card__actions .ghost-button {
  border: 1px solid rgba(8, 118, 214, 0.45);
  background: #fff;
  color: #0876d6;
}

.detail-form {
  margin-top: 18px;
  gap: 34px;
}

.form-group-card {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.form-group-card__header h2 {
  position: relative;
  margin: 0 0 20px;
  padding-left: 14px;
  color: #05080c;
  font-size: 1.18rem;
  font-weight: 900;
}

.form-group-card__header h2::before {
  content: '';
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 0;
  width: 4px;
  border-radius: 999px;
  background: #0876d6;
}

.field-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 28px 32px;
}

.field span {
  color: #6f777c;
  font-size: 1rem;
  font-weight: 700;
}

.field input,
.field select {
  min-height: 58px;
  border-radius: 12px;
  border-color: #e1e4e6;
  background: #fff;
  color: #05080c;
  font-size: 1.08rem;
  font-weight: 800;
}

.reports-shell {
  height: var(--workspace-panel-height);
  padding: 28px 28px 36px;
  border-radius: 12px;
  background: #fff;
}

.reports-shell__header h3 {
  color: #0876d6;
  font-size: 1.18rem;
}

.report-list {
  max-height: calc(100vh - 260px);
  gap: 28px;
}

.report-item {
  padding: 22px 0 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.report-item__meta {
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 20px;
}

.report-item__meta strong {
  color: #05080c;
  font-size: 1.42rem;
  font-weight: 900;
}

.report-item__suggestions {
  padding: 22px 0 0;
  border: 0;
  background: transparent;
}

.report-item__suggestions-header h4 {
  font-size: 1.18rem;
  font-weight: 900;
}

.report-item__suggestion {
  position: relative;
  padding: 0 0 0 22px;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.report-item__suggestion::before {
  content: '';
  position: absolute;
  top: 10px;
  left: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #48a0a3;
}

.report-item__suggestion-priority,
.report-item__suggestion strong {
  color: #05080c;
  font-weight: 900;
}

.report-item__suggestion-description {
  -webkit-line-clamp: 4;
  color: #30363a;
}

.report-item__actions {
  justify-content: flex-end;
  margin-top: 28px;
}

.report-item__actions .secondary-button,
.report-item__actions .ghost-button {
  min-width: 170px;
  min-height: 54px;
  border-radius: 999px;
  border: 1px solid rgba(8, 118, 214, 0.45);
  background: #fff;
  color: #0876d6;
  font-weight: 900;
}

@media (max-width: 1400px) {
  .detail-layout {
    grid-template-columns: 360px minmax(0, 1fr);
  }

  .detail-side {
    grid-column: 1 / -1;
  }
}
</style>
