import { Check } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLang } from '../i18n'

// Styled replacements for window.prompt / confirm / alert, plus a toast.
// Bottom sheets sit where the thumb already is on a phone.

interface PromptOptions {
  message?: string
  placeholder?: string
  initial?: string
}
interface ConfirmOptions {
  message?: string
  confirmLabel?: string
  danger?: boolean
}

type Request =
  | ({ kind: 'prompt'; title: string; resolve: (v: string | null) => void } & PromptOptions)
  | ({ kind: 'confirm'; title: string; resolve: (v: boolean) => void } & ConfirmOptions)
  | { kind: 'alert'; title: string; message?: string; resolve: () => void }

export interface DialogApi {
  prompt(title: string, opts?: PromptOptions): Promise<string | null>
  confirm(title: string, opts?: ConfirmOptions): Promise<boolean>
  alert(title: string, message?: string): Promise<void>
  toast(text: string): void
}

const DialogContext = createContext<DialogApi | null>(null)

export function DialogProvider({ children }: { children: ReactNode }) {
  const { t } = useLang()
  const [req, setReq] = useState<Request | null>(null)
  const [value, setValue] = useState('')
  const [toastText, setToastText] = useState<string | null>(null)
  const toastTimer = useRef<number>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  const api = useMemo<DialogApi>(
    () => ({
      prompt: (title, opts) =>
        new Promise((resolve) => {
          setValue(opts?.initial ?? '')
          setReq({ kind: 'prompt', title, ...opts, resolve })
        }),
      confirm: (title, opts) => new Promise((resolve) => setReq({ kind: 'confirm', title, ...opts, resolve })),
      alert: (title, message) => new Promise((resolve) => setReq({ kind: 'alert', title, message, resolve })),
      toast: (text) => {
        window.clearTimeout(toastTimer.current)
        setToastText(text)
        toastTimer.current = window.setTimeout(() => setToastText(null), 2600)
      },
    }),
    [],
  )

  useEffect(() => {
    if (req?.kind === 'prompt') inputRef.current?.focus()
  }, [req])

  const cancel = useCallback(() => {
    if (!req) return
    if (req.kind === 'prompt') req.resolve(null)
    else if (req.kind === 'confirm') req.resolve(false)
    else req.resolve()
    setReq(null)
  }, [req])

  const accept = () => {
    if (!req) return
    if (req.kind === 'prompt') {
      const v = value.trim()
      if (!v) return
      req.resolve(v)
    } else if (req.kind === 'confirm') req.resolve(true)
    else req.resolve()
    setReq(null)
  }

  return (
    <DialogContext.Provider value={api}>
      {children}

      {req && (
        <div className="scrim" onClick={cancel}>
          <form
            className="sheet"
            role="dialog"
            aria-modal
            aria-labelledby="sheet-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              accept()
            }}
          >
            <div className="sheet-grip" aria-hidden />
            <h2 id="sheet-title">{req.title}</h2>
            {req.message && <p className="sheet-message">{req.message}</p>}
            {req.kind === 'prompt' && (
              <input
                ref={inputRef}
                className="input"
                value={value}
                placeholder={req.placeholder}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
            <div className="sheet-actions">
              {req.kind !== 'alert' && (
                <button type="button" className="btn btn-quiet" onClick={cancel}>
                  {t.cancel}
                </button>
              )}
              <button
                type="submit"
                className={req.kind === 'confirm' && req.danger ? 'btn btn-danger-solid' : 'btn btn-primary'}
                disabled={req.kind === 'prompt' && !value.trim()}
              >
                {req.kind === 'confirm' ? (req.confirmLabel ?? t.ok) : t.ok}
              </button>
            </div>
          </form>
        </div>
      )}

      {toastText && (
        <div className="snackbar" role="status">
          <Check size={20} strokeWidth={3} aria-hidden />
          {toastText}
        </div>
      )}
    </DialogContext.Provider>
  )
}

// eslint-disable-next-line react/only-export-components
export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used inside DialogProvider')
  return ctx
}
