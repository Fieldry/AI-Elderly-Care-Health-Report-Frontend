import { computed, onBeforeUnmount, ref } from 'vue'

interface AudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext
}

interface SpeechSocketMessage {
  type: string
  text?: string
  isFinal?: boolean
  event?: string
  message?: string
}

interface UseGoogleStreamingSpeechOptions {
  lang?: string
  onTranscript?: (value: string) => void
  onClosed?: () => void
}

const TARGET_SAMPLE_RATE = 16_000

function resolveAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') {
    return null
  }

  const audioWindow = window as Window & AudioWindow
  return window.AudioContext || audioWindow.webkitAudioContext || null
}

function joinTranscript(left: string, right: string) {
  const normalizedRight = right.trim()
  if (!normalizedRight) {
    return left.trimEnd()
  }

  const normalizedLeft = left.trimEnd()
  if (!normalizedLeft) {
    return normalizedRight
  }

  const separator = /[，。！？；：,.!?;:]$/.test(normalizedLeft) ? '' : ' '
  return `${normalizedLeft}${separator}${normalizedRight}`
}

function formatTranscript(baseText: string, finalText: string, interimText: string) {
  return joinTranscript(joinTranscript(baseText, finalText), interimText)
}

function floatToInt16Sample(value: number) {
  const clamped = Math.max(-1, Math.min(1, value))
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
}

function resampleToPcm16(input: Float32Array, sourceSampleRate: number) {
  if (!input.length) {
    return new Int16Array(0)
  }

  if (sourceSampleRate === TARGET_SAMPLE_RATE) {
    const direct = new Int16Array(input.length)
    for (let index = 0; index < input.length; index += 1) {
      direct[index] = floatToInt16Sample(input[index])
    }
    return direct
  }

  const sampleRateRatio = sourceSampleRate / TARGET_SAMPLE_RATE
  const targetLength = Math.max(1, Math.round(input.length / sampleRateRatio))
  const output = new Int16Array(targetLength)

  let sourceOffset = 0
  for (let targetOffset = 0; targetOffset < targetLength; targetOffset += 1) {
    const nextSourceOffset = Math.min(input.length, Math.round((targetOffset + 1) * sampleRateRatio))

    let total = 0
    let count = 0
    for (let index = sourceOffset; index < nextSourceOffset; index += 1) {
      total += input[index]
      count += 1
    }

    output[targetOffset] = floatToInt16Sample(count > 0 ? total / count : 0)
    sourceOffset = nextSourceOffset
  }

  return output
}

