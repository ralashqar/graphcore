import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import landingVideoGroups from './landingVideoGroups.json'

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

type LandingOutputCard = {
  title: string
  copy: string
  icon: LandingIconId
  chips: string[]
}

type LandingWorkflowStep = {
  label: string
  title: string
  copy: string
}

type LandingPainPoint = {
  title: string
  copy: string
  icon: 'context' | 'continuity' | 'workflow' | 'manual'
}

const navLinks = [
  { label: 'Product', href: '#product' },
  { label: 'Shift', href: '#shift' },
  { label: 'World Memory', href: '#world-memory' },
  { label: 'Outputs', href: '#outputs' },
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

const outputCards: LandingOutputCard[] = [
  {
    title: 'Character reference sheets',
    copy: 'Stable visual identity, traits, costumes, turnarounds and production references for every key character.',
    icon: 'characters',
    chips: ['Identity', 'Traits', 'Visual refs'],
  },
  {
    title: 'Storyboards and comics',
    copy: 'Panels and sequences generated from the same cast, location history, art direction and canon.',
    icon: 'stories',
    chips: ['Panels', 'Sequences', 'Canon-aware'],
  },
  {
    title: 'Cinematic shot plans',
    copy: 'Shot logic, camera language, scene beats and continuity maps grounded in the persistent world.',
    icon: 'cinematic',
    chips: ['Shots', 'Beats', 'Continuity'],
  },
  {
    title: 'Movie-style scenes',
    copy: 'Prompt a scene and SynArc pulls the right people, place, mood, history and visual truth before generation.',
    icon: 'game',
    chips: ['Scene', 'Video', 'Final output'],
  },
  {
    title: 'World wiki and canon',
    copy: 'A living source of truth for characters, factions, lore, relationships, timelines and locations.',
    icon: 'lore',
    chips: ['Wiki', 'Canon', 'Memory'],
  },
  {
    title: 'Updated continuity',
    copy: 'New events feed back into the world so future prompts inherit what just happened.',
    icon: 'timelines',
    chips: ['Events', 'Timeline', 'State'],
  },
]

const workflowSteps: LandingWorkflowStep[] = [
  {
    label: '01',
    title: 'Prompt',
    copy: 'Ask for a scene, episode, comic beat or cinematic moment.',
  },
  {
    label: '02',
    title: 'World context',
    copy: 'SynArc resolves canon, relationships, timeline placement and location history.',
  },
  {
    label: '03',
    title: 'Reference truth',
    copy: 'Characters, traits, costumes, style guides and visual sheets are pulled into the run.',
  },
  {
    label: '04',
    title: 'Scene direction',
    copy: 'The system plans beats, dialogue, shots and continuity before generation.',
  },
  {
    label: '05',
    title: 'Output',
    copy: 'Generate storyboards, comics, cinematics and movie-style scenes from the same world.',
  },
  {
    label: '06',
    title: 'Updated canon',
    copy: 'The new event becomes memory for the next creative prompt.',
  },
]

const continuityPillars = [
  'Characters',
  'Locations',
  'Lore + canon',
  'Relationships',
  'Timelines',
  'Visual references',
]

const marketPainPoints: LandingPainPoint[] = [
  {
    title: 'Rebuilding context',
    copy: 'Every new scene starts by re-explaining the world.',
    icon: 'context',
  },
  {
    title: 'Maintaining continuity',
    copy: 'Characters, relationships and timelines drift across tools.',
    icon: 'continuity',
  },
  {
    title: 'Stitching tools together',
    copy: 'Images, videos, docs and references move manually between systems.',
    icon: 'workflow',
  },
  {
    title: 'Losing creative time',
    copy: 'More time managing fragments. Less time directing the story.',
    icon: 'manual',
  },
]

type LandingPageProps = {
  isSignedIn: boolean
  onEnterApp: () => void
  onOpenAuth: () => void
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

function LandingPainIcon({ icon }: { icon: LandingPainPoint['icon'] }) {
  return (
    <svg aria-hidden="true" className="landing-market-pain-icon" viewBox="0 0 48 48">
      {icon === 'context' ? (
        <>
          <circle cx="24" cy="24" r="15" />
          <path d="M24 13v12l8 5" />
        </>
      ) : null}
      {icon === 'continuity' ? (
        <>
          <circle cx="18" cy="18" r="6" />
          <path d="M8 38c1.5-7 5-10.5 10-10.5S26.5 31 28 38" />
          <circle cx="32" cy="19" r="5" />
          <path d="M29 29c4.8 0 8.3 3 10 9" />
        </>
      ) : null}
      {icon === 'workflow' ? (
        <>
          <path d="M8 15h13l4 5h15v18H8V15Z" />
          <path d="M8 20h32" />
        </>
      ) : null}
      {icon === 'manual' ? (
        <>
          <path d="M15 7h18M15 41h18M18 7c0 9 12 9 12 17S18 32 18 41M30 7c0 9-12 9-12 17s12 8 12 17" />
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
}: LandingPageProps) {
  const rootRef = useRef<HTMLElement | null>(null)
  const heroSectionRef = useRef<HTMLElement | null>(null)
  const heroPromptRef = useRef<HTMLElement | null>(null)
  const outputFrameRef = useRef<HTMLDivElement | null>(null)
  const [heroConnector, setHeroConnector] = useState<{
    d: string
    width: number
    height: number
  } | null>(null)
  const outputVideoGroups = landingVideoGroups.groups
  const [activeOutputGroupIndex, setActiveOutputGroupIndex] = useState(0)
  const outputVideoGroup = outputVideoGroups[activeOutputGroupIndex] ?? outputVideoGroups[0]
  const outputVideos = outputVideoGroup?.videos ?? []
  const [activeOutputVideoIndex, setActiveOutputVideoIndex] = useState(0)
  const activeOutputVideo = outputVideos[activeOutputVideoIndex] ?? outputVideos[0]
  const shouldLoopOutputVideo = outputVideoGroups.length <= 1 && outputVideos.length <= 1
  const heroPrompt = useAnimatedHeroPrompt(outputVideoGroup?.prompt ?? '')

  useEffect(() => {
    setActiveOutputVideoIndex(0)
  }, [outputVideoGroup?.id])

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

  useEffect(() => {
    const heroSection = heroSectionRef.current
    const heroPromptElement = heroPromptRef.current
    const outputFrameElement = outputFrameRef.current

    if (!heroSection || !heroPromptElement || !outputFrameElement) return

    let animationFrameId = 0

    const updateConnector = () => {
      window.cancelAnimationFrame(animationFrameId)

      animationFrameId = window.requestAnimationFrame(() => {
        const sectionRect = heroSection.getBoundingClientRect()
        const promptRect = heroPromptElement.getBoundingClientRect()
        const outputRect = outputFrameElement.getBoundingClientRect()

        if (sectionRect.width <= 0 || sectionRect.height <= 0) {
          setHeroConnector(null)
          return
        }

        const startX = promptRect.right - sectionRect.left - 4
        const startY = promptRect.top - sectionRect.top + promptRect.height * 0.58
        const endX = outputRect.left - sectionRect.left + 4
        const endY = outputRect.top - sectionRect.top + outputRect.height * 0.42
        const distance = Math.max(24, endX - startX)
        const controlOffset = Math.min(180, distance * 0.5)
        const d = [
          `M ${startX.toFixed(1)} ${startY.toFixed(1)}`,
          `C ${(startX + controlOffset).toFixed(1)} ${startY.toFixed(1)}`,
          `${(endX - controlOffset).toFixed(1)} ${endY.toFixed(1)}`,
          `${endX.toFixed(1)} ${endY.toFixed(1)}`,
        ].join(' ')

        setHeroConnector({
          d,
          width: Math.round(sectionRect.width),
          height: Math.round(sectionRect.height),
        })
      })
    }

    const resizeObserver = new ResizeObserver(updateConnector)
    resizeObserver.observe(heroSection)
    resizeObserver.observe(heroPromptElement)
    resizeObserver.observe(outputFrameElement)

    updateConnector()
    window.addEventListener('resize', updateConnector)

    return () => {
      window.cancelAnimationFrame(animationFrameId)
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateConnector)
    }
  }, [activeOutputGroupIndex, activeOutputVideoIndex, heroPrompt.visibleText])

  useGSAP(() => {
    if (!rootRef.current) return

    gsap.fromTo(
      '.landing-nav, .landing-hero-copy > *, .landing-hero-visual, .landing-shift-copy, .landing-continuity-visual',
      { y: 18 },
      { y: 0, stagger: 0.055, duration: 0.85, ease: 'power3.out' },
    )

    gsap.fromTo(
      '.landing-workflow-step, .landing-market-pain-row, .landing-output-card, .landing-continuity-pill',
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
            <button className="landing-login-button" onClick={onEnterApp} type="button">
              {isSignedIn ? 'Open app' : 'Log in'}
            </button>
            <button className="landing-cta-button" onClick={onOpenAuth} type="button">
              {isSignedIn ? 'Open Workspace' : 'Join Waitlist'}
              <span aria-hidden="true">-&gt;</span>
            </button>
          </div>
        </nav>
      </header>

      <section className="landing-hero-section landing-studio-hero" id="product" ref={heroSectionRef}>
        <div className="landing-hero-copy">
          <div className="landing-kicker-row">
            <span className="landing-chip">Persistent creative operating system</span>
          </div>
          <h1>
            Create a world once.
            <span>Direct everything</span>
            from it.
          </h1>
          <p>
            SynArc is a world-native creative studio for AI storytelling. Build persistent characters,
            locations, lore, timelines and visual references, then generate scenes, comics,
            storyboards and cinematics from the same living world.
          </p>
          <div className="landing-hero-actions">
            <button className="landing-cta-button" onClick={onOpenAuth} type="button">
              {isSignedIn ? 'Open Workspace' : 'Request Early Access'}
              <span aria-hidden="true">-&gt;</span>
            </button>
            <button className="landing-secondary-button" onClick={onEnterApp} type="button">
              <span className="landing-play-icon" aria-hidden="true" />
              Watch Demo
            </button>
          </div>
        </div>

        <div className="landing-hero-visual" aria-label="World Studio prompt to output diagram">
          <article
            className={`landing-studio-prompt-card landing-hero-prompt-card${heroPrompt.isClearing ? ' is-clearing' : ''}`}
            ref={heroPromptRef}
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
          <figure className="landing-studio-graphic-frame">
            <img
              className="landing-studio-hero-image"
              src="/landing/worldStudio.png"
              alt="SynArc world studio diagram connecting creator prompts, world context and outputs"
            />
          </figure>
        </div>

        {heroConnector ? (
          <svg
            className="landing-hero-output-connector"
            viewBox={`0 0 ${heroConnector.width} ${heroConnector.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path className="landing-hero-output-connector-glow" d={heroConnector.d} />
            <path d={heroConnector.d} />
            <path className="landing-hero-output-connector-signal" d={heroConnector.d} />
          </svg>
        ) : null}

        <aside className="landing-hero-output-preview" aria-label="Example generated output placeholder">
          <div className="landing-output-preview-frame" ref={outputFrameRef}>
            {activeOutputVideo ? (
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
              {activeOutputGroupIndex + 1} / {outputVideoGroups.length}
            </span>
            <button
              type="button"
              onClick={() => handleOutputGroupNavigation('next')}
              aria-label="Next example prompt"
            >
              <LandingArrowIcon direction="right" />
            </button>
          </div>
          <p>
            A canon-aware output generated from the world: characters, location, style and story context stay connected.
          </p>
        </aside>
      </section>

      <section className="landing-shift-section" id="shift">
        <div className="landing-shift-copy">
          <span className="landing-chip">The shift</span>
          <h2>Generation is solved. Continuity isn't.</h2>
          <p>
            AI tools can create fragments. Creative universes need characters, locations,
            timelines, lore, visual references and outputs to stay connected as the project grows.
          </p>
        </div>
        <div className="landing-workflow-strip" aria-label="Prompt to final media workflow">
          {workflowSteps.map((step) => (
            <article className="landing-workflow-step" key={step.label}>
              <span>{step.label}</span>
              <strong>{step.title}</strong>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-market-section" id="market-pain">
        <div className="landing-market-copy">
          <span className="landing-chip">Creator pain</span>
          <h2>Your story is scattered across tools.</h2>
          <p>
            AI creators are not blocked by generation quality anymore. They are blocked by continuity:
            prompts, references, lore, timelines, character sheets and outputs living in different places.
          </p>
          <div className="landing-market-pain-list">
            {marketPainPoints.map((point) => (
              <article className="landing-market-pain-row" key={point.title}>
                <span className="landing-market-pain-icon-frame">
                  <LandingPainIcon icon={point.icon} />
                </span>
                <div>
                  <strong>{point.title}</strong>
                  <p>{point.copy}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="landing-market-callout">
            SynArc replaces digital archaeology with <span>one persistent creative world.</span>
          </div>
        </div>
        <figure className="landing-market-visual">
          <img
            src="/landing/Infographics/digitalArchaeology.png"
            alt="Digital archaeology diagram showing fragmented AI creative workflows across tools, files and references"
          />
        </figure>
      </section>

      <section className="landing-continuity-section" id="world-memory">
        <div className="landing-continuity-visual">
          <img
            src="/landing/synarcHeroGraphic.png"
            alt="SynArc persistent world graph connecting characters, lore, scripts, timelines, factions and locations"
          />
        </div>
        <div className="landing-continuity-copy">
          <span className="landing-chip">World memory</span>
          <h2>Everything comes from the same world.</h2>
          <p>
            SynArc keeps the creative source of truth alive underneath every workflow, so a fight scene,
            comic page, storyboard block or cinematic run can draw from the same canon and visual memory.
          </p>
          <div className="landing-continuity-pill-grid">
            {continuityPillars.map((pillar) => (
              <span className="landing-continuity-pill" key={pillar}>
                {pillar}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-output-section" id="outputs">
        <div className="landing-section-heading">
          <span className="landing-chip">Production paths</span>
          <h2>One world. Many production paths.</h2>
          <p>
            Outputs are no longer disconnected files. They are generated from shared world state,
            then folded back into the system as new continuity.
          </p>
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
              <div className="landing-card-chips">
                {card.chips.map((chip) => (
                  <span key={chip}>{chip}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-proof-strip" id="proof" aria-label="World-grounded production loop">
        {workflowSteps.map((step) => (
          <article className="landing-proof-card landing-workflow-proof-card" key={step.label}>
            <span>{step.label}</span>
            <strong>{step.title}</strong>
            <p>{step.copy}</p>
          </article>
        ))}
      </section>

      <section className="landing-final-section" id="examples">
        <div className="landing-final-panel">
          <span className="landing-chip">World-native studio</span>
          <h2>Build the world once. Create from it forever.</h2>
          <p>
            Turn persistent worlds into scenes, comics, cinematic plans and movie-style outputs without losing the thread.
          </p>
          <div className="landing-hero-actions">
            <button className="landing-cta-button" onClick={onOpenAuth} type="button">
              {isSignedIn ? 'Open Workspace' : 'Request Early Access'}
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
