<script setup lang="ts">
import { computed } from 'vue'

import { normalizeLatestReport, normalizeReportRecord } from '@/utils/report'

const props = withDefaults(
  defineProps<{
    reportId: string
    reportTitle?: string
    report: Record<string, unknown> | null | undefined
    loading?: boolean
    downloading?: boolean
    emptyText?: string
  }>(),
  {
    loading: false,
    downloading: false,
    emptyText: '当前报告没有返回可展示的内容。'
  }
)

const emit = defineEmits<{
  close: []
  download: []
}>()

const normalizedRecord = computed(() => {
  return props.report ? normalizeReportRecord(props.report) : null
})

const normalizedReport = computed(() => {
  return normalizedRecord.value ? normalizeLatestReport([normalizedRecord.value]) : null
})

const reportPointSections = computed(() => {
  const report = normalizedReport.value
  if (!report) {
    return []
  }

  const sections = report.sections
    .map((section) => ({
      title: section.title,
      items: Array.from(new Set(section.items.map((item) => item.trim()).filter(Boolean)))
    }))
    .filter((section) => section.items.length > 0)

  const markdownPoints = extractReportPoints(report.markdown).filter((item) => {
    if (report.summary && item === report.summary.trim()) {
      return false
    }

    return !sections.some((section) => section.items.includes(item))
  })

  if (markdownPoints.length > 0) {
    sections.push({
      title: '报告要点',
      items: markdownPoints
    })
  }

  if (sections.length > 0) {
    return sections
  }

  if (report.summary) {
    return [
      {
        title: '报告摘要',
        items: [report.summary]
      }
    ]
  }

  return []
})

function extractReportPoints(markdown: string) {
  if (!markdown.trim()) {
    return []
  }

  return Array.from(
    new Set(
      markdown
        .split(/\r?\n/)
        .map((line) =>
          line
            .trim()
            .replace(/^\s*(?:#{1,6}|[-*+]|>\s*|\d+[.)])\s*/, '')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .trim()
        )
        .filter(Boolean)
    )
  )
}

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
</script>

<template>
  <div class="report-modal" @click.self="emit('close')">
    <article class="surface-card report-modal__card">
      <header class="report-modal__header">
        <div>
          <p class="eyebrow">报告详情</p>
          <h3>{{ reportTitle || reportId }}</h3>
          <p>{{ loading ? '正在同步当前报告内容' : formatDateTime(normalizedReport?.generatedAt || '') }}</p>
        </div>

        <div class="report-modal__actions">
          <button
            class="ghost-button report-modal__action"
            type="button"
            :disabled="loading || downloading"
            @click="emit('download')"
          >
            {{ downloading ? '导出中...' : '导出 PDF' }}
          </button>
          <button class="secondary-button report-modal__action" type="button" @click="emit('close')">
            关闭
          </button>
        </div>
      </header>

      <div v-if="loading" class="report-modal__loading">正在加载报告详情...</div>

      <div v-else-if="normalizedReport" class="report-modal__body">
        <article v-if="normalizedReport.summary" class="report-modal__summary">
          <strong>摘要</strong>
          <p>{{ normalizedReport.summary }}</p>
        </article>

        <section
          v-for="section in reportPointSections"
          :key="section.title"
          class="report-modal__section"
        >
          <h4>{{ section.title }}</h4>
          <ul class="report-modal__list">
            <li v-for="item in section.items" :key="item">{{ item }}</li>
          </ul>
        </section>

        <div
          v-if="!normalizedReport.summary && reportPointSections.length === 0"
          class="report-modal__empty"
        >
          {{ emptyText }}
        </div>
      </div>

      <div v-else class="report-modal__empty">{{ emptyText }}</div>
    </article>
  </div>
</template>

<style scoped>
.report-modal {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(20, 43, 61, 0.28);
  backdrop-filter: blur(10px);
}

.report-modal__card {
  width: min(760px, calc(100vw - 32px));
  max-height: min(80vh, 920px);
  padding: 24px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at top right, rgba(137, 207, 192, 0.12), transparent 18rem),
    linear-gradient(180deg, rgba(254, 255, 255, 0.98), rgba(244, 250, 251, 0.96));
  box-shadow: 0 32px 80px rgba(18, 45, 65, 0.24);
}

.report-modal__header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
}

.report-modal__header h3 {
  margin: 10px 0 0;
  color: var(--ink-strong);
  font-size: clamp(1.55rem, 2.3vw, 2rem);
}

.report-modal__header p:last-child {
  margin: 8px 0 0;
  color: var(--ink-muted);
}

.report-modal__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.report-modal__action {
  min-width: 6.75rem;
}

.report-modal__loading,
.report-modal__empty {
  margin-top: 20px;
  padding: 18px 20px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(83, 169, 183, 0.12);
  color: var(--ink-muted);
}

.report-modal__body {
  margin-top: 20px;
  display: grid;
  gap: 16px;
  overflow: auto;
  padding-right: 4px;
}

.report-modal__summary,
.report-modal__section {
  padding: 18px 20px;
  border-radius: 22px;
  border: 1px solid rgba(83, 169, 183, 0.12);
  background: rgba(255, 255, 255, 0.9);
}

.report-modal__summary strong,
.report-modal__section h4 {
  margin: 0;
  color: var(--ink-strong);
}

.report-modal__summary p {
  margin: 10px 0 0;
  color: var(--ink);
  line-height: 1.8;
}

.report-modal__list {
  margin: 12px 0 0;
  padding-left: 18px;
  display: grid;
  gap: 10px;
}

.report-modal__list li {
  color: var(--ink);
  line-height: 1.7;
}

@media (max-width: 720px) {
  .report-modal {
    padding: 14px;
  }

  .report-modal__card {
    width: 100%;
    max-height: calc(100vh - 28px);
    padding: 18px;
  }

  .report-modal__header,
  .report-modal__actions {
    flex-direction: column;
    align-items: stretch;
  }

  .report-modal__action {
    width: 100%;
  }
}
</style>
