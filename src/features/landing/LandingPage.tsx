import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import landingPromptExamplesData from './landingPromptExamples.json'

gsap.registerPlugin(useGSAP, ScrollTrigger)

export type LandingIconId =
  | 'graph'
  | 'characters'
  | 'factions'
  | 'stories'
  | 'quests'
  | 'locations'
  | 'maps'
  | 'items'
  | 'magic'
  | 'lore'
  | 'timelines'
  | 'cinematic'
  | 'script'
  | 'marketing'
  | 'game'
  | 'audio'

type LandingPromptSource = 'idea' | 'pdf' | 'url' | 'brand' | 'game'

type LandingPromptPhase = 'typing' | 'holding' | 'clearing'

type LandingPromptExample = {
  id: string
  source: LandingPromptSource
  label: string
  text: string
  typingMsPerChar?: number
  holdMs?: number
  clearMs?: number
}

export type LandingOrbitNode = {
  className: string
  title: string
  icon: LandingIconId
  alternates?: LandingOrbitVariant[]
}

export type LandingOrbitVariant = {
  title: string
  icon: LandingIconId
}

type LandingOrbitDisplayNode = LandingOrbitNode & {
  variantIndex: number
}

type LandingOrbitSwapState = {
  slotClassName: string
  phase: 'out' | 'in'
}

