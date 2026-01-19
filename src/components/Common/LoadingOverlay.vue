<script setup lang="ts">
defineProps<{
  visible: boolean
  text?: string
}>()
</script>

<template>
  <Transition name="fade">
    <div v-if="visible" class="loading-overlay">
      <div class="loading-content">
        <div class="loading-spinner">
          <div class="spinner-ring"></div>
          <div class="spinner-ring"></div>
          <div class="spinner-ring"></div>
        </div>
        <p v-if="text" class="loading-text">{{ text }}</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.loading-spinner {
  position: relative;
  width: 60px;
  height: 60px;
}

.spinner-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 3px solid transparent;

  &:nth-child(1) {
    border-top-color: #667eea;
    animation: spin 1s ease-in-out infinite;
  }

  &:nth-child(2) {
    border-right-color: #764ba2;
    animation: spin 1.2s ease-in-out infinite reverse;
  }

  &:nth-child(3) {
    width: 70%;
    height: 70%;
    top: 15%;
    left: 15%;
    border-bottom-color: #11998e;
    animation: spin 0.8s ease-in-out infinite;
  }
}

.loading-text {
  margin: 0;
  font-size: 16px;
  color: #606266;
  font-weight: 500;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
