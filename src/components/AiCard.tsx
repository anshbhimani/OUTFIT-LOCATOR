import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { DOWNLOAD_MB, photoAi, usePhotoAi } from '../ai/photoAi'
import { useLang } from '../i18n'
import { useDialog } from './Dialog'

const DISMISS_KEY = 'photoAiDismissed'

function onCellular(): boolean {
  const c = (navigator as Navigator & { connection?: { type?: string } }).connection
  return c?.type === 'cellular'
}

/** Asks before using mobile data, then starts the download. */
// eslint-disable-next-line react/only-export-components
export function useEnableAi() {
  const { t } = useLang()
  const dialog = useDialog()
  return async () => {
    if (onCellular() && !(await dialog.confirm(t.aiTitle, { message: t.aiCellular(DOWNLOAD_MB), confirmLabel: t.aiDownload }))) return
    photoAi.enable()
  }
}

/** On the Search screen: offer to turn on photo AI, then show download and learning progress. */
export function AiCard() {
  const { t } = useLang()
  const ai = usePhotoAi()
  const enable = useEnableAi()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  if (ai.status === 'ready') {
    if (ai.total === 0 || ai.learned >= ai.total) return null
    return (
      <p className="ai-status">
        <Sparkles size={18} aria-hidden />
        {t.aiLearning(ai.learned, ai.total)}
      </p>
    )
  }

  if (ai.status === 'loading')
    return (
      <div className="card ai-card">
        <p className="ai-card-title">
          <Sparkles size={20} aria-hidden />
          {t.aiDownloading(ai.progress)}
        </p>
        <div className="progress" role="progressbar" aria-valuenow={ai.progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${ai.progress}%` }} />
        </div>
      </div>
    )

  if (ai.status === 'error')
    return (
      <div className="card ai-card">
        <p className="error-text">{t.aiFailed}</p>
        <button className="btn btn-primary wide" onClick={enable}>
          {t.aiRetry}
        </button>
      </div>
    )

  if (dismissed) return null
  return (
    <div className="card ai-card">
      <p className="ai-card-title">
        <Sparkles size={20} aria-hidden />
        {t.aiTitle}
      </p>
      <p className="ai-card-text">{t.aiPitch}</p>
      <p className="hint">{t.aiSize(DOWNLOAD_MB)}</p>
      <div className="btn-pair">
        <button
          className="btn btn-quiet"
          onClick={() => {
            setDismissed(true)
            try {
              localStorage.setItem(DISMISS_KEY, '1')
            } catch {
              // just hidden for this session
            }
          }}
        >
          {t.aiNotNow}
        </button>
        <button className="btn btn-primary" onClick={enable}>
          {t.aiTurnOn}
        </button>
      </div>
    </div>
  )
}

/** In Places (settings area): current state with on/off. */
export function AiSettings() {
  const { t } = useLang()
  const dialog = useDialog()
  const ai = usePhotoAi()
  const enable = useEnableAi()

  return (
    <div className="card">
      <h2 className="card-title">
        <Sparkles size={18} aria-hidden /> {t.aiTitle}
      </h2>
      {ai.status === 'off' && (
        <>
          <p className="ai-card-text">{t.aiPitch}</p>
          <p className="hint">{t.aiSize(DOWNLOAD_MB)}</p>
          <button className="btn btn-primary wide" onClick={enable}>
            {t.aiTurnOn}
          </button>
        </>
      )}
      {ai.status === 'loading' && <p className="hint">{t.aiDownloading(ai.progress)}</p>}
      {ai.status === 'error' && (
        <button className="btn btn-primary wide" onClick={enable}>
          {t.aiRetry}
        </button>
      )}
      {ai.status === 'ready' && (
        <>
          <p className="backup-status ok">
            <Sparkles size={20} aria-hidden />
            {t.aiReady}
          </p>
          {ai.learned < ai.total && <p className="hint">{t.aiLearning(ai.learned, ai.total)}</p>}
          <button
            className="btn btn-quiet wide"
            onClick={async () => {
              if (await dialog.confirm(t.aiTitle, { message: t.aiOffConfirm, confirmLabel: t.aiTurnOff, danger: true }))
                await photoAi.disable()
            }}
          >
            {t.aiTurnOff}
          </button>
        </>
      )}
    </div>
  )
}