function resolveSocketUrl() {
  const explicitUrl = (import.meta.env.VITE_STT_WS_URL || '').trim()
  if (explicitUrl) {
    return explicitUrl
  }

  const backendOrigin = (import.meta.env.VITE_BACKEND_ORIGIN || '').trim()
  if (backendOrigin) {
    return `${backendOrigin.replace(/^http/i, 'ws')}/ws/stt`
  }

  if (typeof window === 'undefined') {
    return 'ws://127.0.0.1:8001/ws/stt'
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/stt`
}

function formatMediaError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return '未获得麦克风权限，请允许浏览器访问麦克风。'
    }
    if (error.name === 'NotFoundError') {
      return '未检测到可用麦克风设备。'
    }
    if (error.name === 'NotReadableError') {
      return '麦克风正在被其他程序占用，请关闭后重试。'
    }
  }

  return error instanceof Error ? error.message : '语音输入启动失败，请稍后重试。'
}

export function useGoogleStreamingSpeech(options: UseGoogleStreamingSpeechOptions = {}) {
  const isConnecting = ref(false)
  const isListening = ref(false)
  const errorMessage = ref('')
  const interimTranscript = ref('')
  const speechEvent = ref('')

  const AudioContextConstructor = resolveAudioContextConstructor()
  const isSupported = computed(() => {
    return (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      typeof WebSocket !== 'undefined' &&
      !!AudioContextConstructor &&
      !!navigator.mediaDevices?.getUserMedia
    )
  })

  let socket: WebSocket | null = null
  let mediaStream: MediaStream | null = null
  let audioContext: AudioContext | null = null
  let mediaSourceNode: MediaStreamAudioSourceNode | null = null
  let processorNode: ScriptProcessorNode | null = null
  let socketReady = false
  let stopRequested = false
  let baseText = ''
  let finalTranscript = ''

  function emitTranscript() {
    options.onTranscript?.(formatTranscript(baseText, finalTranscript, interimTranscript.value))
  }

  function resetTranscriptState(initialText = '') {
    baseText = initialText
    finalTranscript = ''
    interimTranscript.value = ''
    emitTranscript()
  }

  function teardownAudioGraph() {
    if (processorNode) {
      processorNode.onaudioprocess = null
      processorNode.disconnect()
      processorNode = null
    }

    if (mediaSourceNode) {
      mediaSourceNode.disconnect()
      mediaSourceNode = null
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop())
      mediaStream = null
    }

    if (audioContext) {
      void audioContext.close().catch(() => {})
      audioContext = null
    }
  }

  function finalizeInterimTranscript() {
    if (!interimTranscript.value.trim()) {
      return
    }

    finalTranscript = joinTranscript(finalTranscript, interimTranscript.value)
    interimTranscript.value = ''
    emitTranscript()
  }

  function handleSocketMessage(raw: MessageEvent<string>) {
    let payload: SpeechSocketMessage
    try {
      payload = JSON.parse(raw.data)
    } catch {
      return
    }

    if (payload.type === 'ready') {
      socketReady = true
      isConnecting.value = false
      isListening.value = true
      speechEvent.value = ''
      return
    }

    if (payload.type === 'speech_event') {
      speechEvent.value = payload.event || ''
      return
    }

    if (payload.type === 'transcript') {
      if (!payload.text) {
        return
      }

      if (payload.isFinal) {
        finalTranscript = joinTranscript(finalTranscript, payload.text)
        interimTranscript.value = ''
      } else {
        interimTranscript.value = payload.text.trim()
      }

      emitTranscript()
      return
    }

    if (payload.type === 'error') {
      errorMessage.value = payload.message || '语音识别服务异常，请稍后重试。'
      return
    }

    if (payload.type === 'closed') {
      if (stopRequested) {
        finalizeInterimTranscript()
      }

      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close()
      }
    }
  }

  function cleanupSocket(shouldClose = false) {
    socketReady = false

    if (!socket) {
      return
    }

    socket.onopen = null
    socket.onmessage = null
    socket.onerror = null
    socket.onclose = null

    if (shouldClose && socket.readyState !== WebSocket.CLOSED) {
      socket.close()
    }

    socket = null
  }

  function handleSocketClosed(unexpected: boolean) {
    teardownAudioGraph()
    cleanupSocket(false)

    isConnecting.value = false
    isListening.value = false
    speechEvent.value = ''

    if (unexpected && !errorMessage.value) {
      errorMessage.value = '语音识别连接已断开，请稍后重试。'
    }

    stopRequested = false
    options.onClosed?.()
  }

  async function setupAudioPipeline(stream: MediaStream) {
    if (!AudioContextConstructor) {
      throw new Error('当前浏览器不支持音频上下文，无法使用流式语音输入。')
    }

    audioContext = new AudioContextConstructor()
    await audioContext.resume()

    mediaSourceNode = audioContext.createMediaStreamSource(stream)
    processorNode = audioContext.createScriptProcessor(4096, 1, 1)

    processorNode.onaudioprocess = (event) => {
      if (!socket || socket.readyState !== WebSocket.OPEN || !socketReady || stopRequested) {
        return
      }

      const channelData = event.inputBuffer.getChannelData(0)
      const pcm16 = resampleToPcm16(channelData, audioContext?.sampleRate || TARGET_SAMPLE_RATE)
      if (!pcm16.length) {
        return
      }

      socket.send(pcm16.buffer.slice(0))
    }

    mediaSourceNode.connect(processorNode)
    processorNode.connect(audioContext.destination)
  }

  async function start(sessionId: string, initialText = '') {
    if (!isSupported.value) {
      errorMessage.value = '当前浏览器暂不支持流式语音输入。'
      throw new Error(errorMessage.value)
    }

    if (isConnecting.value || isListening.value) {
      throw new Error('语音输入已在进行中，请先停止后再试。')
    }

    errorMessage.value = ''
    speechEvent.value = ''
    stopRequested = false
    resetTranscriptState(initialText)
    isConnecting.value = true

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      await setupAudioPipeline(mediaStream)

      const readyPromise = new Promise<void>((resolve, reject) => {
        let readyHandled = false

        socket = new WebSocket(resolveSocketUrl())
        socket.binaryType = 'arraybuffer'

        socket.onopen = () => {
          socket?.send(
            JSON.stringify({
              type: 'start',
              sessionId,
              lang: options.lang || 'cmn-Hans-CN'
            })
          )
        }

        socket.onmessage = (event) => {
          if (typeof event.data !== 'string') {
            return
          }

          let payload: SpeechSocketMessage
          try {
            payload = JSON.parse(event.data)
          } catch {
            return
          }

          if (payload.type === 'ready' && !readyHandled) {
            readyHandled = true
            handleSocketMessage(event as MessageEvent<string>)
            resolve()
            return
          }

          if (payload.type === 'error' && !readyHandled) {
            readyHandled = true
            errorMessage.value = payload.message || '语音服务启动失败。'
            reject(new Error(errorMessage.value))
            return
          }

          handleSocketMessage(event as MessageEvent<string>)
        }

        socket.onerror = () => {
          if (!readyHandled) {
            readyHandled = true
            reject(new Error('语音识别服务连接失败，请稍后重试。'))
          }
        }

        socket.onclose = () => {
          const unexpected = !stopRequested && !errorMessage.value
          if (!readyHandled) {
            readyHandled = true
            reject(new Error('语音识别连接已断开，请稍后重试。'))
          }
          handleSocketClosed(unexpected)
        }
      })

      await readyPromise
    } catch (error) {
      teardownAudioGraph()
      cleanupSocket(true)
      isConnecting.value = false
      isListening.value = false
      speechEvent.value = ''
      stopRequested = false

      errorMessage.value = formatMediaError(error)
      throw new Error(errorMessage.value)
    }
  }

  function stop() {
    if (!socket && !isConnecting.value && !isListening.value) {
      return
    }

    stopRequested = true
    isConnecting.value = false
    isListening.value = false
    speechEvent.value = ''
    teardownAudioGraph()

    if (!socket) {
      return
    }

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'stop' }))
      return
    }

    cleanupSocket(true)
  }

  function abort() {
    stopRequested = true
    teardownAudioGraph()
    cleanupSocket(true)
    isConnecting.value = false
    isListening.value = false
    speechEvent.value = ''
    options.onClosed?.()
  }

  onBeforeUnmount(() => {
    abort()
  })

  return {
    isSupported,
    isConnecting,
    isListening,
    errorMessage,
    interimTranscript,
    speechEvent,
    start,
    stop,
    abort
  }
}
