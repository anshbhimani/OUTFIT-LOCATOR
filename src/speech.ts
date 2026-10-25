// Voice input through the browser's built-in speech recognition (free; Chrome on Android
// sends audio to Google's recogniser, so it needs internet). Typing always works offline.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang } from './strings'

interface Recognition {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}
type RecognitionCtor = new () => Recognition

const Ctor: RecognitionCtor | undefined =
  typeof window === 'undefined'
    ? undefined
    : ((window as unknown as Record<string, RecognitionCtor | undefined>).SpeechRecognition ??
      (window as unknown as Record<string, RecognitionCtor | undefined>).webkitSpeechRecognition)

export type SpeechError = 'denied' | 'network' | 'no-speech' | 'other'

export function useSpeech(lang: Lang, onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<SpeechError | null>(null)
  const rec = useRef<Recognition | null>(null)
  const onTextRef = useRef(onText)
  useEffect(() => {
    onTextRef.current = onText
  })

  useEffect(() => () => rec.current?.abort(), [])

  const start = useCallback(() => {
    if (!Ctor) return
    rec.current?.abort()
    const r = new Ctor()
    r.lang = lang === 'gu' ? 'gu-IN' : 'en-IN'
    r.interimResults = true // words appear while she speaks
    r.maxAlternatives = 1
    r.onresult = (e) => onTextRef.current(Array.from(e.results, (res) => res[0].transcript).join(''))
    r.onerror = (e) =>
      setError(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'denied'
          : e.error === 'network'
            ? 'network'
            : e.error === 'no-speech'
              ? 'no-speech'
              : e.error === 'aborted'
                ? null
                : 'other',
      )
    r.onend = () => setListening(false)
    rec.current = r
    setError(null)
    setListening(true)
    r.start()
  }, [lang])

  const stop = useCallback(() => {
    rec.current?.abort()
    setListening(false)
  }, [])

  return { supported: !!Ctor, listening, error, start, stop }
}
