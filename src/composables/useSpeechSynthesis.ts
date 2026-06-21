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

const TTS_CHUNK_LIMIT = 180

function escapeSsmlText(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function splitSpeechText(text: string) {
  const chunks: string[] = []
  const sentences = text
    .split(/(?<=[。！？；.!?;])\s*/)
    .map((item) => item.trim())
    .filter(Boolean)

  let current = ''
  for (const sentence of sentences) {
    if (sentence.length > TTS_CHUNK_LIMIT) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      for (let index = 0; index < sentence.length; index += TTS_CHUNK_LIMIT) {
        chunks.push(sentence.slice(index, index + TTS_CHUNK_LIMIT))
      }
      continue
    }

    const next = current ? `${current}${sentence}` : sentence
    if (next.length > TTS_CHUNK_LIMIT && current) {
      chunks.push(current)
      current = sentence
    } else {
      current = next
    }
  }

  if (current) {
    chunks.push(current)
  }

  return chunks.length > 0 ? chunks : [text]
}

// 调用 TTS 代理服务（如果代理失效，会降级到 Web Speech API）
async function getAudioBlobFromTTS(
  text: string,
  endpoint: string,
  signal?: AbortSignal
): Promise<Blob | null> {
  const ssml = `
    <speak version="1.0" xmlns="https://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
      <voice name="${DEFAULT_EDGE_VOICE}">${escapeSsmlText(text)}</voice>
    </speak>
  `
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/ssml+xml' },
      body: ssml,
      signal,
    })
    if (!response.ok) return null
    return await response.blob()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null
    }
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
  let currentAudioUrl = ''
  let currentAbortController: AbortController | null = null
  let playbackVersion = 0
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
    playbackVersion += 1
    currentAbortController?.abort()
    currentAbortController = null

    // 停止 Edge TTS 音频
    if (currentAudio) {
      currentAudio.pause()
      currentAudio = null
    }
    if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl)
      currentAudioUrl = ''
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
    const activeVersion = playbackVersion

    // 1. 优先尝试后端 TTS 代理，使用晓晓音色；失败后再降级浏览器语音
    if (ttsEndpoint) {
      currentText.value = normalizedText
      errorMessage.value = null

      const chunks = splitSpeechText(normalizedText)
      let nextBlobPromise: Promise<Blob | null> | null = null

      try {
        for (let index = 0; index < chunks.length; index += 1) {
          if (activeVersion !== playbackVersion) {
            return
          }

          isPending.value = true
          let audioBlob: Blob | null
          if (nextBlobPromise) {
            audioBlob = await nextBlobPromise
          } else {
            currentAbortController = new AbortController()
            audioBlob = await getAudioBlobFromTTS(chunks[index], ttsEndpoint, currentAbortController.signal)
          }
          currentAbortController = null

          if (activeVersion !== playbackVersion) {
            return
          }

          if (!audioBlob) {
            await speakWithWebSpeech(normalizedText, activeVersion)
            return
          }

          if (index + 1 < chunks.length) {
            const controller = new AbortController()
            currentAbortController = controller
            nextBlobPromise = getAudioBlobFromTTS(chunks[index + 1], ttsEndpoint, controller.signal)
          } else {
            nextBlobPromise = null
          }

          const played = await playAudioBlob(audioBlob, activeVersion)
          if (!played) {
            return
          }
        }

        if (activeVersion === playbackVersion) {
          isSpeaking.value = false
          isPending.value = false
          currentText.value = ''
        }
        return
      } catch (error) {
        if (activeVersion !== playbackVersion) {
          return
        }
        console.error('TTS 音频播放错误:', error)
        errorMessage.value = '语音播放失败，尝试使用浏览器内置语音'
        isSpeaking.value = false
        isPending.value = false
        await speakWithWebSpeech(normalizedText, activeVersion)
        return
      }
    }

    // 2. 降级方案：使用 Web Speech API
    await speakWithWebSpeech(normalizedText, activeVersion)
  }

  function playAudioBlob(audioBlob: Blob, activeVersion: number) {
    return new Promise<boolean>((resolve, reject) => {
      if (activeVersion !== playbackVersion) {
        resolve(false)
        return
      }

      if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl)
      }
      const audioUrl = URL.createObjectURL(audioBlob)
      currentAudioUrl = audioUrl
      const audio = new Audio(audioUrl)
      currentAudio = audio

      const cleanup = () => {
        if (currentAudio === audio) {
          currentAudio = null
        }
        if (currentAudioUrl === audioUrl) {
          URL.revokeObjectURL(audioUrl)
          currentAudioUrl = ''
        }
      }

      audio.onended = () => {
        cleanup()
        if (activeVersion === playbackVersion) {
          isSpeaking.value = false
          isPending.value = false
        }
        resolve(activeVersion === playbackVersion)
      }
      audio.onerror = (error) => {
        cleanup()
        reject(error)
      }
      audio.onpause = () => {
        cleanup()
        resolve(false)
      }

      isSpeaking.value = true
      isPaused.value = false
      isPending.value = false
      audio.play().catch((error) => {
        cleanup()
        reject(error)
      })
    })
  }

  async function speakWithWebSpeech(text: string, activeVersion = playbackVersion) {
    if (!isSupported.value) {
      errorMessage.value = '当前浏览器不支持语音合成'
      throw new Error(errorMessage.value)
    }

    await ensureVoicesLoaded()
    if (activeVersion !== playbackVersion) {
      return
    }

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
