import { type FormEvent, type RefObject, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import landingVideoGroups from './landingVideoGroups.json'
import { waitlistTurnstileSiteKey } from '../../config/appProfile'
import { submitWaitlistSignup, waitlistIsConfigured } from './waitlistClient'

gsap.registerPlugin(useGSAP, ScrollTrigger)

export type LandingIconId =
  | 'graph'
  | 'characters'
  | 'factions'
  | 'stories'
  | 'locations'
  | 'lore'
  | 'timelines'
  | 'cinematic'
  | 'script'
  | 'game'

export type LandingOrbitVariant = {
  title: string
  icon: LandingIconId
}

export type LandingOrbitNode = {
  className: string
  title: string
  icon: LandingIconId
  alternates?: LandingOrbitVariant[]
}

type LandingFeatureShowcase = {
  title: string
  eyebrow: string
  copy: string
  bullets: string[]
  image?: string
  alt?: string
  mediaShape?: 'square' | 'threeTwo' | 'standard' | 'wide' | 'ultrawide'
  mediaLabel?: string
  secondaryImage?: string
  secondaryAlt?: string
  secondaryMediaShape?: 'square' | 'threeTwo' | 'standard' | 'wide' | 'ultrawide'
  secondaryMediaLabel?: string
}

type LandingPainPoint = {
  title: string
  copy: string
}

type LandingAgentIconId =
  | 'context'
  | 'script'
  | 'shots'
  | 'references'
  | 'sceneGraph'
  | 'prompt'
  | 'output'

type LandingOrchestrationStep = {
  title: string
  icon: LandingAgentIconId
  bullets: string[]
}

type LandingOutputVideo = {
  id: string
  label: string
  src: string
}

type LandingOutputComic = {
  artifactType: string
  pages: string[]
  pageHoldMs?: number
}

type LandingOutputGroup = {
  id: string
  label: string
  prompt: string
  cycle?: boolean
  videos?: LandingOutputVideo[]
  comic?: LandingOutputComic
}

const navLinks = [
  { label: 'Product', href: '#product' },
  { label: 'Agents', href: '#orchestration' },
  { label: 'Studio', href: '#outputs' },
]

export const orbitEdgePairs: Array<[string, string]> = [
  ['is-characters', 'is-stories'],
  ['is-stories', 'is-locations'],
  ['is-items', 'is-lore'],
  ['is-lore', 'is-timelines'],
]

export const orbitNodes: LandingOrbitNode[] = [
  {
    className: 'is-characters',
    title: 'Characters',
    icon: 'characters',
    alternates: [
      { title: 'Factions', icon: 'factions' },
      { title: 'Traits', icon: 'graph' },
      { title: 'Visual refs', icon: 'stories' },
    ],
  },
  {
    className: 'is-stories',
    title: 'Scripts',
    icon: 'script',
    alternates: [
      { title: 'Cinematics', icon: 'cinematic' },
      { title: 'Storyboards', icon: 'stories' },
      { title: 'Scene plans', icon: 'game' },
    ],
  },
  {
    className: 'is-locations',
    title: 'Locations',
    icon: 'locations',
    alternates: [
      { title: 'Sets', icon: 'locations' },
      { title: 'Zones', icon: 'graph' },
      { title: 'History', icon: 'timelines' },
    ],
  },
  {
    className: 'is-items',
    title: 'Assets',
    icon: 'game',
    alternates: [
      { title: 'Props', icon: 'game' },
      { title: 'References', icon: 'stories' },
      { title: 'Outputs', icon: 'cinematic' },
    ],
  },
  {
    className: 'is-lore',
    title: 'Lore',
    icon: 'lore',
    alternates: [
      { title: 'Canon', icon: 'graph' },
      { title: 'Rules', icon: 'lore' },
      { title: 'Factions', icon: 'factions' },
    ],
  },
  {
    className: 'is-timelines',
    title: 'Events',
    icon: 'timelines',
    alternates: [
      { title: 'Episodes', icon: 'stories' },
      { title: 'Scenes', icon: 'cinematic' },
      { title: 'Memory', icon: 'graph' },
    ],
  },
]

const productSystemPoints: Array<{ copy: string; icon: LandingIconId }> = [
  { copy: 'Create characters, places, items and lore', icon: 'characters' },
  { copy: 'Evolve canon, relationships and visual references', icon: 'graph' },
  { copy: 'Retrieve world context for every output workflow', icon: 'lore' },
  { copy: 'Generate prose, art, comics, animatics and cinematics', icon: 'cinematic' },
]

const orchestrationSteps: LandingOrchestrationStep[] = [
  {
    title: 'Retrieve world context',
    icon: 'context',
    bullets: ['Characters', 'Locations', 'Lore and canon', 'Timelines'],
  },
  {
    title: 'Write script',
    icon: 'script',
    bullets: ['Scene description', 'Dialogue', 'Action', 'Tone and mood'],
  },
  {
    title: 'Arrange as shots',
    icon: 'shots',
    bullets: ['Shot breakdown', 'Order and pacing', 'Transitions', 'Shot types'],
  },
  {
    title: 'Assign references',
    icon: 'references',
    bullets: ['Characters', 'Locations', 'Props', 'Visual references'],
  },
  {
    title: 'Scene graph assignment',
    icon: 'sceneGraph',
    bullets: ['Continuity links', 'Spatial relations', 'Time and state', 'Scene graph update'],
  },
  {
    title: 'Prompt assignment',
    icon: 'prompt',
    bullets: ['Camera and framing', 'Lighting and style', 'Movement', 'Structured prompts'],
  },
  {
    title: 'Cinematic output',
    icon: 'output',
    bullets: ['Cinematic video', 'Consistent shots', 'Production ready'],
  },
]

const featureShowcase: LandingFeatureShowcase[] = [
  {
    title: 'Evolving Wiki / Codex',
    eyebrow: 'Canon stays reusable',
    copy: 'Characters, locations, lore, relationships and canon become browsable, editable world memory.',
    bullets: [
      'World entities stay connected',
      'Canon is editable after generation',
      'Every output can pull from the same source',
    ],
    image: '/landing/Infographics/wiki.png',
    alt: 'SynArc wiki and codex interface showing world entities and canon structure',
    mediaShape: 'square',
    mediaLabel: 'Wiki / Codex',
    secondaryImage: '/landing/Infographics/feed.png',
    secondaryAlt: 'SynArc world feed showing evolving canon and generated world updates',
    secondaryMediaShape: 'square',
    secondaryMediaLabel: 'World feed',
  },
  {
    title: 'Character Variants',
    eyebrow: 'Identity stays anchored',
    copy: 'Keep a character anchored to one identity while exploring alternate costumes, archetypes and production-ready looks.',
    bullets: [
      'Variants stay tied to the same canonical character',
      'Alternate looks remain reusable across outputs',
      'Visual identity can evolve without losing continuity',
    ],
    image: '/landing/Infographics/samuraiCat.webp',
    alt: 'Samurai cat character variant reference art',
    mediaShape: 'standard',
    mediaLabel: 'Variant / Samurai',
    secondaryImage: '/landing/Infographics/wizardCat.webp',
    secondaryAlt: 'Wizard cat character variant reference art',
    secondaryMediaShape: 'standard',
    secondaryMediaLabel: 'Variant / Wizard',
  },
  {
    title: 'World Entities',
    eyebrow: 'References stay connected',
    copy: 'Define factions, items and other world entities with persistent identity, visual references and relationships that carry across stories and scenes.',
    bullets: [
      'Factions preserve symbols, roles and culture',
      'Items keep design, function and lore context',
      'Relationships connect entities to characters and timelines',
    ],
    image: '/landing/Infographics/faction.webp',
    alt: 'Faction reference art generated as a reusable world entity',
    mediaShape: 'square',
    mediaLabel: 'Faction',
    secondaryImage: '/landing/Infographics/item.png',
    secondaryAlt: 'Item reference art generated as a reusable world entity',
    secondaryMediaShape: 'square',
    secondaryMediaLabel: 'Item',
  },
  {
    title: 'Scene Graph',
    eyebrow: 'Scenes stay shot-aware',
    copy: 'Scripts and world state evolve into a scene graph where characters, locations, props and continuity are assigned per shot.',
    bullets: [
      'Shots inherit the right cast and setting',
      'Continuity bindings stay inspectable',
      'Scene context is ready before generation',
    ],
    image: '/landing/Infographics/sceneGraph.png',
    alt: 'Scene graph interface assigning characters, locations, props and continuity to cinematic shots',
    mediaShape: 'threeTwo',
  },
  {
    title: 'Workflow Graph',
    eyebrow: 'Workflows inherit context',
    copy: 'SynArc retrieves world context, applies the right workflow, and generates the steps needed for the output.',
    bullets: [
      'World context is gathered automatically',
      'Generation steps are visible and reusable',
      'Workflows adapt to the requested output',
    ],
    image: '/landing/Infographics/workflowGraph.png',
    alt: 'Workflow graph showing connected generation steps for creating outputs from world context',
    mediaShape: 'ultrawide',
  },
  {
    title: 'Animatic Direction',
    eyebrow: 'Direction before spend',
    copy: 'Direct shot by shot with keyframes before spending time and cost on final video generation.',
    bullets: [
      'Prompt changes to keyframes before video',
      'Video prompts are assembled from canon and references',
      'Workflow harnesses apply cinematic skills for you',
    ],
    image: '/landing/Infographics/animatic.png',
    alt: 'Animatic view showing cinematic shots, keyframes and shot controls',
    mediaShape: 'wide',
  },
  {
    title: 'Timeline View',
    eyebrow: 'Timing stays editable',
    copy: 'Scrub shots, dialogue, captions, action beats and timing in one coherent cinematic timeline.',
    bullets: [
      'See keyframes and timing together',
      'Dialogue and action stay time-bound',
      'Shot plans can move from outline to edit',
    ],
    image: '/landing/Infographics/timeline.png',
    alt: 'Timeline view with keyframes, shots, dialogue, captions and cinematic timing',
    mediaShape: 'standard',
  },
]

const marketPainPoints: LandingPainPoint[] = [
  {
    title: 'Context drift',
    copy: 'In isolated-prompt workflows, every scene starts by re-explaining characters, places and canon.',
  },
  {
    title: 'Reference sprawl',
    copy: 'In fragmented toolchains, scripts, images, sheets and videos scatter across separate workspaces.',
  },
  {
    title: 'Continuity loss',
    copy: 'When outputs are disconnected, impressive shots stop belonging to the same world.',
  },
]

type LandingPageProps = {
  isSignedIn: boolean
  onEnterApp: () => void
  onOpenAuth: () => void
  appAccessMode?: 'full' | 'landing'
}

type WaitlistFormState = {
  email: string
  name: string
  role: string
  useCase: string
  referralSource: string
  honeypot: string
  turnstileToken: string
}

type WaitlistSubmitState =
  | { status: 'idle'; message: string }
  | { status: 'submitting'; message: string }
  | { status: 'joined' | 'existing' | 'error'; message: string }

type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string
    callback?: (token: string) => void
    'expired-callback'?: () => void
    'error-callback'?: () => void
    theme?: 'light' | 'dark' | 'auto'
  }) => string
  reset: (widgetId?: string) => void
  remove?: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches)

    updatePreference()
    mediaQuery.addEventListener('change', updatePreference)

    return () => mediaQuery.removeEventListener('change', updatePreference)
  }, [])

  return prefersReducedMotion
}

