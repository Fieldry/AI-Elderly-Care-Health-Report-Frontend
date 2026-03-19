<script setup lang="ts">
import { computed } from 'vue'

import EmptyStateCard from '@/components/EmptyStateCard.vue'
import { groupProfileEntries } from '@/utils/profile'

const props = withDefaults(
  defineProps<{
    profile: Record<string, unknown> | null | undefined
    title?: string
    emptyTitle?: string
    emptyDescription?: string
  }>(),
  {
    title: '结构化画像',
    emptyTitle: '画像尚未形成',
    emptyDescription: '请先完成对话采集或补全信息，系统才能展示可读的画像摘要。'
  }
)

const groupedEntries = computed(() => groupProfileEntries(props.profile || {}))
</script>

<template>
  <section class="surface-card panel-card">
    <header class="panel-card__header">
      <h3>{{ title }}</h3>
    </header>

    <div v-if="groupedEntries.length > 0" class="panel-card__body scroll-panel">
      <section v-for="group in groupedEntries" :key="group.group" class="profile-group">
        <p class="profile-group__title">{{ group.group }}</p>
        <dl class="profile-grid">
          <div v-for="entry in group.entries" :key="entry.key" class="profile-grid__item">
            <dt>{{ entry.label }}</dt>
            <dd>{{ entry.value }}</dd>
          </div>
        </dl>
      </section>
    </div>

    <EmptyStateCard v-else :title="emptyTitle" :description="emptyDescription" />
  </section>
</template>

<style scoped>
.panel-card {
  padding: 22px;
}

.panel-card__header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: var(--ink-strong);
}

.panel-card__body {
  margin-top: 18px;
  max-height: 24rem;
  overflow: auto;
  padding-right: 6px;
}

.profile-group + .profile-group {
  margin-top: 18px;
}

.profile-group__title {
  margin: 0 0 12px;
  color: var(--brand-strong);
  font-weight: 700;
}

.profile-grid {
  display: grid;
  gap: 10px;
  margin: 0;
}

.profile-grid__item {
  display: grid;
  gap: 4px;
  padding: 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.profile-grid__item dt {
  color: var(--ink-muted);
  font-size: 0.92rem;
}

.profile-grid__item dd {
  margin: 0;
  color: var(--ink-strong);
  font-weight: 600;
  line-height: 1.5;
}
</style>
