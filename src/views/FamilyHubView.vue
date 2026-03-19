<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { listFamilyElderly } from '@/api/family'
import EmptyStateCard from '@/components/EmptyStateCard.vue'
import { useAuthSession } from '@/session'
import type { FamilyElderlySummary } from '@/types'

const router = useRouter()
const { session } = useAuthSession()

const elderlyList = ref<FamilyElderlySummary[]>([])
const loading = ref(false)
const errorMessage = ref('')

const linkedCount = computed(() => elderlyList.value.length)
const reportReadyCount = computed(() =>
  elderlyList.value.filter((item) => item.completion_rate >= 0.7).length
)
const averageCompletion = computed(() => {
  if (elderlyList.value.length === 0) {
    return 0
  }

  const total = elderlyList.value.reduce((sum, item) => sum + item.completion_rate, 0)
  return Math.round((total / elderlyList.value.length) * 100)
})

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

async function loadFamilyElderly() {
  if (!session.value?.token) {
    errorMessage.value = '当前登录已失效，请重新进入家属端。'
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    elderlyList.value = await listFamilyElderly(session.value.token)
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '加载关联老人失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

function openElderlyDetail(elderlyId: string) {
  router.push(`/family/elderly/${elderlyId}`)
}

onMounted(async () => {
  await loadFamilyElderly()
})
</script>

<template>
  <div class="page-width role-page family-page">
    <section class="surface-card family-hero">
      <div>
        <p class="eyebrow">家属端</p>
        <h1>关联老人照护中心</h1>
        <p>
          登录后查看已关联的老人记录，补全健康画像，并在后端可返回时同步查看最新报告状态。
        </p>
      </div>

      <div class="family-hero__metrics">
        <article class="metric-card">
          <span>关联老人</span>
          <strong>{{ linkedCount }}</strong>
        </article>
        <article class="metric-card">
          <span>完整度较高</span>
          <strong>{{ reportReadyCount }}</strong>
        </article>
        <article class="metric-card">
          <span>平均完整度</span>
          <strong>{{ averageCompletion }}%</strong>
        </article>
      </div>
    </section>

    <section class="family-list-section">
      <header class="section-header">
        <div>
          <h2>已关联老人</h2>
          <p>家属登录后应与老人信息相关联；当前列表以真实接口返回为准。</p>
        </div>
        <button class="secondary-button" type="button" @click="loadFamilyElderly">刷新列表</button>
      </header>

      <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>

      <div v-if="loading" class="surface-card loading-card">正在加载关联老人...</div>

      <div v-else-if="elderlyList.length > 0" class="elderly-grid">
        <article v-for="elderly in elderlyList" :key="elderly.elderly_id" class="surface-card elderly-card">
          <div class="elderly-card__header">
            <div>
              <h3>{{ elderly.name || '未命名老人' }}</h3>
              <p>{{ elderly.relation || '家庭成员' }}</p>
            </div>
            <span class="completion-badge">{{ Math.round(elderly.completion_rate * 100) }}%</span>
          </div>

          <div class="elderly-card__body">
            <div class="progress-track">
              <div class="progress-track__fill" :style="{ width: `${Math.round(elderly.completion_rate * 100)}%` }" />
            </div>
            <p>关联时间：{{ formatDate(elderly.created_at) }}</p>
          </div>

          <button class="primary-button elderly-card__action" type="button" @click="openElderlyDetail(elderly.elderly_id)">
            查看并补全信息
          </button>
        </article>
      </div>

      <EmptyStateCard
        v-else
        title="暂无关联老人"
        description="当前登录账号下未返回关联老人数据。请先由老人端完成评估或由后端补充关联关系。"
      />
    </section>
  </div>
</template>

<style scoped>
.family-page {
  display: grid;
  gap: 22px;
}

.family-hero {
  padding: 30px 32px;
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  gap: 22px;
}

.family-hero h1 {
  margin: 12px 0;
  color: var(--ink-strong);
  font-size: clamp(2.4rem, 4vw, 3.5rem);
}

.family-hero p {
  margin: 0;
  color: var(--ink-muted);
  line-height: 1.8;
  font-size: 1.08rem;
}

.family-hero__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.metric-card {
  padding: 18px 20px;
  border-radius: 24px;
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
  font-size: 1.75rem;
}

.family-list-section {
  display: grid;
  gap: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.section-header h2 {
  margin: 0;
  color: var(--ink-strong);
}

.section-header p {
  margin: 8px 0 0;
  color: var(--ink-muted);
}

.loading-card {
  padding: 24px;
}

.elderly-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
  gap: 18px;
}

.elderly-card {
  padding: 22px;
  display: grid;
  gap: 16px;
}

.elderly-card__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.elderly-card__header h3 {
  margin: 0;
  color: var(--ink-strong);
  font-size: 1.35rem;
}

.elderly-card__header p,
.elderly-card__body p {
  margin: 6px 0 0;
  color: var(--ink-muted);
}

.completion-badge {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(90, 142, 209, 0.14);
  color: var(--brand-strong);
  font-weight: 700;
}

.progress-track {
  height: 10px;
  border-radius: 999px;
  background: rgba(90, 142, 209, 0.12);
  overflow: hidden;
}

.progress-track__fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(135deg, var(--brand), var(--brand-strong));
}

.elderly-card__action {
  width: 100%;
}

@media (max-width: 960px) {
  .family-hero,
  .family-hero__metrics {
    grid-template-columns: 1fr;
  }

  .section-header {
    flex-direction: column;
  }
}

@media (max-width: 720px) {
  .family-hero {
    padding: 22px;
  }
}
</style>
