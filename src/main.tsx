import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import '@fontsource/unbounded/cyrillic-700.css'
import '@fontsource/unbounded/latin-700.css'
import '@fontsource/unbounded/cyrillic-900.css'
import '@fontsource/unbounded/latin-900.css'
import '@fontsource/manrope/cyrillic-400.css'
import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/cyrillic-600.css'
import '@fontsource/manrope/latin-600.css'
import '@fontsource/manrope/cyrillic-800.css'
import '@fontsource/manrope/latin-800.css'
import './styles.css'
import ErrorBoundary from './ui/ErrorBoundary'
import { initStorage } from './db'

initStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </StrictMode>,
)
