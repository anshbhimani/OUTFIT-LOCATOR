import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled (not Google Fonts) so they're precached and work offline.
import '@fontsource/noto-sans-gujarati/400.css'
import '@fontsource/noto-sans-gujarati/600.css'
import '@fontsource/noto-sans-gujarati/700.css'
import '@fontsource/noto-serif-gujarati/600.css'
import './index.css'
import App from './App.tsx'
import { DialogProvider } from './components/Dialog.tsx'
import { LangProvider } from './i18n.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <DialogProvider>
        <App />
      </DialogProvider>
    </LangProvider>
  </StrictMode>,
)
