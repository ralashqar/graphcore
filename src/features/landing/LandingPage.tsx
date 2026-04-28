import { useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(useGSAP, ScrollTrigger)

const navLinks = ['Product', 'Use Cases', 'Examples', 'Pricing', 'Resources', 'Company']

const orbitNodes = [
  {
    className: 'is-characters',
    title: 'Characters',
    copy: 'People, creatures, factions & relationships',
    icon: 'icon-characters',
  },
  {
    className: 'is-stories',
    title: 'Stories',
    copy: 'Plots, chapters, arcs & scripts',
    icon: 'icon-stories',
  },
  {
    className: 'is-locations',
    title: 'Locations',
    copy: 'Places, realms, maps & history',
    icon: 'icon-locations',
  },
  {
    className: 'is-items',
    title: 'Items & Gear',
    copy: 'Weapons, artifacts, equipment & magic',
    icon: 'icon-items',
  },
  {
    className: 'is-lore',
    title: 'Lore & Rules',
    copy: 'Magic systems, mythology & world rules',
    icon: 'icon-lore',
  },
  {
    className: 'is-timelines',
    title: 'Timelines',
    copy: 'Events, history, relationships & continuity',
    icon: 'icon-timelines',
  },
]

const outputCards = [
  {
    title: 'Cinematic Content',
    copy: 'Scenes, trailers, storyboard shots & more.',
    icon: 'icon-cinematic',
    media: 'atlas-cinematic',
    chips: ['Teaser', 'Scenes', '+12'],
  },
  {
    title: 'Character Content',
    copy: 'Portraits, expressions, turnarounds & sheets.',
    icon: 'icon-character-output',
    media: 'atlas-character',
    chips: ['Portrait', 'Sheet', '+8'],
  },
  {
    title: 'Stories & Scripts',
    copy: 'Scripts, dialogue, novels & entries.',
    icon: 'icon-script',
    media: 'atlas-script',
    chips: ['DOCX', 'PDF', 'TXT'],
  },
  {
    title: 'Brand & Marketing',
    copy: 'Logos, posters, packaging & brand kits.',
    icon: 'icon-marketing',
    media: 'atlas-brand',
    chips: ['Poster', 'Kit', 'Cover'],
  },
  {
    title: 'Game Assets',
    copy: '3D concepts, props, icons & environments.',
    icon: 'icon-game',
    media: 'atlas-game',
    chips: ['Sword', 'Shield', '+25'],
  },
  {
    title: 'Audio & Voice',
    copy: 'Music, SFX, ambience & voice lines.',
    icon: 'icon-audio',
    media: 'atlas-audio',
    chips: ['Theme', 'Ambience', 'VO'],
  },
]

const metrics = [
  { label: 'Early creators', value: '2,300+' },
  { label: 'Worlds created', value: '180K+' },
  { label: 'User rating', value: '4.9/5' },
]

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
      y: -10,
      duration: 3.6,
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

      <section className="landing-hero-section" id="product">
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
            <div className="landing-prompt-card">
              <span className="landing-spark" aria-hidden="true">*</span>
              <p>A lone warrior returns to a kingdom in ruins, seeking redemption.</p>
              <span className="landing-send-mark" aria-hidden="true">-&gt;</span>
            </div>
          </div>

          <div className="landing-world-stage">
            <div className="landing-world-aura" aria-hidden="true" />
            <img className="landing-world-core" alt="Glowing connected world graph core" src="/landing/hero-world-core-v2.png" />
            <div className="landing-core-ring" aria-hidden="true" />
            {orbitNodes.map((node) => (
              <article className={`landing-orbit-node ${node.className}`} key={node.title}>
                <span className={`landing-atlas-icon ${node.icon}`} aria-hidden="true" />
                <div>
                  <strong>{node.title}</strong>
                  <span>{node.copy}</span>
                </div>
              </article>
            ))}
            <span className="landing-origin-label">Everything comes from here</span>
          </div>
        </div>

        <aside className="landing-proof-panel">
          <h2>Everything stays connected.</h2>
          <p>Change one thing, and it flows everywhere.</p>
          <div className="landing-mini-network" aria-hidden="true">
            <span className="landing-mini-core" />
            {Array.from({ length: 8 }, (_, index) => (
              <span className={`landing-mini-node is-${index + 1}`} key={index} />
            ))}
          </div>
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
              <filter id="landing-flow-glow" x="-20%" y="-80%" width="140%" height="260%">
                <feGaussianBlur stdDeviation="3.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
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
                <span className={`landing-atlas-icon ${card.icon}`} aria-hidden="true" />
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
