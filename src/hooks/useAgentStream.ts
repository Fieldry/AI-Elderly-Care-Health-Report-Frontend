import { ref, onUnmounted } from 'vue'
import { useChatSessionStore } from '@/stores/chatSession'
import { useReportResultStore } from '@/stores/reportResult'
import { streamReport, type AgentStatus } from '@/api/report'
import type { UserProfile } from '@/stores/userProfile'

export interface UseAgentStreamOptions {
  typingSpeed?: number  // 打字机效果的速度 (毫秒/字符)
  onComplete?: () => void
  onError?: (error: Error) => void
}

export function useAgentStream(options: UseAgentStreamOptions = {}) {
  const {
    typingSpeed = 30,
    onComplete,
    onError
  } = options

  const chatStore = useChatSessionStore()
  const reportStore = useReportResultStore()

  const isStreaming = ref(false)
  const streamedContent = ref('')
  const currentMessageId = ref<string | null>(null)
  let cancelStream: (() => void) | null = null
  let typingTimer: ReturnType<typeof setTimeout> | null = null
  let pendingChunks: string[] = []
  let isTyping = false

  // 打字机效果处理
  function processTypingQueue() {
    if (isTyping || pendingChunks.length === 0) return

    isTyping = true
    const chunk = pendingChunks.shift()!
    let index = 0

    function typeNextChar() {
      if (index < chunk.length) {
        streamedContent.value += chunk[index]
        if (currentMessageId.value) {
          chatStore.updateMessageContent(currentMessageId.value, chunk[index], true)
        }
        reportStore.appendMarkdownContent(chunk[index])
        index++
        typingTimer = setTimeout(typeNextChar, typingSpeed)
      } else {
        isTyping = false
        processTypingQueue()
      }
    }

    typeNextChar()
  }

  // 开始流式生成报告
  async function startReportStream(profile: UserProfile) {
    isStreaming.value = true
    streamedContent.value = ''
    pendingChunks = []

    chatStore.setGeneratingReport(true)
    reportStore.setStatus('generating')
    reportStore.setMarkdownContent('')

    // 添加 AI 消息占位
    const messageId = chatStore.addMessage({
      role: 'assistant',
      content: '',
      isStreaming: true
    })
    currentMessageId.value = messageId

    try {
      cancelStream = await streamReport(
        profile,
        // onChunk
        (chunk: string) => {
          pendingChunks.push(chunk)
          processTypingQueue()
        },
        // onAgentStatus
        (status: AgentStatus) => {
          chatStore.updateAgentState(status.agent, status.status, status.message)
        },
        // onComplete
        (report) => {
          // 等待打字机效果完成
          const waitForTyping = () => {
            if (pendingChunks.length > 0 || isTyping) {
              setTimeout(waitForTyping, 100)
            } else {
              finishStream()
              reportStore.setReportData(report)
              onComplete?.()
            }
          }
          waitForTyping()
        },
        // onError
        (error: Error) => {
          finishStream()
          reportStore.setStatus('error', error.message)
          onError?.(error)
        }
      )
    } catch (error) {
      finishStream()
      reportStore.setStatus('error', (error as Error).message)
      onError?.(error as Error)
    }
  }

  // 结束流式输出
  function finishStream() {
    isStreaming.value = false
    if (currentMessageId.value) {
      chatStore.finishStreamingMessage(currentMessageId.value)
    }
    chatStore.setGeneratingReport(false)
    currentMessageId.value = null

    if (typingTimer) {
      clearTimeout(typingTimer)
      typingTimer = null
    }
  }

  // 取消流式输出
  function cancelStreamOutput() {
    if (cancelStream) {
      cancelStream()
      cancelStream = null
    }
    finishStream()
  }

  // 模拟流式输出 (用于演示)
  function simulateStream(content: string) {
    isStreaming.value = true
    streamedContent.value = ''

    const messageId = chatStore.addMessage({
      role: 'assistant',
      content: '',
      isStreaming: true
    })
    currentMessageId.value = messageId

    let index = 0
    function typeNext() {
      if (index < content.length) {
        streamedContent.value += content[index]
        chatStore.updateMessageContent(messageId, content[index], true)
        index++
        typingTimer = setTimeout(typeNext, typingSpeed)
      } else {
        finishStream()
        onComplete?.()
      }
    }
    typeNext()
  }

  // 清理
  onUnmounted(() => {
    cancelStreamOutput()
  })

  return {
    isStreaming,
    streamedContent,
    startReportStream,
    cancelStreamOutput,
    simulateStream
  }
}
