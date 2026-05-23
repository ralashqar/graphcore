import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { isLandingOnly } from './config/appProfile'
import './style.css'

const root = createRoot(document.getElementById('root')!)

if (isLandingOnly) {
  void import('./features/landing/LandingOnlyApp').then(({ LandingOnlyApp }) => {
    root.render(
      <StrictMode>
        <LandingOnlyApp />
      </StrictMode>,
    )
  })
} else {
  void import('./App').then(({ default: App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
}