function useAnimatedHeroPrompt(promptText: string) {
  const [visibleText, setVisibleText] = useState('')
  const [isClearing, setIsClearing] = useState(false)

  useEffect(() => {
    setVisibleText('')
    setIsClearing(false)
  }, [promptText])

  useEffect(() => {
    let timeoutId = 0

    if (!isClearing && visibleText.length < promptText.length) {
      timeoutId = window.setTimeout(() => {
        setVisibleText(promptText.slice(0, visibleText.length + 1))
      }, 24)
    }

    return () => window.clearTimeout(timeoutId)
  }, [isClearing, promptText, visibleText])

  return {
    activePrompt: { text: promptText },
    visibleText,
    isClearing,
  }
}

function useAutoGrowTextarea(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return

    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 112), 260)
    textarea.style.height = `${nextHeight}px`
  }, [enabled, textareaRef, value])
}

function LandingPromptMockIcon({ kind }: { kind: 'spark' | 'send' }) {
  return (
    <svg aria-hidden="true" className="landing-prompt-mock-icon" viewBox="0 0 48 48">
      {kind === 'spark' ? (
        <>
          <path d="M23 5l4.6 12.1L40 22l-12.4 4.9L23 39l-4.6-12.1L6 22l12.4-4.9L23 5Z" />
          <path d="M38 7v8M34 11h8M12 33v6M9 36h6" />
        </>
      ) : null}
      {kind === 'send' ? (
        <>
          <path d="M7 24 41 8 30 41l-6-13-17-4Z" />
          <path d="m24 28 17-20" />
        </>
      ) : null}
    </svg>
  )
}

function LandingArrowIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg aria-hidden="true" className="landing-arrow-icon" viewBox="0 0 24 24">
      {direction === 'left' ? (
        <>
          <path d="M15 18 9 12l6-6" />
          <path d="M20 12H9" />
        </>
      ) : (
        <>
          <path d="m9 18 6-6-6-6" />
          <path d="M4 12h11" />
        </>
      )}
    </svg>
  )
}

function LandingAgentFlowIcon({ icon }: { icon: LandingAgentIconId }) {
  return (
    <svg aria-hidden="true" className="landing-agent-flow-icon" viewBox="0 0 64 64">
      {icon === 'context' ? (
        <>
          <ellipse cx="32" cy="16" rx="19" ry="7" />
          <path d="M13 16v28c0 3.9 8.5 7 19 7s19-3.1 19-7V16" />
          <path d="M13 30c0 3.9 8.5 7 19 7s19-3.1 19-7" />
          <circle cx="32" cy="31" r="8" />
          <path d="M32 22v18M23 31h18M26.5 25.5l11 11M37.5 25.5l-11 11" />
        </>
      ) : null}
      {icon === 'script' ? (
        <>
          <path d="M20 8h18l10 10v38H20V8Z" />
          <path d="M38 8v12h10M27 29h14M27 37h14M27 45h9" />
          <path d="M16 14h4M16 22h4M16 30h4M16 38h4M16 46h4" />
        </>
      ) : null}
      {icon === 'shots' ? (
        <>
          <rect x="14" y="12" width="36" height="40" rx="5" />
          <path d="M22 22h10M22 32h10M22 42h10M38 20h5M38 30h5M38 40h5" />
          <rect x="20" y="19" width="8" height="6" rx="1" />
          <rect x="20" y="29" width="8" height="6" rx="1" />
          <rect x="20" y="39" width="8" height="6" rx="1" />
        </>
      ) : null}
      {icon === 'references' ? (
        <>
          <rect x="13" y="22" width="22" height="18" rx="3" transform="rotate(-8 24 31)" />
          <rect x="29" y="18" width="22" height="18" rx="3" transform="rotate(6 40 27)" />
          <circle cx="41" cy="27" r="5" />
          <path d="M32 47c1.8-7.2 6.2-11 11-11s9.2 3.8 11 11" />
          <path d="M18 34l5-5 6 7" />
        </>
      ) : null}
      {icon === 'sceneGraph' ? (
        <>
          <circle cx="32" cy="16" r="5" />
          <circle cx="18" cy="39" r="5" />
          <circle cx="46" cy="39" r="5" />
          <circle cx="32" cy="49" r="5" />
          <path d="M29.4 20.5 20.6 34.5M34.6 20.5l8.8 14M23 40.8l14 5.4M41 40.8l-14 5.4M23 39h18" />
          <path d="M32 28v8" />
        </>
      ) : null}
      {icon === 'prompt' ? (
        <>
          <rect x="11" y="16" width="42" height="32" rx="5" />
          <path d="m20 27 6 5-6 5M31 38h13M18 22h2M24 22h2M30 22h2" />
          <path d="M17 47h30" />
        </>
      ) : null}
      {icon === 'output' ? (
        <>
          <path d="M13 23h38v27H13V23Z" />
          <path d="M15 23 22 12M26 23l7-11M37 23l7-11M16 12h35v11" />
          <path d="m28 31 12 7-12 7V31Z" />
        </>
      ) : null}
    </svg>
  )
}

