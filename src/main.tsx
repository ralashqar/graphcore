import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { isLandingOnly } from './config/appProfile'

const root = createRoot(document.getElementById('root')!)

if (window.location.pathname === '/city/asset-showcase') {
  void import('./features/city/CityAssetShowcase').then(({ CityAssetShowcase }) => root.render(<CityAssetShowcase />))
} else if (window.location.pathname === '/city' || window.location.pathname.startsWith('/city/')) {
  void import('./features/city/CityApp').then(({ CityApp }) => {
    // R3F owns the WebGL lifecycle; avoid StrictMode's development-only renderer teardown.
    root.render(<CityApp />)
  })
} else if (isLandingOnly) {
  void import('./style.css')
  void import('./features/landing/LandingOnlyApp').then(({ LandingOnlyApp }) => {
    root.render(
      <StrictMode>
        <LandingOnlyApp />
      </StrictMode>,
    )
  })
} else {
  void import('./style.css')
  void import('./App').then(({ default: App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
}
