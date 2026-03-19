<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'

import EmptyStateCard from '@/components/EmptyStateCard.vue'
import { normalizeLatestReport } from '@/utils/report'

const props = withDefaults(
  defineProps<{
    reports: Array<Record<string, unknown>> | null | undefined
    title?: string
    emptyTitle?: string
    emptyDescription?: string
  }>(),
  {
    title: '健康报告',
    emptyTitle: '暂无可展示报告',
    emptyDescription: '当前后端尚未返回可用报告时，这里会保持空态并继续展示已有画像。'
  }
)

const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true
})

const normalizedReport = computed(() => normalizeLatestReport(props.reports))
const renderedMarkdown = computed(() => {
  if (!normalizedReport.value?.markdown) {
    return ''
  }
  return markdown.render(normalizedReport.value.markdown)
})
</script>

<template>
  <section class="surface-card panel-card">
    <header class="panel-card__header">
      <div>
        <h3>{{ title }}</h3>
        <p v-if="normalizedReport?.generatedAt" class="report-meta">
          最近生成：{{ normalizedReport.generatedAt }}
        </p>
      </div>
    </header>

    <div v-if="normalizedReport" class="panel-card__body scroll-panel">
      <article v-if="normalizedReport.summary" class="report-callout">
        <strong>摘要</strong>
        <p>{{ normalizedReport.summary }}</p>
      </article>

      <article v-for="section in normalizedReport.sections" :key="section.title" class="report-section">
        <strong>{{ section.title }}</strong>
        <ul>
          <li v-for="item in section.items" :key="item">{{ item }}</li>
        </ul>
      </article>

      <article v-if="renderedMarkdown" class="report-section">
        <strong>报告原文</strong>
        <div class="markdown-body" v-html="renderedMarkdown" />
      </article>

      <details v-if="!normalizedReport.summary && normalizedReport.sections.length === 0 && !renderedMarkdown">
        <summary>查看原始返回</summary>
        <pre class="raw-json">{{ normalizedReport.rawJson }}</pre>
      </details>
    </div>

    <EmptyStateCard v-else :title="emptyTitle" :description="emptyDescription" />
  </section>
</template>

<style scoped>
.panel-card {
  padding: 22px;
}

.panel-card__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.panel-card__header h3 {
  margin: 0;
  color: var(--ink-strong);
  font-size: 1.2rem;
}

.panel-card__body {
  margin-top: 18px;
  max-height: 28rem;
  overflow: auto;
  padding-right: 6px;
}

.report-meta {
  margin: 6px 0 0;
  color: var(--ink-muted);
  font-size: 0.92rem;
}

.report-callout,
.report-section {
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.report-section + .report-section,
.report-callout + .report-section,
.report-section + details {
  margin-top: 14px;
}

.report-callout strong,
.report-section strong {
  display: block;
  color: var(--ink-strong);
  margin-bottom: 10px;
}

.report-callout p,
.report-section li,
.markdown-body {
  color: var(--ink-muted);
  line-height: 1.8;
}

.report-section ul {
  margin: 0;
  padding-left: 18px;
}

.markdown-body :deep(p),
.markdown-body :deep(li) {
  margin: 0 0 8px;
}

.raw-json {
  white-space: pre-wrap;
  color: var(--ink-muted);
}
</style>
