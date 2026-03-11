<script setup lang="ts">
defineProps<{
  status?: string
  title: string
  description: string
  bullets: string[]
  note?: string
}>()
</script>

<template>
  <section class="placeholder-panel">
    <span v-if="status" class="status-badge">{{ status }}</span>
    <h2>{{ title }}</h2>
    <p class="placeholder-description">{{ description }}</p>

    <ul class="placeholder-list">
      <li v-for="bullet in bullets" :key="bullet">{{ bullet }}</li>
    </ul>

    <p v-if="note" class="placeholder-note">{{ note }}</p>

    <div class="placeholder-actions">
      <slot name="actions" />
    </div>

    <div class="placeholder-extra">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.placeholder-panel {
  padding: 30px;
  border-radius: 32px;
  border: 1px solid rgba(18, 95, 117, 0.16);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.94), rgba(237, 247, 246, 0.92));
  box-shadow: var(--shadow-soft);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(21, 95, 150, 0.1);
  color: var(--secondary);
  font-size: 14px;
  font-weight: 700;
}

.placeholder-panel h2 {
  margin: 14px 0 10px;
  font-size: clamp(30px, 4vw, 42px);
  line-height: 1.15;
}

.placeholder-description,
.placeholder-note {
  margin: 0;
  color: var(--ink-muted);
  font-size: 18px;
  line-height: 1.75;
}

.placeholder-list {
  margin: 20px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 12px;
}

.placeholder-list li {
  position: relative;
  padding: 16px 18px 16px 48px;
  border-radius: 20px;
  background: rgba(250, 252, 252, 0.9);
  border: 1px solid rgba(18, 95, 117, 0.08);
  font-size: 17px;
  line-height: 1.7;
}

.placeholder-list li::before {
  content: '';
  position: absolute;
  top: 24px;
  left: 20px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand), var(--secondary));
}

.placeholder-note {
  margin-top: 18px;
}

.placeholder-actions {
  margin-top: 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.placeholder-extra {
  margin-top: 28px;
}

@media (max-width: 640px) {
  .placeholder-panel {
    padding: 22px;
    border-radius: 26px;
  }

  .placeholder-panel h2 {
    font-size: 28px;
  }
}
</style>
