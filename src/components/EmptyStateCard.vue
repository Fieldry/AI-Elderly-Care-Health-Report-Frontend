<script setup lang="ts">
defineProps<{
  title: string
  description: string
}>()
</script>

<template>
  <div class="surface-card empty-state-card">
    <strong>{{ title }}</strong>
    <p>{{ description }}</p>
  </div>
</template>

<style scoped>
.empty-state-card {
  padding: 22px;
  border-style: dashed;
}

.empty-state-card strong {
  display: block;
  color: var(--ink-strong);
  margin-bottom: 10px;
}

.empty-state-card p {
  margin: 0;
  color: var(--ink-muted);
  line-height: 1.7;
}
</style>
