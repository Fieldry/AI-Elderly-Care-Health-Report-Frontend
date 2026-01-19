<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'
import { formatTime } from '@/utils/formatTime'

const props = defineProps<{
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  isStreaming?: boolean
  agentName?: string
}>()

// 初始化 Markdown 渲染器
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true
})

// 渲染 Markdown 内容
const renderedContent = computed(() => {
  if (props.role === 'user') {
    // 用户消息不渲染 Markdown
    return props.content
  }
  return md.render(props.content || '')
})

// 格式化时间
const formattedTime = computed(() => {
  return formatTime(props.timestamp)
})

// 气泡类名
const bubbleClass = computed(() => {
  return {
    'message-bubble': true,
    [`message-bubble--${props.role}`]: true,
    'message-bubble--streaming': props.isStreaming
  }
})
</script>

<template>
  <div :class="bubbleClass">
    <div class="message-avatar">
      <div v-if="role === 'user'" class="avatar avatar--user">
        <el-icon><User /></el-icon>
      </div>
      <div v-else class="avatar avatar--assistant">
        <el-icon><ChatDotRound /></el-icon>
      </div>
    </div>

    <div class="message-content">
      <div v-if="agentName" class="message-agent">
        <el-tag size="small" type="info">{{ agentName }}</el-tag>
      </div>

      <div
        v-if="role === 'user'"
        class="message-text"
      >
        {{ content }}
      </div>
      <div
        v-else
        class="message-text message-text--markdown"
        v-html="renderedContent"
      />

      <div v-if="isStreaming" class="message-cursor">
        <span class="cursor-blink">▊</span>
      </div>

      <div class="message-time">
        {{ formattedTime }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.message-bubble {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  max-width: 85%;
  animation: fadeIn 0.3s ease;

  &--user {
    flex-direction: row-reverse;
    margin-left: auto;

    .message-content {
      align-items: flex-end;
    }

    .message-text {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
      border-radius: 20px 20px 4px 20px;
    }
  }

  &--assistant {
    flex-direction: row;
    margin-right: auto;

    .message-text {
      background: #f7f8fa;
      color: #2c3e50;
      border-radius: 20px 20px 20px 4px;

      &--markdown {
        :deep(h1), :deep(h2), :deep(h3) {
          margin: 16px 0 8px;
          font-weight: 600;
          color: #1a1a2e;
        }

        :deep(h1) { font-size: 1.4em; }
        :deep(h2) { font-size: 1.2em; }
        :deep(h3) { font-size: 1.1em; }

        :deep(ul), :deep(ol) {
          padding-left: 20px;
          margin: 8px 0;
        }

        :deep(li) {
          margin: 4px 0;
          line-height: 1.6;
        }

        :deep(p) {
          margin: 8px 0;
          line-height: 1.7;
        }

        :deep(blockquote) {
          border-left: 3px solid #667eea;
          padding-left: 12px;
          margin: 12px 0;
          color: #666;
          font-style: italic;
        }

        :deep(code) {
          background: #e8e8e8;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.9em;
        }
      }
    }
  }

  &--streaming {
    .message-text {
      min-height: 24px;
    }
  }
}

.message-avatar {
  flex-shrink: 0;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;

  &--user {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #fff;
  }

  &--assistant {
    background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
    color: #fff;
  }
}

.message-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.message-agent {
  margin-bottom: 4px;
}

.message-text {
  padding: 14px 18px;
  line-height: 1.6;
  font-size: 15px;
  word-wrap: break-word;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.message-cursor {
  display: inline;
}

.cursor-blink {
  animation: blink 1s infinite;
  color: #667eea;
}

.message-time {
  font-size: 12px;
  color: #999;
  padding: 0 4px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
</style>
