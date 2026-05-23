import { LandingPage } from './LandingPage'

function scrollToLandingSection(sectionId: string) {
  const target = document.getElementById(sectionId)
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

export function LandingOnlyApp() {
  return (
    <LandingPage
      appAccessMode="landing"
      isSignedIn={false}
      onEnterApp={() => scrollToLandingSection('examples')}
      onOpenAuth={() => scrollToLandingSection('examples')}
    />
  )
}
