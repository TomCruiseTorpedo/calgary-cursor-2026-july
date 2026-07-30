export type TtsStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'speaking'
  | 'fallback'
  | 'error'

type KokoroInstance = {
  generate: (
    text: string,
    opts?: { voice?: string; speed?: number },
  ) => Promise<{ audio: Float32Array; sampling_rate: number } | ArrayBuffer | Float32Array>
}

let kokoro: KokoroInstance | null = null
let loadPromise: Promise<KokoroInstance | null> | null = null

function playFloat32(audio: Float32Array, sampleRate: number): Promise<void> {
  const ctx = new AudioContext()
  const buffer = ctx.createBuffer(1, audio.length, sampleRate)
  buffer.copyToChannel(audio, 0)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.connect(ctx.destination)
  return new Promise((resolve) => {
    src.onended = () => {
      void ctx.close()
      resolve()
    }
    src.start()
  })
}

function speakBrowser(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('No speechSynthesis'))
      return
    }
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = 1.02
    u.onend = () => resolve()
    u.onerror = () => reject(new Error('speechSynthesis failed'))
    window.speechSynthesis.speak(u)
  })
}

/** Lazy-load Kokoro-82M in-browser; null if download/init fails. */
export async function ensureKokoro(
  onStatus?: (s: TtsStatus, detail?: string) => void,
): Promise<KokoroInstance | null> {
  if (kokoro) return kokoro
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    onStatus?.('loading', 'Loading Kokoro-82M (local, first run)…')
    try {
      const { KokoroTTS } = await import('kokoro-js')
      const model_id = 'onnx-community/Kokoro-82M-v1.0-ONNX'
      // Prefer WebGPU; wasm q8 is the portable fallback.
      let instance: KokoroInstance
      try {
        instance = (await KokoroTTS.from_pretrained(model_id, {
          dtype: 'fp32',
          device: 'webgpu',
        })) as unknown as KokoroInstance
      } catch {
        instance = (await KokoroTTS.from_pretrained(model_id, {
          dtype: 'q8',
          device: 'wasm',
        })) as unknown as KokoroInstance
      }
      kokoro = instance
      onStatus?.('ready', 'Kokoro ready (on-device)')
      return instance
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      onStatus?.('fallback', `Kokoro unavailable — browser TTS (${msg})`)
      return null
    }
  })()

  return loadPromise
}

export async function speakDecision(
  text: string,
  onStatus?: (s: TtsStatus, detail?: string) => void,
): Promise<void> {
  const model = await ensureKokoro(onStatus)
  if (model) {
    onStatus?.('speaking', 'Speaking with Kokoro…')
    try {
      const result = await model.generate(text, {
        voice: 'af_heart',
        speed: 1.05,
      })
      // kokoro-js RawAudio-like: { audio, sampling_rate } or similar
      if (result && typeof result === 'object' && 'audio' in result) {
        const audio = (result as { audio: Float32Array; sampling_rate: number })
          .audio
        const sr =
          (result as { sampling_rate: number }).sampling_rate || 24000
        await playFloat32(audio, sr)
        onStatus?.('ready', 'Kokoro ready (on-device)')
        return
      }
      if (result instanceof Float32Array) {
        await playFloat32(result, 24000)
        onStatus?.('ready', 'Kokoro ready (on-device)')
        return
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      onStatus?.('fallback', `Kokoro speak failed — browser TTS (${msg})`)
    }
  }

  onStatus?.('speaking', 'Speaking (browser TTS)…')
  await speakBrowser(text)
  onStatus?.('fallback', 'Browser TTS')
}

export function getSpeechRecognition(): SpeechRecognition | null {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Ctor) return null
  const rec = new Ctor()
  rec.lang = 'en-US'
  rec.continuous = false
  rec.interimResults = false
  return rec
}