type LandingOrbitEdge = {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

type LandingHeroCurve = {
  d: string
  width: number
  height: number
}

type LandingOutputCard = {
  title: string
  copy: string
  icon: LandingIconId
  media: string
  chips: string[]
}

const navLinks = ['Product', 'Use Cases', 'Examples', 'Pricing', 'Resources', 'Company']

export const orbitEdgePairs: Array<[string, string]> = [
  ['is-characters', 'is-stories'],
  ['is-stories', 'is-locations'],
  ['is-items', 'is-lore'],
  ['is-lore', 'is-timelines'],
]

const landingPromptExamples = landingPromptExamplesData as LandingPromptExample[]

const fallbackPromptExample: LandingPromptExample = {
  id: 'fallback-story',
  source: 'idea',
  label: 'Story prompt',
  text: 'A lone warrior returns to a kingdom in ruins, seeking redemption.',
}

export const orbitNodes: LandingOrbitNode[] = [
  {
    className: 'is-characters',
    title: 'Characters',
    icon: 'characters',
    alternates: [
      { title: 'Factions', icon: 'factions' },
      { title: 'Portraits', icon: 'characters' },
      { title: 'Voices', icon: 'audio' },
    ],
  },
  {
    className: 'is-stories',
    title: 'Scripts',
    icon: 'script',
    alternates: [
      { title: 'Cinematics', icon: 'cinematic' },
      { title: 'Storyboards', icon: 'stories' },
      { title: 'Dialogue', icon: 'script' },
    ],
  },
  {
    className: 'is-locations',
    title: 'Locations',
    icon: 'locations',
    alternates: [
      { title: 'Maps', icon: 'maps' },
      { title: 'Regions', icon: 'locations' },
      { title: 'Routes', icon: 'timelines' },
    ],
  },
  {
    className: 'is-items',
    title: 'Items',
    icon: 'items',
    alternates: [
      { title: 'Artifacts', icon: 'items' },
      { title: 'Spells', icon: 'magic' },
      { title: 'Props', icon: 'game' },
    ],
  },
  {
    className: 'is-lore',
    title: 'Lore',
    icon: 'lore',
    alternates: [
      { title: 'Mythology', icon: 'magic' },
      { title: 'Canon', icon: 'graph' },
      { title: 'Brand', icon: 'marketing' },
    ],
  },
  {
    className: 'is-timelines',
    title: 'Events',
    icon: 'timelines',
    alternates: [
      { title: 'Episodes', icon: 'stories' },
      { title: 'Quests', icon: 'quests' },
      { title: 'Launches', icon: 'marketing' },
    ],
  },
]

const outputCards: LandingOutputCard[] = [
  {
    title: 'Cinematic Content',
    copy: 'Scenes, trailers, storyboard shots & more.',
    icon: 'cinematic',
    media: 'atlas-cinematic',
    chips: ['Teaser', 'Scenes', '+12'],
  },
  {
    title: 'Character Content',
    copy: 'Portraits, expressions, turnarounds & sheets.',
    icon: 'characters',
    media: 'atlas-character',
    chips: ['Portrait', 'Sheet', '+8'],
  },
  {
    title: 'Stories & Scripts',
    copy: 'Scripts, dialogue, novels & entries.',
    icon: 'script',
    media: 'atlas-script',
    chips: ['DOCX', 'PDF', 'TXT'],
  },
  {
    title: 'Brand & Marketing',
    copy: 'Logos, posters, packaging & brand kits.',
    icon: 'marketing',
    media: 'atlas-brand',
    chips: ['Poster', 'Kit', 'Cover'],
  },
  {
    title: 'Game Assets',
    copy: '3D concepts, props, icons & environments.',
    icon: 'game',
    media: 'atlas-game',
    chips: ['Sword', 'Shield', '+25'],
  },
  {
    title: 'Audio & Voice',
    copy: 'Music, SFX, ambience & voice lines.',
    icon: 'audio',
    media: 'atlas-audio',
    chips: ['Theme', 'Ambience', 'VO'],
  },
]

const metrics = [
  { label: 'Early creators', value: '2,300+' },
  { label: 'Worlds created', value: '180K+' },
  { label: 'User rating', value: '4.9/5' },
]

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
      {id === 'quests' ? (
        <>
          <path d="M13 10h22v28H13V10Z" />
          <path d="M18 18h12M18 25h9M18 32h7" />
          <path d="m32 30 3 3 6-8" />
          <circle cx="13" cy="10" r="2.4" />
          <circle cx="35" cy="10" r="2.4" />
        </>
      ) : null}
      {id === 'locations' ? (
        <>
          <path d="M24 42s13-12.1 13-23A13 13 0 0 0 11 19c0 10.9 13 23 13 23Z" />
          <circle cx="24" cy="19" r="5" />
        </>
      ) : null}
      {id === 'maps' ? (
        <>
          <path d="M8 13 18 9l12 4 10-4v26l-10 4-12-4-10 4V13Z" />
          <path d="M18 9v26M30 13v26" />
          <path d="M13 22c4-3 8-3 11 0s7 3 11 0" />
        </>
      ) : null}
      {id === 'items' ? (
        <>
          <path d="M24 7 38 15v18L24 41 10 33V15l14-8Z" />
          <path d="M10 15l14 8 14-8M24 23v18" />
        </>
      ) : null}
      {id === 'magic' ? (
        <>
          <path d="M24 7v10M24 31v10M7 24h10M31 24h10" />
          <path d="m14 14 7 7M27 27l7 7M34 14l-7 7M21 27l-7 7" />
          <path d="M24 18c2.5 3.2 4.4 5.1 8 6-3.6.9-5.5 2.8-8 6-2.5-3.2-4.4-5.1-8-6 3.6-.9 5.5-2.8 8-6Z" />
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
      {id === 'marketing' ? (
        <>
          <path d="M9 28h7l18 8V12L16 20H9v8Z" />
          <path d="M16 28v9M37 19l5-3M38 26h5M37 33l5 3" />
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
      {id === 'audio' ? (
        <>
          <path d="M8 28v-8M14 34V14M20 38V10M26 34V14M32 28v-8M38 32V16" />
        </>
      ) : null}
    </svg>
  )
}

function LandingPromptSourceIcon({ source }: { source: LandingPromptSource }) {
  return (
    <svg aria-hidden="true" className="landing-prompt-source-glyph" viewBox="0 0 48 48">
      {source === 'idea' ? (
        <>
          <path d="M24 7v10M24 31v10M7 24h10M31 24h10" />
          <path d="m13 13 7 7M28 28l7 7M35 13l-7 7M20 28l-7 7" />
          <circle cx="24" cy="24" r="3.2" />
        </>
      ) : null}
      {source === 'pdf' ? (
        <>
          <path d="M14 7h15l8 8v26H14V7Z" />
          <path d="M29 7v9h8M18 25h12M18 31h9" />
          <path d="M18 18h7" />
        </>
      ) : null}
      {source === 'url' ? (
        <>
          <path d="M19 28c-3 3-7.8 3-10.8 0s-3-7.8 0-10.8l4-4c3-3 7.8-3 10.8 0" />
          <path d="M29 20c3-3 7.8-3 10.8 0s3 7.8 0 10.8l-4 4c-3 3-7.8 3-10.8 0" />
          <path d="M18 30 30 18" />
        </>
      ) : null}
      {source === 'brand' ? (
        <>
          <path d="M24 8 37 15.5v17L24 40 11 32.5v-17L24 8Z" />
          <path d="M11 15.5 24 23l13-7.5M24 23v17" />
          <circle cx="9" cy="9" r="2.5" />
          <circle cx="39" cy="9" r="2.5" />
          <circle cx="9" cy="39" r="2.5" />
          <circle cx="39" cy="39" r="2.5" />
        </>
      ) : null}
      {source === 'game' ? (
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

function useAnimatedLandingPrompt(examples: LandingPromptExample[]) {
  const promptExamples = examples.length > 0 ? examples : [fallbackPromptExample]
  const prefersReducedMotion = usePrefersReducedMotion()
  const [activeIndex, setActiveIndex] = useState(0)
  const [visibleText, setVisibleText] = useState('')
  const [phase, setPhase] = useState<LandingPromptPhase>('typing')
  const activeExample = promptExamples[activeIndex] ?? promptExamples[0]

  useEffect(() => {
    if (prefersReducedMotion) {
      setActiveIndex(0)
      setVisibleText(promptExamples[0].text)
      setPhase('holding')
    }
  }, [prefersReducedMotion, promptExamples])

  useEffect(() => {
    if (prefersReducedMotion) return

    let timeoutId: number
    const typingMsPerChar = activeExample.typingMsPerChar ?? 28
    const holdMs = activeExample.holdMs ?? 2200
    const clearMs = activeExample.clearMs ?? 360

    if (phase === 'typing') {
      if (visibleText.length < activeExample.text.length) {
        timeoutId = window.setTimeout(() => {
          setVisibleText(activeExample.text.slice(0, visibleText.length + 1))
        }, typingMsPerChar)
      } else {
        timeoutId = window.setTimeout(() => setPhase('holding'), 120)
      }
    } else if (phase === 'holding') {
      timeoutId = window.setTimeout(() => setPhase('clearing'), holdMs)
    } else {
      timeoutId = window.setTimeout(() => {
        setActiveIndex((currentIndex) => (currentIndex + 1) % promptExamples.length)
        setVisibleText('')
        setPhase('typing')
      }, clearMs)
    }

    return () => window.clearTimeout(timeoutId)
  }, [activeExample, phase, prefersReducedMotion, promptExamples.length, visibleText])

  return {
    activeExample,
    visibleText: visibleText || (phase === 'typing' ? '' : activeExample.text),
    phase,
    isSwitching: phase === 'clearing',
  }
}

function getOrbitVariant(node: LandingOrbitNode, variantIndex: number): LandingOrbitVariant {
  const variants: LandingOrbitVariant[] = [
    { title: node.title, icon: node.icon },
    ...(node.alternates ?? []),
  ]

  return variants[variantIndex % variants.length] ?? variants[0]
}

function createInitialOrbitNodes(): LandingOrbitDisplayNode[] {
  return orbitNodes.map((node) => ({
    ...node,
    variantIndex: 0,
  }))
}

function useRotatingOrbitNodes() {
  const prefersReducedMotion = usePrefersReducedMotion()
  const recentSlotClassNameRef = useRef<string | null>(null)
  const [activeNodes, setActiveNodes] = useState<LandingOrbitDisplayNode[]>(createInitialOrbitNodes)
  const [swapState, setSwapState] = useState<LandingOrbitSwapState | null>(null)

  useEffect(() => {
    if (prefersReducedMotion) {
      setActiveNodes(createInitialOrbitNodes())
      setSwapState(null)
      return
    }

    let startTimeoutId: number
    let swapTimeoutId: number
    let settleTimeoutId: number
    let cancelled = false

    const scheduleNextSwap = () => {
      const delayMs = 4300 + Math.random() * 2600

      startTimeoutId = window.setTimeout(() => {
        if (cancelled) return

        const swappableSlots = orbitNodes.filter(
          (node) => node.alternates?.length && node.className !== recentSlotClassNameRef.current,
        )
        const slot = swappableSlots[Math.floor(Math.random() * swappableSlots.length)] ?? orbitNodes[0]
        recentSlotClassNameRef.current = slot.className
        setSwapState({ slotClassName: slot.className, phase: 'out' })

        swapTimeoutId = window.setTimeout(() => {
          if (cancelled) return

          setActiveNodes((currentNodes) =>
            currentNodes.map((currentNode) => {
              if (currentNode.className !== slot.className) return currentNode

              const nextVariantIndex =
                (currentNode.variantIndex + 1) % (1 + (slot.alternates?.length ?? 0))
              const nextVariant = getOrbitVariant(slot, nextVariantIndex)

              return {
                ...currentNode,
                title: nextVariant.title,
                icon: nextVariant.icon,
                variantIndex: nextVariantIndex,
              }
            }),
          )
          setSwapState({ slotClassName: slot.className, phase: 'in' })

          settleTimeoutId = window.setTimeout(() => {
            if (cancelled) return

            setSwapState(null)
            scheduleNextSwap()
          }, 360)
        }, 280)
      }, delayMs)
    }

    scheduleNextSwap()

    return () => {
      cancelled = true
      window.clearTimeout(startTimeoutId)
      window.clearTimeout(swapTimeoutId)
      window.clearTimeout(settleTimeoutId)
    }
  }, [prefersReducedMotion])

  return { activeNodes, swapState }
}

function useOrbitIconEdges(
  stageRef: RefObject<HTMLDivElement | null>,
  activeNodes: LandingOrbitDisplayNode[],
) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const [edges, setEdges] = useState<LandingOrbitEdge[]>([])
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const stageElement = stageRef.current
    if (!stageElement) return

    let animationFrameId = 0
    let isResizeMeasureQueued = false
    let cancelled = false

    const measureEdges = () => {
      if (cancelled) return

      const stageRect = stageElement.getBoundingClientRect()
      const nextEdges = orbitEdgePairs.flatMap(([fromSlot, toSlot]) => {
        const fromFrame = stageElement.querySelector<HTMLElement>(
          `.landing-orbit-node[data-orbit-slot="${fromSlot}"] .landing-icon-frame`,
        )
        const toFrame = stageElement.querySelector<HTMLElement>(
          `.landing-orbit-node[data-orbit-slot="${toSlot}"] .landing-icon-frame`,
        )

        if (!fromFrame || !toFrame) return []

        const fromRect = fromFrame.getBoundingClientRect()
        const toRect = toFrame.getBoundingClientRect()

        return [
          {
            id: `${fromSlot}-${toSlot}`,
            x1: fromRect.left + fromRect.width / 2 - stageRect.left,
            y1: fromRect.top + fromRect.height / 2 - stageRect.top,
            x2: toRect.left + toRect.width / 2 - stageRect.left,
            y2: toRect.top + toRect.height / 2 - stageRect.top,
          },
        ]
      })

      setStageSize({ width: stageRect.width, height: stageRect.height })
      setEdges(nextEdges)
    }

    const measureOnAnimationFrame = () => {
      measureEdges()
      animationFrameId = window.requestAnimationFrame(measureOnAnimationFrame)
    }

    const scheduleMeasure = () => {
      if (isResizeMeasureQueued) return

      isResizeMeasureQueued = true
      window.requestAnimationFrame(() => {
        if (cancelled) return

        isResizeMeasureQueued = false
        measureEdges()
      })
    }

    const resizeObserver = new ResizeObserver(scheduleMeasure)
    resizeObserver.observe(stageElement)
    scheduleMeasure()
    window.addEventListener('resize', scheduleMeasure)
    if (!prefersReducedMotion) {
      animationFrameId = window.requestAnimationFrame(measureOnAnimationFrame)
    }

    return () => {
      cancelled = true
      window.cancelAnimationFrame(animationFrameId)
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
    }
  }, [activeNodes, prefersReducedMotion, stageRef])

  return { edges, stageSize }
}

function usePromptProofCurve(
  heroRef: RefObject<HTMLElement | null>,
  promptRef: RefObject<HTMLDivElement | null>,
  proofRef: RefObject<HTMLElement | null>,
) {
  const [curve, setCurve] = useState<LandingHeroCurve | null>(null)

  useLayoutEffect(() => {
    const heroElement = heroRef.current
    const promptElement = promptRef.current
    const proofElement = proofRef.current
    if (!heroElement || !promptElement || !proofElement) return

    let animationFrameId = 0
    let cancelled = false

    const measureCurve = () => {
      if (cancelled) return

      const heroRect = heroElement.getBoundingClientRect()
      const promptRect = promptElement.getBoundingClientRect()
      const proofRect = proofElement.getBoundingClientRect()
      const startX = promptRect.right - heroRect.left
      const startY = promptRect.top + promptRect.height / 2 - heroRect.top
      const endX = proofRect.left - heroRect.left
      const endY = proofRect.top + Math.min(proofRect.height * 0.34, 130) - heroRect.top
      const controlOffset = Math.max(80, Math.min(220, (endX - startX) * 0.48))
      const d = `M ${startX} ${startY} C ${startX + controlOffset} ${startY - 14}, ${endX - controlOffset} ${endY - 22}, ${endX} ${endY}`

      setCurve({ d, width: heroRect.width, height: heroRect.height })
    }

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(animationFrameId)
      animationFrameId = window.requestAnimationFrame(measureCurve)
    }

    const resizeObserver = new ResizeObserver(scheduleMeasure)
    resizeObserver.observe(heroElement)
    resizeObserver.observe(promptElement)
    resizeObserver.observe(proofElement)
    scheduleMeasure()
    window.addEventListener('resize', scheduleMeasure)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(animationFrameId)
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
    }
  }, [heroRef, promptRef, proofRef])

  return curve
}

type LandingPageProps = {
  isSignedIn: boolean
  onEnterApp: () => void
  onOpenAuth: () => void
}

export function LandingPage({
  isSignedIn,
  onEnterApp,
  onOpenAuth,
}: LandingPageProps) {
  const rootRef = useRef<HTMLElement | null>(null)
  const heroRef = useRef<HTMLElement | null>(null)
  const promptCardRef = useRef<HTMLDivElement | null>(null)
  const proofPanelRef = useRef<HTMLElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const animatedPrompt = useAnimatedLandingPrompt(landingPromptExamples)
  const orbitAnimation = useRotatingOrbitNodes()
  const orbitEdges = useOrbitIconEdges(stageRef, orbitAnimation.activeNodes)
  const promptProofCurve = usePromptProofCurve(heroRef, promptCardRef, proofPanelRef)

  useGSAP(() => {
    if (!rootRef.current) return

    gsap.fromTo(
      '.landing-nav, .landing-hero-copy > *, .landing-prompt-card, .landing-world-stage, .landing-proof-panel',
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, stagger: 0.055, duration: 0.85, ease: 'power3.out' },
    )

    gsap.fromTo(
      '.landing-orbit-node, .landing-output-card, .landing-proof-card, .landing-metric',
      { opacity: 0, y: 26, scale: 0.97 },
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

    gsap.to('.landing-world-core', {
      y: -16,
      scale: 1.015,
      rotate: 0.6,
      transformOrigin: '50% 50%',
      duration: 3.2,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
    })
  }, { scope: rootRef })

  return (
    <main className="landing-shell" ref={rootRef}>
      <header className="landing-nav-shell">
        <nav className="landing-nav" aria-label="GraphCore landing navigation">
          <button className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} type="button">
            <span className="landing-brand-mark" aria-hidden="true">
              <span />
            </span>
            <span>GraphCore</span>
          </button>

          <div className="landing-nav-links">
            {navLinks.map((link) => (
              <a href={link === 'Pricing' ? '#proof' : `#${link.toLowerCase().replace(/\s+/g, '-')}`} key={link}>
                {link}
              </a>
            ))}
          </div>

          <div className="landing-nav-actions">
            <button className="landing-login-button" onClick={onEnterApp} type="button">
              {isSignedIn ? 'Open app' : 'Log in'}
            </button>
            <button className="landing-cta-button" onClick={onOpenAuth} type="button">
              {isSignedIn ? 'Continue Building' : 'Get Early Access'}
              <span aria-hidden="true">-&gt;</span>
            </button>
          </div>
        </nav>
      </header>

      <section className="landing-hero-section" id="product" ref={heroRef}>
        {promptProofCurve ? (
          <svg
            aria-hidden="true"
            className="landing-prompt-proof-curve-layer"
            viewBox={`0 0 ${promptProofCurve.width} ${promptProofCurve.height}`}
          >
            <defs>
              <linearGradient id="landing-prompt-proof-gradient" x1="0%" x2="100%" y1="0%" y2="0%">
                <stop offset="0%" stopColor="#d36cff" stopOpacity="0.08" />
                <stop offset="34%" stopColor="#8b3cff" stopOpacity="0.54" />
                <stop offset="72%" stopColor="#39d8ff" stopOpacity="0.46" />
                <stop offset="100%" stopColor="#2277ff" stopOpacity="0.1" />
              </linearGradient>
              <filter id="landing-prompt-proof-glow" x="-18%" y="-160%" width="136%" height="420%">
                <feGaussianBlur stdDeviation="3.8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path className="landing-prompt-proof-curve" d={promptProofCurve.d} />
            <path className="landing-prompt-proof-curve-glow" d={promptProofCurve.d} filter="url(#landing-prompt-proof-glow)" />
          </svg>
        ) : null}
        <div className="landing-hero-copy">
          <div className="landing-kicker-row">
            <span className="landing-chip">Early access</span>
            <span>Build worlds. Generate anything.</span>
          </div>
          <h1>
            Create a world.
            <span>Everything</span>
            comes from it.
          </h1>
          <p>
            Start with an idea. Watch it transform into a connected world and every asset, script, scene, and rule needed to bring it to life.
          </p>
          <div className="landing-hero-actions">
            <button className="landing-cta-button" onClick={onOpenAuth} type="button">
              {isSignedIn ? 'Continue Building' : 'Get Early Access'}
              <span aria-hidden="true">-&gt;</span>
            </button>
            <button className="landing-secondary-button" onClick={onEnterApp} type="button">
              <span className="landing-play-icon" aria-hidden="true" />
              Watch Demo
            </button>
          </div>
          <div className="landing-trust-line">
            <span>No credit card</span>
            <span>Cancel anytime</span>
            <span>Limited spots</span>
          </div>
        </div>

        <div className="landing-hero-system" aria-label="Prompt to connected world diagram">
          <div className="landing-prompt-wrap">
            <span>Start with an idea</span>
            <div
              className={`landing-prompt-card${animatedPrompt.isSwitching ? ' is-switching' : ''}`}
              ref={promptCardRef}
            >
              <span className="landing-prompt-source-icon" key={animatedPrompt.activeExample.id} aria-hidden="true">
                <LandingPromptSourceIcon source={animatedPrompt.activeExample.source} />
              </span>
              <p className="landing-prompt-text" aria-label={animatedPrompt.activeExample.text}>
                <span>{animatedPrompt.visibleText}</span>
                <span className="landing-prompt-caret" aria-hidden="true" />
              </p>
              <span className="landing-send-mark" aria-hidden="true">-&gt;</span>
            </div>
          </div>

          <div className="landing-world-stage" ref={stageRef}>
            <svg
              aria-hidden="true"
              className="landing-orbit-edge-layer"
              viewBox={`0 0 ${orbitEdges.stageSize.width || 760} ${orbitEdges.stageSize.height || 623}`}
            >
              <defs>
                <linearGradient id="landing-orbit-edge-gradient" x1="0%" x2="100%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="#8b3cff" stopOpacity="0.3" />
                  <stop offset="48%" stopColor="#39d8ff" stopOpacity="0.44" />
                  <stop offset="100%" stopColor="#2277ff" stopOpacity="0.24" />
                </linearGradient>
                <filter id="landing-orbit-edge-glow" x="-30%" y="-60%" width="160%" height="220%">
                  <feGaussianBlur stdDeviation="2.6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {orbitEdges.edges.map((edge) => (
                <line
                  className="landing-orbit-edge"
                  filter="url(#landing-orbit-edge-glow)"
                  key={edge.id}
                  x1={edge.x1}
                  x2={edge.x2}
                  y1={edge.y1}
                  y2={edge.y2}
                />
              ))}
            </svg>
            <img className="landing-world-core" alt="Glowing connected world graph core" src="/landing/hero-world-core-v4.png" />
            {orbitAnimation.activeNodes.map((node) => {
              const swapClass =
                orbitAnimation.swapState?.slotClassName === node.className
                  ? ` is-orbit-swapping-${orbitAnimation.swapState.phase}`
                  : ''

              return (
                <article
                  className={`landing-orbit-node ${node.className}${swapClass}`}
                  data-orbit-slot={node.className}
                  key={node.className}
                >
                  <span className="landing-orbit-node-drift">
                    <span className="landing-orbit-node-inner">
                      <strong>{node.title}</strong>
                      <span className="landing-icon-frame">
                        <LandingIcon id={node.icon} />
                      </span>
                    </span>
                  </span>
                </article>
              )
            })}
          </div>
        </div>

        <aside className="landing-proof-panel" ref={proofPanelRef}>
          <h2>Everything stays connected.</h2>
          <p>Change one thing, and it flows everywhere.</p>
          <img className="landing-mini-network" src="/landing/connected-network-v1.png" alt="" aria-hidden="true" />
          <p>One source of truth. Infinite possibilities.</p>
        </aside>
      </section>

      <section className="landing-output-section" id="use-cases">
        <div className="landing-output-flow" aria-hidden="true">
          <svg viewBox="0 0 1200 260" preserveAspectRatio="none">
            <defs>
              <linearGradient id="landing-flow-gradient" x1="0%" x2="100%" y1="0%" y2="0%">
                <stop offset="0%" stopColor="#8b3cff" stopOpacity="0.82" />
                <stop offset="52%" stopColor="#d36cff" stopOpacity="0.72" />
                <stop offset="100%" stopColor="#39d8ff" stopOpacity="0.82" />
              </linearGradient>
              <linearGradient id="landing-flow-pulse-gradient" x1="0%" x2="100%" y1="0%" y2="0%">
                <stop offset="0%" stopColor="#8b3cff" stopOpacity="0" />
                <stop offset="32%" stopColor="#d36cff" stopOpacity="0.54" />
                <stop offset="52%" stopColor="#f3fdff" stopOpacity="0.86" />
                <stop offset="72%" stopColor="#39d8ff" stopOpacity="0.54" />
                <stop offset="100%" stopColor="#2277ff" stopOpacity="0" />
              </linearGradient>
              <filter id="landing-flow-glow" x="-20%" y="-80%" width="140%" height="260%">
                <feGaussianBlur stdDeviation="3.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="landing-flow-pulse-glow" x="-24%" y="-120%" width="148%" height="340%">
                <feGaussianBlur stdDeviation="6.5" result="wideBlur" />
                <feColorMatrix
                  in="wideBlur"
                  result="softGlow"
                  type="matrix"
                  values="0 0 0 0 0.22 0 0 0 0 0.82 0 0 0 0 1 0 0 0 0.62 0"
                />
                <feMerge>
                  <feMergeNode in="softGlow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path className="landing-flow-line is-one" d="M600 0 C575 58 118 60 90 248" />
            <path className="landing-flow-line is-two" d="M600 0 C592 72 308 76 294 248" />
            <path className="landing-flow-line is-three" d="M600 0 C604 92 498 98 498 248" />
            <path className="landing-flow-line is-four" d="M600 0 C596 92 702 98 702 248" />
            <path className="landing-flow-line is-five" d="M600 0 C608 72 892 76 906 248" />
            <path className="landing-flow-line is-six" d="M600 0 C625 58 1082 60 1110 248" />
            <path className="landing-flow-pulse-glow is-one" d="M600 0 C575 58 118 60 90 248" />
            <path className="landing-flow-pulse-glow is-two" d="M600 0 C592 72 308 76 294 248" />
            <path className="landing-flow-pulse-glow is-three" d="M600 0 C604 92 498 98 498 248" />
            <path className="landing-flow-pulse-glow is-four" d="M600 0 C596 92 702 98 702 248" />
            <path className="landing-flow-pulse-glow is-five" d="M600 0 C608 72 892 76 906 248" />
            <path className="landing-flow-pulse-glow is-six" d="M600 0 C625 58 1082 60 1110 248" />
            <path className="landing-flow-pulse is-one" d="M600 0 C575 58 118 60 90 248" />
            <path className="landing-flow-pulse is-two" d="M600 0 C592 72 308 76 294 248" />
            <path className="landing-flow-pulse is-three" d="M600 0 C604 92 498 98 498 248" />
            <path className="landing-flow-pulse is-four" d="M600 0 C596 92 702 98 702 248" />
            <path className="landing-flow-pulse is-five" d="M600 0 C608 72 892 76 906 248" />
            <path className="landing-flow-pulse is-six" d="M600 0 C625 58 1082 60 1110 248" />
            <circle className="landing-flow-dot" cx="600" cy="0" r="4" />
            <circle className="landing-flow-dot" cx="90" cy="248" r="3" />
            <circle className="landing-flow-dot" cx="294" cy="248" r="3" />
            <circle className="landing-flow-dot" cx="498" cy="248" r="3" />
            <circle className="landing-flow-dot" cx="702" cy="248" r="3" />
            <circle className="landing-flow-dot" cx="906" cy="248" r="3" />
            <circle className="landing-flow-dot" cx="1110" cy="248" r="3" />
          </svg>
        </div>
        <div className="landing-output-grid">
          {outputCards.map((card) => (
            <article className="landing-output-card" key={card.title}>
              <header>
                <span className="landing-icon-frame">
                  <LandingIcon id={card.icon} />
                </span>
                <div>
                  <strong>{card.title}</strong>
                  <p>{card.copy}</p>
                </div>
              </header>
              <div className={`landing-output-media ${card.media}`} />
              <div className="landing-card-chips">
                {card.chips.map((chip) => (
                  <span key={chip}>{chip}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-proof-strip" id="proof">
        <article className="landing-proof-card">
          <span className="landing-avatar is-one" aria-hidden="true">S</span>
          <blockquote>
            "I built an entire series, 50+ characters, and a brand universe in one weekend. This changes everything."
          </blockquote>
          <span>@StoryArchivist - 2.3M followers</span>
        </article>

        <div className="landing-metrics" aria-label="GraphCore usage metrics">
          {metrics.map((metric) => (
            <div className="landing-metric" key={metric.label}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
        </div>

        <article className="landing-proof-card">
          <span className="landing-avatar is-two" aria-hidden="true">L</span>
          <blockquote>
            "Finally, a tool that keeps my brand content consistent across every platform. Huge time saver."
          </blockquote>
          <span>@founderlydia - Founder</span>
        </article>
      </section>

      <section className="landing-final-section" id="examples">
        <div className="landing-final-panel">
          <span className="landing-chip">Graph-native worldbuilding</span>
          <h2>One world. Every format. Total consistency.</h2>
          <p>
            Build canon once, then turn it into scripts, visuals, campaign kits, game assets, and audio without losing the thread.
          </p>
          <div className="landing-hero-actions">
            <button className="landing-cta-button" onClick={onOpenAuth} type="button">
              {isSignedIn ? 'Return To App' : 'Start Building'}
              <span aria-hidden="true">-&gt;</span>
            </button>
            <button className="landing-secondary-button" onClick={onEnterApp} type="button">
              Open Workspace
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
