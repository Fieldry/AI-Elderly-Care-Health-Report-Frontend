// src/composables/useSpeechSynthesis.ts
import { ref, shallowRef, readonly } from 'vue'

export interface UseSpeechSynthesisOptions {
  /** 默认语言，默认 'zh-CN' */
  lang?: string
  /** 默认语速，范围 0.1 ~ 10，默认 0.9（稍慢，适合老年用户） */
  rate?: number
  /** 默认音调，范围 0 ~ 2，默认 1 */
  pitch?: number
  /** 默认音量，范围 0 ~ 1，默认 1 */
  volume?: number
  /** 优先选择中文语音作为浏览器降级朗读音色 */
  preferChinese?: boolean
  /** 可选的高质量 TTS 代理地址；不配置时直接使用浏览器内置朗读 */
  ttsEndpoint?: string
}

// 固定的高质量女声音色（Edge TTS 晓晓）
const DEFAULT_EDGE_VOICE = 'zh-CN-XiaoxiaoNeural'

function normalizeSpeechText(text: string) {
  return (text || '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/^\s*(?:[-*+]|>\s*|\d+[.)])\s*/gm, '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[#*_`~]+/g, '')
    .replace(/[（(【\[][^）)\]】\n]{1,40}[）)\]】]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// 调用 TTS 代理服务（如果代理失效，会降级到 Web Speech API）
async function getAudioBlobFromTTS(text: string, endpoint: string): Promise<Blob | null> {
  const ssml = `
    <speak version="1.0" xmlns="https://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
      <voice name="${DEFAULT_EDGE_VOICE}">${text}</voice>
    </speak>
  `
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/ssml+xml' },
      body: ssml,
    })
    if (!response.ok) return null
    return await response.blob()
  } catch (error) {
    console.error('TTS 代理调用失败，将降级到 Web Speech API:', error)
    return null
  }
}

