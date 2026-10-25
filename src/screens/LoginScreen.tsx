import { LoaderCircle, LogIn } from 'lucide-react'
import { useState } from 'react'
import { BrandMark } from '../components/icons'
import { useLang } from '../i18n'
import { ApiError, login } from '../store'

/** Shown until this phone is signed in. The browser stays signed in until "Sign out". */
export function LoginScreen() {
  const { t } = useLang()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!username.trim() || !password) return
    setBusy(true)
    setError(null)
    try {
      await login(username, password)
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.code === 'locked'
            ? t.loginLocked
            : t.loginInvalid
          : t.noInternet, // fetch itself failed
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="login">
      <BrandMark size={80} />
      <h1 className="screen-title">{t.appName}</h1>
      <p className="lede">{t.loginHint}</p>
      <form
        className="card login-card"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label className="field">
          <span className="field-label">{t.username}</span>
          <input
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">{t.password}</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary wide" type="submit" disabled={busy || !username.trim() || !password}>
          {busy ? <LoaderCircle size={22} className="spin" aria-hidden /> : <LogIn size={22} aria-hidden />}
          {t.signIn}
        </button>
      </form>
    </section>
  )
}