export function LandingIcon({ id }: { id: LandingIconId }) {
  return (
    <svg aria-hidden="true" className="landing-icon-glyph" viewBox="0 0 48 48">
      {id === 'graph' ? (
        <>
          <path d="M24 8 38 16v16L24 40 10 32V16l14-8Z" />
          <path d="M10 16l14 8 14-8M24 24v16" />
          <circle cx="24" cy="8" r="2.5" />
          <circle cx="10" cy="16" r="2.5" />
          <circle cx="38" cy="16" r="2.5" />
          <circle cx="10" cy="32" r="2.5" />
          <circle cx="38" cy="32" r="2.5" />
        </>
      ) : null}
      {id === 'characters' ? (
        <>
          <circle cx="24" cy="16" r="6" />
          <path d="M13 38c1.7-7.2 6-11 11-11s9.3 3.8 11 11" />
          <circle cx="12" cy="22" r="4.5" />
          <path d="M5.5 36c1.1-4.8 3.9-7.4 7.3-7.4" />
          <circle cx="36" cy="22" r="4.5" />
          <path d="M42.5 36c-1.1-4.8-3.9-7.4-7.3-7.4" />
        </>
      ) : null}
      {id === 'factions' ? (
        <>
          <path d="M24 7 36 14v14c0 7-4.8 11-12 13-7.2-2-12-6-12-13V14l12-7Z" />
          <path d="M24 13v24M16 19h16M18 27h12" />
          <circle cx="14" cy="12" r="2.4" />
          <circle cx="34" cy="12" r="2.4" />
          <circle cx="24" cy="40" r="2.4" />
        </>
      ) : null}
      {id === 'stories' ? (
        <>
          <path d="M8 12h12c2.2 0 4 1.8 4 4v22c0-2.2-1.8-4-4-4H8V12Z" />
          <path d="M40 12H28c-2.2 0-4 1.8-4 4v22c0-2.2 1.8-4 4-4h12V12Z" />
          <path d="M14 19h5M14 25h5M29 19h5M29 25h5" />
        </>
      ) : null}
      {id === 'locations' ? (
        <>
          <path d="M24 42s13-12.1 13-23A13 13 0 0 0 11 19c0 10.9 13 23 13 23Z" />
          <circle cx="24" cy="19" r="5" />
        </>
      ) : null}
      {id === 'lore' ? (
        <>
          <path d="M16 9h18v30H14c-3 0-5-2-5-5V14c0-3 2-5 5-5h2Z" />
          <path d="M16 9v30M21 18h8M21 24h8M21 30h6" />
        </>
      ) : null}
      {id === 'timelines' ? (
        <>
          <rect x="9" y="12" width="30" height="28" rx="4" />
          <path d="M15 8v8M33 8v8M9 21h30M16 28h4M24 28h4M32 28h1M16 34h4M24 34h4" />
        </>
      ) : null}
      {id === 'cinematic' ? (
        <>
          <path d="M9 18h30v21H9V18Z" />
          <path d="M11 18 17 9M20 18l6-9M29 18l6-9M12 9h27v9" />
          <path d="m21 25 9 5-9 5v-10Z" />
        </>
      ) : null}
      {id === 'script' ? (
        <>
          <path d="M14 7h16l7 7v27H14V7Z" />
          <path d="M30 7v9h7M20 22h12M20 28h12M20 34h8" />
        </>
      ) : null}
      {id === 'game' ? (
        <>
          <path d="M15 19h18c5 0 8 4 8 10v3c0 3-2 5-4.7 5-2.2 0-3.8-1.4-5.4-3.6H17.1C15.5 35.6 13.9 37 11.7 37 9 37 7 35 7 32v-3c0-6 3-10 8-10Z" />
          <path d="M16 27h8M20 23v8" />
          <circle cx="31.5" cy="26.5" r="1.8" />
          <circle cx="36" cy="31" r="1.8" />
        </>
      ) : null}
    </svg>
  )
}

