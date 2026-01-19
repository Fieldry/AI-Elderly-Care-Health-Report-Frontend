<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  disabled?: boolean
  placeholder?: string
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'send', message: string): void
  (e: 'voice-start'): void
  (e: 'voice-end'): void
}>()

const inputText = ref('')
const isVoiceMode = ref(false)
const isRecording = ref(false)

// 是否可以发送
const canSend = computed(() => {
  return inputText.value.trim().length > 0 && !props.disabled && !props.loading
})

// 发送消息
function handleSend() {
  if (!canSend.value) return

  emit('send', inputText.value.trim())
  inputText.value = ''
}

// 按键处理
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSend()
  }
}

// 切换语音模式
function toggleVoiceMode() {
  isVoiceMode.value = !isVoiceMode.value
}

// 开始录音
function startRecording() {
  isRecording.value = true
  emit('voice-start')
}

// 结束录音
function stopRecording() {
  isRecording.value = false
  emit('voice-end')
}
</script>

<template>
  <div class="input-area">
    <div class="input-wrapper">
      <!-- 文本输入区 -->
      <div v-if="!isVoiceMode" class="text-input-container">
        <el-input
          v-model="inputText"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 4 }"
          :placeholder="placeholder || '请输入您的回答...'"
          :disabled="disabled || loading"
          @keydown="handleKeydown"
          resize="none"
          class="message-input"
        />
      </div>

      <!-- 语音输入区 -->
      <div v-else class="voice-input-container">
        <div
          class="voice-button"
          :class="{ 'voice-button--recording': isRecording }"
          @mousedown="startRecording"
          @mouseup="stopRecording"
          @mouseleave="stopRecording"
          @touchstart.prevent="startRecording"
          @touchend.prevent="stopRecording"
        >
          <el-icon :size="32">
            <Microphone />
          </el-icon>
          <span v-if="!isRecording">按住说话</span>
          <span v-else class="recording-text">正在录音...</span>
        </div>
      </div>
    </div>

    <!-- 操作按钮区 -->
    <div class="action-buttons">
      <!-- 语音/文本切换 -->
      <el-tooltip :content="isVoiceMode ? '切换到文本输入' : '切换到语音输入'" placement="top">
        <el-button
          :icon="isVoiceMode ? 'EditPen' : 'Microphone'"
          circle
          @click="toggleVoiceMode"
          class="mode-toggle"
        />
      </el-tooltip>

      <!-- 发送按钮 -->
      <el-button
        v-if="!isVoiceMode"
        type="primary"
        :icon="loading ? 'Loading' : 'Promotion'"
        :disabled="!canSend"
        :loading="loading"
        @click="handleSend"
        class="send-button"
      >
        {{ loading ? '处理中' : '发送' }}
      </el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.input-area {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  padding: 16px 20px;
  background: #fff;
  border-top: 1px solid #eee;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.04);
}

.input-wrapper {
  flex: 1;
  min-width: 0;
}

.text-input-container {
  .message-input {
    :deep(.el-textarea__inner) {
      border-radius: 20px;
      padding: 12px 18px;
      font-size: 15px;
      line-height: 1.5;
      border: 2px solid #e8e8e8;
      transition: all 0.3s ease;

      &:focus {
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      }
    }
  }
}

.voice-input-container {
  display: flex;
  justify-content: center;
}

.voice-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  cursor: pointer;
  transition: all 0.3s ease;
  user-select: none;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
  }

  &:active, &--recording {
    transform: scale(0.95);
    background: linear-gradient(135deg, #f5576c 0%, #f093fb 100%);
  }

  span {
    margin-top: 8px;
    font-size: 14px;
  }

  .recording-text {
    animation: pulse 1s infinite;
  }
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mode-toggle {
  width: 44px;
  height: 44px;
  border-radius: 50%;

  &:hover {
    background: #f0f0f0;
  }
}

.send-button {
  height: 44px;
  padding: 0 24px;
  border-radius: 22px;
  font-size: 15px;
  font-weight: 500;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;

  &:hover:not(:disabled) {
    background: linear-gradient(135deg, #5a6fd6 0%, #6a4190 100%);
  }

  &:disabled {
    opacity: 0.5;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
