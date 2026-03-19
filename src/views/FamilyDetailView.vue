<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { getFamilyElderly, getFamilyReports, updateFamilyElderly } from '@/api/family'
import EmptyStateCard from '@/components/EmptyStateCard.vue'
import ProfileOverview from '@/components/ProfileOverview.vue'
import ReportSummary from '@/components/ReportSummary.vue'
import { useAuthSession } from '@/session'
import {
  cloneProfileForForm,
  getIdentityTitle,
  getMissingCoreFields,
  PROFILE_FIELDS,
  PROFILE_GROUPS,
  serializeProfilePayload
} from '@/utils/profile'

const props = defineProps<{
  elderlyId: string
}>()

const router = useRouter()
const { session } = useAuthSession()

const loading = ref(false)
const saving = ref(false)
const reportsLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const familyReports = ref<Array<Record<string, unknown>>>([])
const profileForm = reactive<Record<string, unknown>>({})

const groupedFields = PROFILE_GROUPS.map((group) => ({
  group,
  fields: PROFILE_FIELDS.filter((field) => field.group === group)
}))

const displayTitle = computed(() =>
  getIdentityTitle(profileForm, `老人档案 ${props.elderlyId.slice(0, 8)}`)
)
const missingFields = computed(() => getMissingCoreFields(profileForm))

async function loadProfileDetail() {
  if (!session.value?.token) {
    errorMessage.value = '当前登录已失效，请重新进入家属端。'
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const detail = await getFamilyElderly(props.elderlyId, session.value.token)
    const clonedProfile = cloneProfileForForm(detail.profile || {})

    for (const key of Object.keys(profileForm)) {
      delete profileForm[key]
    }

    Object.assign(profileForm, clonedProfile)
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '加载老人画像失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

async function loadReports() {
  if (!session.value?.token) {
    return
  }

  reportsLoading.value = true

  try {
    familyReports.value = await getFamilyReports(props.elderlyId, session.value.token)
  } catch {
    familyReports.value = []
  } finally {
    reportsLoading.value = false
  }
}

async function saveProfile() {
  if (!session.value?.token) {
    errorMessage.value = '当前登录已失效，请重新进入家属端。'
    return
  }

  saving.value = true
  successMessage.value = ''
  errorMessage.value = ''

  try {
    await updateFamilyElderly(props.elderlyId, session.value.token, serializeProfilePayload(profileForm))
    successMessage.value = '画像信息已保存。'
    await loadProfileDetail()
    await loadReports()
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '保存失败，请稍后重试。'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadProfileDetail(), loadReports()])
})
</script>

<template>
  <div class="page-width role-page family-detail-page">
    <section class="surface-card detail-hero">
      <div>
        <p class="eyebrow">家属端详情</p>
        <h1>{{ displayTitle }}</h1>
        <p>在这里补全画像字段，并查看后端当前可返回的报告状态。</p>
      </div>

      <div class="detail-hero__actions">
        <button class="secondary-button" type="button" @click="router.push('/family/hub')">返回列表</button>
        <button class="primary-button" type="button" :disabled="loading || saving" @click="saveProfile">
          {{ saving ? '保存中...' : '保存画像' }}
        </button>
      </div>
    </section>

    <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>
    <p v-if="successMessage" class="success-banner">{{ successMessage }}</p>

    <section class="detail-layout">
      <article class="surface-card detail-form-card">
        <header class="detail-form-card__header">
          <div>
            <h2>画像补全</h2>
            <p>按分组补充老人基本信息、功能状态、慢病与社会支持等字段。</p>
          </div>
        </header>

        <div v-if="loading" class="loading-card">正在加载老人画像...</div>

        <div v-else class="detail-form scroll-panel">
          <section v-for="group in groupedFields" :key="group.group" class="form-group-card">
            <div class="form-group-card__header">
              <h3>{{ group.group }}</h3>
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
        <section class="surface-card hint-card">
          <h3>仍建议补充</h3>
          <div v-if="missingFields.length > 0" class="hint-chip-list">
            <span v-for="field in missingFields" :key="field" class="hint-chip">{{ field }}</span>
          </div>
          <p v-else class="hint-card__text">核心字段已基本齐全，可等待后端进一步生成报告。</p>
        </section>

        <ProfileOverview :profile="profileForm" title="当前画像预览" />

        <section class="surface-card">
          <div class="reports-shell">
            <header class="reports-shell__header">
              <h3>报告状态</h3>
              <span>{{ reportsLoading ? '加载中' : familyReports.length > 0 ? `${familyReports.length} 份` : '0 份' }}</span>
            </header>
            <ReportSummary
              :reports="familyReports"
              empty-title="家属端暂无报告返回"
              empty-description="当前 `/family/reports/{elderly_id}` 很可能返回空数组，这里会继续保留空态而不伪造报告。"
            />
          </div>
        </section>

        <EmptyStateCard
          title="报告生成已显式降级"
          description="当前后端的 `/report/generate/{elderly_id}` 不可用，因此本页只提供画像补全和真实报告查看，不提供前端伪造生成。"
        />
      </aside>
    </section>
  </div>
</template>

<style scoped>
.family-detail-page {
  display: grid;
  gap: 18px;
}

.detail-hero {
  padding: 28px 30px;
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
}

.detail-hero h1 {
  margin: 12px 0;
  color: var(--ink-strong);
  font-size: clamp(2rem, 3.4vw, 3rem);
}

.detail-hero p {
  margin: 0;
  color: var(--ink-muted);
  line-height: 1.8;
}

.detail-hero__actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.88fr);
  gap: 20px;
  align-items: start;
}

.detail-form-card {
  padding: 24px;
}

.detail-form-card__header h2 {
  margin: 0;
  color: var(--ink-strong);
}

.detail-form-card__header p {
  margin: 8px 0 0;
  color: var(--ink-muted);
}

.detail-form {
  margin-top: 18px;
  max-height: 62rem;
  overflow: auto;
  padding-right: 8px;
  display: grid;
  gap: 18px;
}

.form-group-card {
  padding: 18px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.form-group-card__header h3 {
  margin: 0 0 14px;
  color: var(--ink-strong);
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
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
}

.hint-card,
.reports-shell {
  padding: 22px;
}

.hint-card h3,
.reports-shell__header h3 {
  margin: 0;
  color: var(--ink-strong);
}

.hint-card__text {
  margin: 12px 0 0;
  color: var(--ink-muted);
}

.hint-chip-list {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 14px;
}

.hint-chip {
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.reports-shell__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}

.loading-card {
  margin-top: 18px;
  padding: 24px;
  color: var(--ink-muted);
}

.success-banner {
  margin: 0;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(79, 167, 126, 0.12);
  color: #2c7a52;
}

@media (max-width: 1100px) {
  .detail-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .detail-hero {
    flex-direction: column;
    padding: 22px;
  }

  .detail-form-card {
    padding: 20px;
  }
}
</style>