export function useSpeechSynthesis(options: UseSpeechSynthesisOptions = {}) {
  const {
    lang = 'zh-CN',
    rate = 0.9,
    pitch = 1,
    volume = 1,
    preferChinese = true,
    ttsEndpoint = import.meta.env.VITE_TTS_ENDPOINT || '/tts/synthesize',
  } = options

  // 状态
  const isSupported = ref(typeof window !== 'undefined' && 'speechSynthesis' in window)
  const isSpeaking = ref(false)
  const isPaused = ref(false)
  const isPending = ref(false)
  const errorMessage = ref<string | null>(null)
  const currentText = ref('')
  const availableVoices = shallowRef<SpeechSynthesisVoice[]>([])
  const selectedVoice = shallowRef<SpeechSynthesisVoice | null>(null)

  // 内部变量
  let currentUtterance: SpeechSynthesisUtterance | null = null
  let currentAudio: HTMLAudioElement | null = null   // 用于 Edge TTS 播放
  let voiceLoadPromise: Promise<void> | null = null

  // 确保 voices 已加载（仅用于降级方案）
  function ensureVoicesLoaded(): Promise<void> {
    if (!isSupported.value) {
      return Promise.reject(new Error('浏览器不支持语音合成'))
    }
    if (availableVoices.value.length) {
      return Promise.resolve()
    }
    if (voiceLoadPromise) {
      return voiceLoadPromise
    }
    voiceLoadPromise = new Promise((resolve) => {
      const voices = window.speechSynthesis.getVoices()
      if (voices.length) {
        updateVoicesList(voices)
        resolve()
      } else {
        const fallbackTimer = window.setTimeout(() => {
          updateVoicesList(window.speechSynthesis.getVoices())
          resolve()
        }, 800)
        window.speechSynthesis.onvoiceschanged = () => {
          window.clearTimeout(fallbackTimer)
          updateVoicesList(window.speechSynthesis.getVoices())
          resolve()
        }
      }
    })
    return voiceLoadPromise
  }

  function updateVoicesList(voices: SpeechSynthesisVoice[]) {
    availableVoices.value = voices
    // 自动选择一个中文女声作为降级备用
    const chineseVoice = voices.find(v => v.lang.startsWith('zh') && (v.name.includes('Female') || v.name.includes('Xiaoxiao')))
    selectedVoice.value = preferChinese
      ? chineseVoice || voices.find(v => v.lang.startsWith('zh')) || voices[0] || null
      : voices[0] || null
  }

  // 停止所有播放（Edge TTS + Web Speech）
  function stopSpeaking() {
    // 停止 Edge TTS 音频
    if (currentAudio) {
      currentAudio.pause()
      if (currentAudio.src) {
        URL.revokeObjectURL(currentAudio.src)
      }
      currentAudio = null
    }
    // 停止 Web Speech API
    if (isSupported.value) {
      window.speechSynthesis.cancel()
    }
    if (currentUtterance) {
      currentUtterance.onend = null
      currentUtterance.onerror = null
      currentUtterance = null
    }
    // 重置所有状态
    isSpeaking.value = false
    isPaused.value = false
    isPending.value = false
    currentText.value = ''
    errorMessage.value = null
  }

  function pauseSpeaking() {
    if (!isSpeaking.value) return
    // 如果是 Web Speech API 且支持暂停
    if (currentUtterance && isSupported.value && 'pause' in window.speechSynthesis) {
      window.speechSynthesis.pause()
      isPaused.value = true
    } else if (currentAudio) {
      // Edge TTS 不支持真正的暂停，这里简单停止
      stopSpeaking()
    }
  }

  function resumeSpeaking() {
    if (!isPaused.value) return
    if (currentUtterance && isSupported.value && 'resume' in window.speechSynthesis) {
      window.speechSynthesis.resume()
      isPaused.value = false
    }
  }

  // 主要朗读函数
  async function speak(text: string) {
    const normalizedText = normalizeSpeechText(text)
    if (!normalizedText) {
      errorMessage.value = '没有可朗读的文本'
      return
    }

    // 停止当前正在播放的内容
    stopSpeaking()

    // 1. 优先尝试后端 TTS 代理，使用晓晓音色；失败后再降级浏览器语音
    const audioBlob = ttsEndpoint ? await getAudioBlobFromTTS(normalizedText, ttsEndpoint) : null
    if (audioBlob) {
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      currentAudio = audio
      currentText.value = normalizedText

      // 设置状态
      isSpeaking.value = true
      isPaused.value = false
      isPending.value = false
      errorMessage.value = null

      // 事件监听
      audio.onended = () => {
        if (currentAudio === audio) {
          URL.revokeObjectURL(audioUrl)
          currentAudio = null
          isSpeaking.value = false
          isPending.value = false
          currentText.value = ''
        }
      }
      audio.onerror = (err) => {
        console.error('TTS 音频播放错误:', err)
        URL.revokeObjectURL(audioUrl)
        if (currentAudio === audio) {
          currentAudio = null
        }
        errorMessage.value = '语音播放失败，尝试使用浏览器内置语音'
        isSpeaking.value = false
        isPending.value = false
        currentText.value = ''
        // 降级：尝试 Web Speech API
        speakWithWebSpeech(normalizedText)
      }

      await audio.play().catch(err => {
        console.error('audio.play() 失败，将降级到 Web Speech API:', err)
        URL.revokeObjectURL(audioUrl)
        if (currentAudio === audio) {
          currentAudio = null
        }
        isSpeaking.value = false
        isPending.value = false
        currentText.value = ''
        return speakWithWebSpeech(normalizedText)
      })
      return
    }

    // 2. 降级方案：使用 Web Speech API
    speakWithWebSpeech(normalizedText)
  }

  async function speakWithWebSpeech(text: string) {
    if (!isSupported.value) {
      errorMessage.value = '当前浏览器不支持语音合成'
      throw new Error(errorMessage.value)
    }

    await ensureVoicesLoaded()

    const utterance = new SpeechSynthesisUtterance(text)
    currentUtterance = utterance
    currentText.value = text

    // 应用选项
    const finalVoice = selectedVoice.value
    if (finalVoice) utterance.voice = finalVoice
    utterance.lang = lang
    utterance.rate = rate
    utterance.pitch = pitch
    utterance.volume = volume

    utterance.onstart = () => {
      isSpeaking.value = true
      isPaused.value = false
      isPending.value = false
      errorMessage.value = null
    }
    utterance.onend = () => {
      isSpeaking.value = false
      isPaused.value = false
      isPending.value = false
      if (currentUtterance === utterance) {
        currentUtterance = null
        currentText.value = ''
      }
    }
    utterance.onerror = (event) => {
      errorMessage.value = `语音合成失败: ${event.error || '未知错误'}`
      isSpeaking.value = false
      isPaused.value = false
      isPending.value = false
      if (currentUtterance === utterance) {
        currentUtterance = null
      }
    }

    setTimeout(() => {
      if (currentUtterance === utterance) {
        window.speechSynthesis.speak(utterance)
        isPending.value = true
      }
    }, 0)
  }

  function togglePause() {
    if (!isSpeaking.value) return
    if (isPaused.value) resumeSpeaking()
    else pauseSpeaking()
  }

  async function reloadVoices() {
    if (!isSupported.value) return
    voiceLoadPromise = null
    await ensureVoicesLoaded()
  }

  return {
    // 只读状态
    isSupported: readonly(isSupported),
    isSpeaking: readonly(isSpeaking),
    isPaused: readonly(isPaused),
    isPending: readonly(isPending),
    errorMessage: readonly(errorMessage),
    currentText: readonly(currentText),
    availableVoices: readonly(availableVoices),
    selectedVoice: readonly(selectedVoice),

    // 方法
    speak,
    stop: stopSpeaking,
    pause: pauseSpeaking,
    resume: resumeSpeaking,
    togglePause,
    reloadVoices,
  }
}
