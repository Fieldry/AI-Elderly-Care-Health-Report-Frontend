<script setup lang="ts">
import { useRouter } from 'vue-router'

defineProps<{
  title: string
  subtitle?: string
  showBack?: boolean
}>()

const router = useRouter()

function goBack() {
  router.back()
}
</script>

<template>
  <header class="page-header">
    <div class="header-left">
      <el-button
        v-if="showBack"
        :icon="'ArrowLeft'"
        circle
        @click="goBack"
        class="back-btn"
      />
      <div class="header-titles">
        <h1 class="header-title">{{ title }}</h1>
        <p v-if="subtitle" class="header-subtitle">{{ subtitle }}</p>
      </div>
    </div>
    <div class="header-right">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped lang="scss">
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.back-btn {
  width: 40px;
  height: 40px;

  &:hover {
    background: #f0f0f0;
  }
}

.header-titles {
  .header-title {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
    color: #1a1a2e;
  }

  .header-subtitle {
    margin: 4px 0 0;
    font-size: 14px;
    color: #909399;
  }
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