export function LandingPage({
  isSignedIn,
  onEnterApp,
  onOpenAuth,
  appAccessMode = 'full',
}: LandingPageProps) {
  const rootRef = useRef<HTMLElement | null>(null)
  const outputVideoGroups = landingVideoGroups.groups as LandingOutputGroup[]
  const [activeOutputGroupIndex, setActiveOutputGroupIndex] = useState(0)
  const outputVideoGroup = outputVideoGroups[activeOutputGroupIndex] ?? outputVideoGroups[0]
  const outputVideos = outputVideoGroup?.videos ?? []
  const [activeOutputVideoIndex, setActiveOutputVideoIndex] = useState(0)
  const activeOutputVideo = outputVideos[activeOutputVideoIndex] ?? outputVideos[0]
  const activeOutputComic = outputVideoGroup?.comic
  const activeComicPages = activeOutputComic?.pages ?? []
  const isComicOutputActive = Boolean(activeOutputComic)
  const shouldLoopOutputVideo = outputVideoGroups.length <= 1 && outputVideos.length <= 1
  const heroPrompt = useAnimatedHeroPrompt(outputVideoGroup?.prompt ?? '')
  const prefersReducedMotion = usePrefersReducedMotion()
  const [activeComicPageIndex, setActiveComicPageIndex] = useState(0)
  const landingOnly = appAccessMode === 'landing'
  const waitlistPanelRef = useRef<HTMLElement | null>(null)
  const waitlistEmailRef = useRef<HTMLInputElement | null>(null)
  const waitlistUseCaseRef = useRef<HTMLTextAreaElement | null>(null)
  const waitlistTriggerRef = useRef<HTMLElement | null>(null)
  const waitlistCloseRef = useRef<HTMLButtonElement | null>(null)
  const waitlistTurnstileRef = useRef<HTMLDivElement | null>(null)
  const waitlistTurnstileWidgetRef = useRef<string | null>(null)
  const [waitlistOpen, setWaitlistOpen] = useState(false)
  const [waitlistForm, setWaitlistForm] = useState<WaitlistFormState>({
    email: '',
    name: '',
    role: '',
    useCase: '',
    referralSource: '',
    honeypot: '',
    turnstileToken: '',
  })
  const [waitlistSubmitState, setWaitlistSubmitState] = useState<WaitlistSubmitState>({
    status: 'idle',
    message: '',
  })
  const waitlistConfigured = waitlistIsConfigured()
  const waitlistTurnstileEnabled = Boolean(waitlistTurnstileSiteKey)
  const waitlistSucceeded = waitlistSubmitState.status === 'joined' || waitlistSubmitState.status === 'existing'

  useAutoGrowTextarea(waitlistUseCaseRef, waitlistForm.useCase, waitlistOpen)

  useEffect(() => {
    setActiveOutputVideoIndex(0)
    setActiveComicPageIndex(0)
  }, [outputVideoGroup?.id])

  const closeWaitlist = () => {
    setWaitlistOpen(false)
    window.setTimeout(() => waitlistTriggerRef.current?.focus(), 0)
  }

  const openWaitlist = (trigger?: HTMLElement | null) => {
    waitlistTriggerRef.current = trigger ?? (document.activeElement as HTMLElement | null)
    setWaitlistOpen(true)
    setWaitlistSubmitState({
      status: 'idle',
      message: waitlistConfigured ? '' : 'Waitlist is not configured for this build.',
    })
  }

  const handleLandingPrimaryAction = (trigger?: HTMLElement | null) => {
    if (landingOnly) {
      openWaitlist(trigger)
      return
    }

    onOpenAuth()
  }

  const handleLandingLearnMore = () => {
    document.getElementById('outputs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleWaitlistFormChange = (field: keyof WaitlistFormState, value: string) => {
    setWaitlistForm((current) => ({ ...current, [field]: value }))
    if (waitlistSubmitState.status === 'error') {
      setWaitlistSubmitState({ status: 'idle', message: '' })
    }
  }

  const handleWaitlistSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!waitlistForm.email.trim()) {
      setWaitlistSubmitState({ status: 'error', message: 'Enter an email address to request early access.' })
      return
    }

    setWaitlistSubmitState({ status: 'submitting', message: 'Requesting early access...' })

    try {
      const result = await submitWaitlistSignup(waitlistForm)
      setWaitlistSubmitState({
        status: result.status,
        message: result.status === 'existing'
          ? "You're already on the early access list. We refreshed your details. If you requested access before, check your inbox or spam folder for the original confirmation."
          : "You're on the early access list. We sent a confirmation email. If it does not arrive in a few minutes, check your spam or junk folder.",
      })
      if (waitlistTurnstileWidgetRef.current) {
        window.turnstile?.reset(waitlistTurnstileWidgetRef.current)
        setWaitlistForm((current) => ({ ...current, turnstileToken: '' }))
      }
    } catch (error) {
      setWaitlistSubmitState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unable to request early access right now.',
      })
    }
  }

  useEffect(() => {
    if (!waitlistOpen) return

    window.setTimeout(() => {
      if (waitlistSucceeded) {
        waitlistCloseRef.current?.focus()
        return
      }
      waitlistEmailRef.current?.focus()
    }, 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeWaitlist()
        return
      }

      if (event.key !== 'Tab' || !waitlistPanelRef.current) return

      const focusableElements = Array.from(
        waitlistPanelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null)

      if (focusableElements.length === 0) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement?.focus()
        return
      }

      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [waitlistOpen, waitlistSucceeded])

  useEffect(() => {
    if (!waitlistOpen || !waitlistTurnstileEnabled || !waitlistTurnstileRef.current) return

    let cancelled = false
    const renderTurnstile = () => {
      if (cancelled || !waitlistTurnstileRef.current || !window.turnstile || waitlistTurnstileWidgetRef.current) return
      waitlistTurnstileWidgetRef.current = window.turnstile.render(waitlistTurnstileRef.current, {
        sitekey: waitlistTurnstileSiteKey,
        theme: 'dark',
        callback: (token) => setWaitlistForm((current) => ({ ...current, turnstileToken: token })),
        'expired-callback': () => setWaitlistForm((current) => ({ ...current, turnstileToken: '' })),
        'error-callback': () => setWaitlistForm((current) => ({ ...current, turnstileToken: '' })),
      })
    }

    if (!window.turnstile) {
      const existingScript = document.querySelector<HTMLScriptElement>('script[data-graphcore-turnstile="true"]')
      const script = existingScript ?? document.createElement('script')
      if (!existingScript) {
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        script.async = true
        script.defer = true
        script.dataset.graphcoreTurnstile = 'true'
        document.head.appendChild(script)
      }
      script.addEventListener('load', renderTurnstile, { once: true })
      return () => {
        cancelled = true
        script.removeEventListener('load', renderTurnstile)
      }
    }

    renderTurnstile()
    return () => {
      cancelled = true
    }
  }, [waitlistOpen, waitlistTurnstileEnabled])

  useEffect(() => {
    if (waitlistOpen) return
    if (waitlistTurnstileWidgetRef.current) {
      window.turnstile?.remove?.(waitlistTurnstileWidgetRef.current)
      waitlistTurnstileWidgetRef.current = null
    }
  }, [waitlistOpen])

  useEffect(() => {
    if (!activeOutputComic || activeComicPages.length <= 0) return

    const timeoutId = window.setTimeout(() => {
      if (prefersReducedMotion || activeComicPageIndex >= activeComicPages.length - 1) {
        setActiveOutputGroupIndex((activeOutputGroupIndex + 1) % outputVideoGroups.length)
        return
      }

      setActiveComicPageIndex(activeComicPageIndex + 1)
    }, activeOutputComic.pageHoldMs ?? 2200)

    return () => window.clearTimeout(timeoutId)
  }, [
    activeComicPageIndex,
    activeComicPages.length,
    activeOutputComic,
    activeOutputGroupIndex,
    outputVideoGroups.length,
    prefersReducedMotion,
  ])

  const handleOutputVideoEnded = () => {
    if (outputVideos.length > 1 && activeOutputVideoIndex < outputVideos.length - 1) {
      setActiveOutputVideoIndex((current) => current + 1)
      return
    }

    if (outputVideoGroups.length > 1) {
      setActiveOutputGroupIndex((current) => (current + 1) % outputVideoGroups.length)
      return
    }

    setActiveOutputVideoIndex(0)
  }

  const handleOutputGroupNavigation = (direction: 'previous' | 'next') => {
    if (outputVideoGroups.length <= 1) {
      setActiveOutputVideoIndex(0)
      return
    }

    setActiveOutputGroupIndex((current) => {
      const delta = direction === 'next' ? 1 : -1
      return (current + delta + outputVideoGroups.length) % outputVideoGroups.length
    })
    setActiveOutputVideoIndex(0)
  }

  const getComicPageState = (index: number) => {
    const previousIndex = (activeComicPageIndex - 1 + activeComicPages.length) % activeComicPages.length
    const nextIndex = (activeComicPageIndex + 1) % activeComicPages.length

    if (index === activeComicPageIndex) return 'is-active'
    if (index === previousIndex) return 'is-previous'
    if (index === nextIndex) return 'is-next'
    return 'is-hidden'
  }

  useGSAP(() => {
    if (!rootRef.current) return

    gsap.fromTo(
      '.landing-nav, .landing-hero-copy > *, .landing-hero-proof, .landing-problem-strip, .landing-system-intro, .landing-system-visual',
      { y: 18 },
      { y: 0, stagger: 0.055, duration: 0.85, ease: 'power3.out' },
    )

    gsap.fromTo(
      '.landing-workflow-step, .landing-problem-strip-card, .landing-feature-row',
      { opacity: 0, y: 24, scale: 0.98 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        stagger: 0.055,
        duration: 0.72,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: rootRef.current,
          start: 'top top+=80',
        },
      },
    )

  }, { scope: rootRef })

  return (
    <main className="landing-shell" ref={rootRef}>
      <header className="landing-nav-shell">
        <nav className="landing-nav" aria-label="SynArc landing navigation">
          <button className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} type="button">
            <span className="landing-brand-mark" aria-hidden="true">
              <img src="/brand/synarc-logo.png" alt="" />
            </span>
            <span>SynArc</span>
          </button>

          <div className="landing-nav-links">
            {navLinks.map((link) => (
              <a href={link.href} key={link.href}>
                {link.label}
              </a>
            ))}
          </div>

          <div className="landing-nav-actions">
            {!landingOnly ? (
              <button className="landing-login-button" onClick={onEnterApp} type="button">
                {isSignedIn ? 'Open app' : 'Log in'}
              </button>
            ) : null}
            <button className="landing-cta-button" onClick={(event) => handleLandingPrimaryAction(event.currentTarget)} type="button">
              {landingOnly ? 'Request early access' : isSignedIn ? 'Open Workspace' : 'Request early access'}
              <span aria-hidden="true">-&gt;</span>
            </button>
          </div>
        </nav>
      </header>

      <section className="landing-hero-section landing-studio-hero" id="product">
        <div className="landing-hero-copy">
          <div className="landing-kicker-row">
            <span className="landing-chip">For filmmakers, storytellers and worldbuilders</span>
          </div>
          <h1>
            Create a world.
            <span>Direct everything</span>
            from it.
          </h1>
          <p className="landing-hero-summary">
            <span className="landing-copy-desktop">
              Build and evolve a living world with prompts, then generate cinematics, comics, scenes and more from the same canon, with continuity already handled.
            </span>
            <span className="landing-copy-mobile">
              Generate every output from one living world's canon, with continuity already handled.
            </span>
          </p>
          <div className="landing-hero-actions">
            <button className="landing-cta-button" onClick={(event) => handleLandingPrimaryAction(event.currentTarget)} type="button">
              {landingOnly ? 'Request early access' : isSignedIn ? 'Open Workspace' : 'Request early access'}
              <span aria-hidden="true">-&gt;</span>
            </button>
            <button className="landing-secondary-button" onClick={handleLandingLearnMore} type="button">
              <span className="landing-play-icon" aria-hidden="true" />
              Learn more
            </button>
          </div>
          <p className="landing-hero-access-note">
            Early access for AI filmmakers, storytellers and worldbuilders.
          </p>
        </div>

        <div className="landing-hero-proof" aria-label="Prompt to world-aware output example">
          <article
            className={`landing-studio-prompt-card landing-hero-prompt-card${heroPrompt.isClearing ? ' is-clearing' : ''}`}
          >
            <div className="landing-prompt-simple-label">Persistent world. Structured context. Living memory.</div>
            <div className="landing-prompt-simple-input" aria-label={heroPrompt.activePrompt.text}>
              <LandingPromptMockIcon kind="spark" />
              <div className="landing-prompt-simple-text">
                <span>{heroPrompt.visibleText}</span>
                <i aria-hidden="true" />
              </div>
              <LandingPromptMockIcon kind="send" />
            </div>
          </article>
          <div className="landing-hero-proof-flow" aria-hidden="true">
            <span>World context applied</span>
            <i />
            <span>Output generated</span>
          </div>
          <aside className="landing-hero-output-preview" aria-label="Example SynArc-generated cinematic and comic output">
            <div className="landing-output-preview-frame">
              {isComicOutputActive && activeOutputComic ? (
                <div className="landing-output-comic-preview" aria-label="Comic PDF page preview">
                  <div className="landing-output-comic-topbar">
                    <span>{activeOutputComic.artifactType}</span>
                    <strong>
                      Page {activeComicPageIndex + 1} / {activeComicPages.length}
                    </strong>
                  </div>
                  <div className="landing-output-comic-stage">
                    {activeComicPages.map((page, index) => {
                      const pageState = getComicPageState(index)

                      return (
                        <img
                          alt={index === activeComicPageIndex ? `Comic preview page ${index + 1}` : ''}
                          aria-hidden={index !== activeComicPageIndex}
                          className={`landing-output-comic-page ${pageState}`}
                          key={page}
                          loading={index === 0 ? 'eager' : 'lazy'}
                          src={page}
                        />
                      )
                    })}
                  </div>
                </div>
              ) : activeOutputVideo ? (
                <video
                  key={activeOutputVideo.src}
                  className="landing-output-preview-video"
                  src={activeOutputVideo.src}
                  autoPlay
                  loop={shouldLoopOutputVideo}
                  muted
                  playsInline
                  preload="metadata"
                  aria-label={activeOutputVideo.label}
                  onEnded={handleOutputVideoEnded}
                />
              ) : null}
            </div>
            <div className="landing-output-preview-controls" aria-label="Cycle example prompts">
              <button
                type="button"
                onClick={() => handleOutputGroupNavigation('previous')}
                aria-label="Previous example prompt"
              >
                <LandingArrowIcon direction="left" />
              </button>
              <span>
                Example {activeOutputGroupIndex + 1} / {outputVideoGroups.length}
              </span>
              <button
                type="button"
                onClick={() => handleOutputGroupNavigation('next')}
                aria-label="Next example prompt"
              >
                <LandingArrowIcon direction="right" />
              </button>
            </div>
          </aside>
        </div>
      </section>

      <section className="landing-problem-strip" id="problem" aria-label="Why isolated prompts break production continuity">
        <div className="landing-problem-strip-heading">
          <span className="landing-chip">What breaks elsewhere</span>
          <h2>Existing AI tools generate from isolated prompts. SynArc generates from a living world.</h2>
        </div>
        <div className="landing-problem-strip-body">
          <p>These are the production failures SynArc is built to remove:</p>
          <div className="landing-problem-strip-list">
            {marketPainPoints.map((point) => (
              <article className="landing-problem-strip-card" key={point.title}>
                <strong>{point.title}</strong>
                <p>{point.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-system-intro-section" id="outputs">
        <figure className="landing-system-visual">
          <img
            src="/landing/worldStudio.png"
            alt="SynArc world studio diagram connecting creator prompts, world context and outputs"
          />
        </figure>
        <div className="landing-system-intro">
          <span className="landing-chip">World-native studio</span>
          <h2>SynArc turns prompts into a structured creative system.</h2>
          <p>
            Instead of sending a blank prompt to a model, SynArc routes your intent through a living
            world: canon, scene structure, references, continuity and output-specific harnesses are
            assembled before generation begins.
          </p>
          <div className="landing-system-proof-list">
            {productSystemPoints.map((point) => (
              <span key={point.copy}>
                <LandingIcon id={point.icon} />
                <em>{point.copy}</em>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-orchestration-section" id="orchestration" aria-labelledby="landing-orchestration-title">
        <div className="landing-orchestration-heading">
          <span className="landing-chip">Orchestration agents</span>
          <h2 id="landing-orchestration-title">
            Agents create from <span>worlds, not isolated</span> prompts.
          </h2>
          <p>SynArc orchestration flow: from creative intent to cinematic output.</p>
        </div>

        <div className="landing-orchestration-intent-card">
          <span className="landing-agent-icon-frame">
            <LandingIcon id="characters" />
          </span>
          <div>
            <strong>Creative intent</strong>
            <p>"Generate trailer scene from Chapter 3"</p>
          </div>
        </div>

        <div className="landing-orchestration-rail" aria-hidden="true">
          <span />
          <strong>Orchestration agents</strong>
          <span />
        </div>

        <ol className="landing-agent-flow">
          {orchestrationSteps.map((step, index) => (
            <li className="landing-agent-step" key={step.title}>
              <span className="landing-agent-step-number">{index + 1}</span>
              <span className="landing-agent-icon-frame">
                <LandingAgentFlowIcon icon={step.icon} />
              </span>
              <h3>{step.title}</h3>
              <ul>
                {step.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        <p className="landing-orchestration-quality-note">
          Strong cinematic output depends on the structure behind the prompt. SynArc lets you stay focused on intent while agents carry the world context, continuity, references, camera, lighting and motion harnesses into the final generation.
        </p>

        <div className="landing-orchestration-feedback">
          <div>
            <span className="landing-orchestration-refresh-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M20 6v5h-5" />
                <path d="M4 18v-5h5" />
                <path d="M18.2 9A7 7 0 0 0 6.8 6.7L4 9.3" />
                <path d="M5.8 15A7 7 0 0 0 17.2 17.3L20 14.7" />
              </svg>
            </span>
            <strong>World state updated</strong>
            <p>Continuity is maintained for the next output.</p>
          </div>
        </div>

        <p className="landing-orchestration-tagline">
          Persistent <span>world context.</span> Structured <span>orchestration.</span> Cinematic <span>consistency.</span>
        </p>
      </section>

      <section className="landing-feature-showcase" aria-label="SynArc product features">
        <div className="landing-feature-section-heading">
          <span className="landing-chip">What SynArc keeps connected</span>
        </div>
        <div className="landing-feature-list">
          {featureShowcase.map((feature, index) => (
            <article
              className={`landing-feature-row${feature.secondaryImage ? ' has-secondary-media' : ''}`}
              key={feature.title}
            >
              <div className="landing-feature-row-copy">
                <span>{String(index + 1).padStart(2, '0')} / {feature.eyebrow}</span>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
                <ul>
                  {feature.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
              <figure className={`landing-feature-row-media is-${feature.mediaShape ?? 'standard'}`}>
                {feature.mediaLabel ? <figcaption>{feature.mediaLabel}</figcaption> : null}
                <img src={feature.image} alt={feature.alt} />
              </figure>
              {feature.secondaryImage ? (
                <figure className={`landing-feature-row-media is-${feature.secondaryMediaShape ?? 'standard'}`}>
                  {feature.secondaryMediaLabel ? <figcaption>{feature.secondaryMediaLabel}</figcaption> : null}
                  <img src={feature.secondaryImage} alt={feature.secondaryAlt} />
                </figure>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="landing-final-section" id="examples">
        <div className="landing-final-panel">
          <span className="landing-chip">Early access</span>
          <h2>Direct cinematic worlds without rebuilding context every time.</h2>
          <p>
            Join the waitlist for a production workspace where agents keep your canon, references and output harnesses
            aligned across scenes, comics, animatics and cinematic runs.
          </p>
          <div className="landing-hero-actions">
            <button className="landing-cta-button" onClick={(event) => handleLandingPrimaryAction(event.currentTarget)} type="button">
              {landingOnly ? 'Request early access' : isSignedIn ? 'Open Workspace' : 'Request early access'}
              <span aria-hidden="true">-&gt;</span>
            </button>
          </div>
        </div>
      </section>

      {landingOnly && waitlistOpen ? (
        <div
          className="landing-waitlist-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeWaitlist()
          }}
        >
          <section className="landing-waitlist-panel" role="dialog" aria-modal="true" aria-labelledby="landing-waitlist-title" ref={waitlistPanelRef}>
            <button
              ref={waitlistCloseRef}
              className="landing-waitlist-close"
              type="button"
              aria-label="Close waitlist form"
              onClick={closeWaitlist}
            >
              x
            </button>
            <h2 id="landing-waitlist-title">Request early access</h2>
            <p>
              Tell us where SynArc fits into your creative workflow.
            </p>
            {waitlistSucceeded ? (
              <div className="landing-waitlist-success" role="status" aria-live="polite">
                <p className={`landing-waitlist-message is-${waitlistSubmitState.status}`}>
                  {waitlistSubmitState.message}
                </p>
                <button className="landing-cta-button landing-waitlist-submit" type="button" onClick={closeWaitlist}>
                  Close
                </button>
              </div>
            ) : (
              <form className="landing-waitlist-form" onSubmit={handleWaitlistSubmit}>
                <input
                  aria-label="Leave this field empty"
                  className="landing-waitlist-honeypot"
                  autoComplete="off"
                  tabIndex={-1}
                  value={waitlistForm.honeypot}
                  onChange={(event) => handleWaitlistFormChange('honeypot', event.target.value)}
                />
                <label>
                  <span>Email</span>
                  <input
                    ref={waitlistEmailRef}
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={waitlistForm.email}
                    onChange={(event) => handleWaitlistFormChange('email', event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Name</span>
                  <input
                    type="text"
                    autoComplete="name"
                    placeholder="Optional"
                    value={waitlistForm.name}
                    onChange={(event) => handleWaitlistFormChange('name', event.target.value)}
                  />
                </label>
                <label>
                  <span>Creator role</span>
                  <input
                    type="text"
                    placeholder="Filmmaker, writer, studio, game team..."
                    value={waitlistForm.role}
                    onChange={(event) => handleWaitlistFormChange('role', event.target.value)}
                  />
                </label>
                <label>
                  <span>Use case</span>
                  <textarea
                    ref={waitlistUseCaseRef}
                    rows={2}
                    placeholder="What would you want to create?"
                    value={waitlistForm.useCase}
                    onChange={(event) => handleWaitlistFormChange('useCase', event.target.value)}
                  />
                </label>
                {waitlistSubmitState.message ? (
                  <p className={`landing-waitlist-message is-${waitlistSubmitState.status}`}>
                    {waitlistSubmitState.message}
                  </p>
                ) : null}
                {waitlistTurnstileEnabled ? (
                  <div className="landing-waitlist-turnstile" ref={waitlistTurnstileRef} />
                ) : null}
                <p className="landing-waitlist-privacy">No spam. Early access only.</p>
                <button
                  className="landing-cta-button landing-waitlist-submit"
                  type="submit"
                  disabled={
                    waitlistSubmitState.status === 'submitting'
                    || !waitlistConfigured
                    || (waitlistTurnstileEnabled && !waitlistForm.turnstileToken)
                  }
                >
                  {waitlistSubmitState.status === 'submitting' ? 'Requesting...' : 'Request early access'}
                  <span aria-hidden="true">-&gt;</span>
                </button>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </main>
  )
}
