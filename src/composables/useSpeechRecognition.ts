import { computed, onBeforeUnmount, ref } from 'vue'

interface BrowserSpeechRecognitionAlternative {
  transcript: string
}

interface BrowserSpeechRecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: BrowserSpeechRecognitionAlternative
}

interface BrowserSpeechRecognitionResultList {
  readonly length: number
  [index: number]: BrowserSpeechRecognitionResult
}

interface BrowserSpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: BrowserSpeechRecognitionResultList
}

interface BrowserSpeechRecognitionErrorEvent extends Event {
  readonly error: string
}

interface BrowserSpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onstart: ((this: BrowserSpeechRecognition, ev: Event) => unknown) | null
  onend: ((this: BrowserSpeechRecognition, ev: Event) => unknown) | null
  onresult: ((this: BrowserSpeechRecognition, ev: BrowserSpeechRecognitionEvent) => unknown) | null
  onerror: ((this: BrowserSpeechRecognition, ev: BrowserSpeechRecognitionErrorEvent) => unknown) | null
}

interface BrowserSpeechRecognitionConstructor {
  new (): BrowserSpeechRecognition
}

interface SpeechWindow extends Window {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
}

interface UseSpeechRecognitionOptions {
  lang?: string
  onTranscript?: (value: string) => void
}

function resolveRecognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') {
    return null
  }

  const speechWindow = window as SpeechWindow
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null
}

function formatRecognitionError(error: string): string {
  const map: Record<string, string> = {
    'not-allowed': '未获得麦克风权限，请允许浏览器访问麦克风。',
    'service-not-allowed': '当前浏览器环境不允许使用语音识别服务。',
    'audio-capture': '未检测到可用麦克风设备。',
    'network': '语音识别服务连接失败，请稍后重试。',
    'no-speech': '没有识别到语音，请重新说一遍。',
    'aborted': '语音输入已取消。'
  }

  return map[error] || '语音输入失败，请稍后重试。'
}

function appendTranscript(baseText: string, speechText: string): string {
  const normalizedSpeech = speechText.trim()
  if (!normalizedSpeech) {
    return baseText
  }

  const normalizedBase = baseText.trimEnd()
  if (!normalizedBase) {
    return normalizedSpeech
  }

  const separator = /[，。！？；：,.!?;:]$/.test(normalizedBase) ? '' : ' '
  return `${normalizedBase}${separator}${normalizedSpeech}`
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const isListening = ref(false)
  const errorMessage = ref('')
  const baseText = ref('')

  const Recognition = resolveRecognitionConstructor()
  const isSupported = computed(() => Recognition !== null)

  let recognition: BrowserSpeechRecognition | null = null

  if (Recognition) {
    recognition = new Recognition()
    recognition.lang = options.lang || 'zh-CN'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      errorMessage.value = ''
      isListening.value = true
    }

    recognition.onend = () => {
      isListening.value = false
    }

    recognition.onerror = (event) => {
      if (event.error !== 'aborted') {
        errorMessage.value = formatRecognitionError(event.error)
      }
    }

    recognition.onresult = (event) => {
      let mergedTranscript = ''

      for (let i = 0; i < event.results.length; i += 1) {
        mergedTranscript += event.results[i][0]?.transcript || ''
      }

      if (!mergedTranscript.trim()) {
        return
      }

      const nextText = appendTranscript(baseText.value, mergedTranscript)
      options.onTranscript?.(nextText)
    }
  }

  function start(initialText = '') {
    if (!recognition) {
      errorMessage.value = '当前浏览器暂不支持语音输入，请改用支持语音识别的浏览器。'
      return
    }

    baseText.value = initialText
    errorMessage.value = ''

    try {
      recognition.start()
    } catch {
      errorMessage.value = '语音输入已在进行中，请先停止后再试。'
    }
  }

  function stop() {
    recognition?.stop()
  }

  function abort() {
    recognition?.abort()
  }

  onBeforeUnmount(() => {
    abort()
  })

  return {
    isListening,
    isSupported,
    errorMessage,
    start,
    stop,
    abort
  }
}
