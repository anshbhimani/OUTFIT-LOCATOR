import { Check } from 'lucide-react'
import { useLang } from '../i18n'
import type { Term } from '../vocab'

/** Tap-to-toggle tag chips. With `multi` off, tapping the selected chip clears it. */
export function Chips({
  options,
  selected,
  onChange,
  multi = false,
}: {
  options: Term[]
  selected: string[]
  onChange: (next: string[]) => void
  multi?: boolean
}) {
  const { lang } = useLang()
  const toggle = (key: string) => {
    const on = selected.includes(key)
    if (multi) onChange(on ? selected.filter((k) => k !== key) : [...selected, key])
    else onChange(on ? [] : [key])
  }
  return (
    <div className="chips">
      {options.map((o) => {
        const on = selected.includes(o.key)
        return (
          <button
            type="button"
            key={o.key}
            className={on ? 'chip on' : 'chip'}
            aria-pressed={on}
            onClick={() => toggle(o.key)}
          >
            {o.swatch ? (
              <span className="swatch" style={{ background: o.swatch }} aria-hidden>
                {on && <Check size={14} strokeWidth={3.5} />}
              </span>
            ) : (
              on && <Check size={18} strokeWidth={3} aria-hidden />
            )}
            {o[lang]}
          </button>
        )
      })}
    </div>
  )
}
