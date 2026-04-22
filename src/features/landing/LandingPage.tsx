import { useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(useGSAP, ScrollTrigger)

const trustLogos = ['Disney', 'Netflix', 'Blizzard', 'Lucasfilm', 'Weta', 'A24']

const featureCards = [
  {
    title: 'Prompt-first creation',
    copy: 'Start from natural language. GraphCore scopes the turn, stages safe waves, and grows the world without losing structure.',
    image: 'https://picsum.photos/seed/graphcore-prompt/960/720',
  },
  {
    title: 'Living graph canvas',
    copy: 'Characters, groups, places, lore, and derived results stay navigable as one connected world surface.',
    image: 'https://picsum.photos/seed/graphcore-canvas/960/720',
  },
  {
    title: 'Dossier-based inspection',
    copy: 'Every node opens as a world dossier with context, usage, relationships, and follow-on actions built for continuity.',
    image: 'https://picsum.photos/seed/graphcore-dossier/960/720',
  },
  {
    title: 'Generation-ready continuity',
    copy: 'World threads, image queues, and cinematic references stay attached to the graph so production work follows story logic.',
    image: 'https://picsum.photos/seed/graphcore-cinematic/960/720',
  },
]

const creatorCards = [
  {
    title: 'Writers and narrative teams',
    copy: 'Grow canon, factions, history, locations, and conflicts without flattening everything into docs.',
    image: 'https://picsum.photos/seed/graphcore-writer/900/720',
  },
  {
    title: 'Studios and development teams',
    copy: 'Keep world logic, concept generation, and downstream references aligned from ideation through production.',
    image: 'https://picsum.photos/seed/graphcore-studio/900/720',
  },
  {
    title: 'Agencies and brand builders',
    copy: 'Build narrative worlds, recurring characters, and expandable universes around campaigns or launches.',
    image: 'https://picsum.photos/seed/graphcore-brand/900/720',
  },
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
  const showcaseRef = useRef<HTMLDivElement | null>(null)

  useGSAP(() => {
    if (!rootRef.current) return

    gsap.fromTo(
      '.landing-hero-copy > *',
      { opacity: 0, y: 26 },
      { opacity: 1, y: 0, stagger: 0.08, duration: 0.9, ease: 'power3.out' },
    )

    gsap.fromTo(
      '.landing-hero-art, .landing-feature-card, .landing-creator-card',
      { opacity: 0, y: 34, scale: 0.96 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.9,
        stagger: 0.1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: rootRef.current,
          start: 'top top+=120',
        },
      },
    )

    if (showcaseRef.current) {
      gsap.fromTo(
        '.landing-showcase-card',
        { y: 60, opacity: 0.24 },
        {
          y: (index) => index * -28,
          opacity: 1,
          stagger: 0.08,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: showcaseRef.current,
            start: 'top 70%',
            end: 'bottom bottom',
            scrub: 1,
          },
        },
      )

      ScrollTrigger.create({
        trigger: showcaseRef.current,
        start: 'top top+=96',
        end: 'bottom bottom-=96',
        pin: '.landing-showcase-copy',
        pinSpacing: false,
      })
    }
  }, { scope: rootRef })

  return (
    <main className="landing-shell" ref={rootRef}>
      <section className="landing-nav-shell">
        <nav className="landing-nav">
          <button className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} type="button">
            <span className="landing-brand-mark">G</span>
            <span>GraphCore</span>
          </button>
          <div className="landing-nav-links">
            <a href="#product">Product</a>
            <a href="#showcase">Showcase</a>
            <a href="#creators">Use Cases</a>
          </div>
          <div className="landing-nav-actions">
            <button className="ghost-button compact" onClick={onEnterApp} type="button">
              {isSignedIn ? 'Open App' : 'Sign In'}
            </button>
            <button className="landing-cta-button" onClick={onOpenAuth} type="button">
              {isSignedIn ? 'Continue Building' : 'Start Free'}
            </button>
          </div>
        </nav>
      </section>

      <section className="landing-hero-section">
        <div className="landing-hero-grid">
          <div className="landing-hero-copy">
            <span className="landing-chip">Prompt-first worldbuilding platform</span>
            <h1>
              Build worlds.
              {' '}
              <span className="landing-inline-image" style={{ backgroundImage: 'url(https://picsum.photos/seed/graphcore-inline/320/160)' }} />
              {' '}
              Grow canon.
              <br />
              Keep every thread connected.
            </h1>
            <p>
              GraphCore turns natural language into living world structure with scoped prompt turns, connected graph neighborhoods, and dossier-based inspection built for real continuity work.
            </p>
            <div className="landing-hero-actions">
              <button className="landing-cta-button" onClick={onOpenAuth} type="button">
                {isSignedIn ? 'Continue In App' : 'Start Building'}
              </button>
              <button className="landing-secondary-button" onClick={onEnterApp} type="button">
                Explore World Graph
              </button>
            </div>
            <div className="landing-trust-line">
              <div className="landing-avatar-row" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
              <p>Built for teams shaping narrative systems, creator universes, and production-ready story worlds.</p>
            </div>
          </div>

          <div className="landing-hero-art">
            <div className="landing-hero-image-frame">
              <img alt="Cinematic world showcase" src="https://picsum.photos/seed/graphcore-hero/1440/1080" />
            </div>
            <div className="landing-floating-card">
              <strong>Prompt to graph</strong>
              <span>Grow a world, open its dossiers, and push the next move without leaving the canvas.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-logo-band" aria-label="Trusted by creative teams">
        <div className="landing-marquee-track">
          {[...trustLogos, ...trustLogos].map((logo, index) => (
            <span key={`${logo}-${index}`}>{logo}</span>
          ))}
        </div>
      </section>

      <section className="landing-feature-section" id="product">
        <div className="landing-section-head">
          <span className="eyebrow">Why GraphCore</span>
          <h2>Designed for prompt-led creation without losing world structure.</h2>
        </div>
        <div className="landing-feature-grid">
          {featureCards.map((card) => (
            <article key={card.title} className="landing-feature-card">
              <div className="landing-card-media">
                <img alt={card.title} src={card.image} />
              </div>
              <strong>{card.title}</strong>
              <p>{card.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-showcase-section" id="showcase" ref={showcaseRef}>
        <div className="landing-showcase-grid">
          <div className="landing-showcase-copy">
            <span className="eyebrow">Graph Workspace</span>
            <h2>Chat, graph, and inspector move as one creation surface.</h2>
            <p>
              Instead of hiding generation behind generic forms, the workspace keeps prompt turns, newly applied world beats, and graph structure visible together so creators can steer scope instead of reacting to it.
            </p>
            <button className="landing-secondary-button" onClick={onEnterApp} type="button">
              Open Workspace
            </button>
          </div>

          <div className="landing-showcase-stack">
            <article className="landing-showcase-card">
              <img alt="Grow mode stream" src="https://picsum.photos/seed/graphcore-grow/1200/900" />
              <div>
                <strong>Grow mode stays conversational</strong>
                <span>Session history, planner feedback, threads, and next-move cards live beside the graph.</span>
              </div>
            </article>
            <article className="landing-showcase-card">
              <img alt="Graph mode" src="https://picsum.photos/seed/graphcore-stage/1200/900" />
              <div>
                <strong>Graph mode stays spatial</strong>
                <span>Connected neighborhoods, image-first nodes, focus controls, and cleaner canvas affordances.</span>
              </div>
            </article>
            <article className="landing-showcase-card">
              <img alt="Inspector dossier" src="https://picsum.photos/seed/graphcore-dossier-stack/1200/900" />
              <div>
                <strong>Dossiers keep context readable</strong>
                <span>Overview, relationships, usage, and follow-on actions stay grouped like a production dossier.</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-creator-section" id="creators">
        <div className="landing-section-head">
          <span className="eyebrow">Who It Serves</span>
          <h2>Made for creators building worlds that have to hold together.</h2>
        </div>
        <div className="landing-creator-grid">
          {creatorCards.map((card) => (
            <article key={card.title} className="landing-creator-card">
              <div className="landing-card-media">
                <img alt={card.title} src={card.image} />
              </div>
              <strong>{card.title}</strong>
              <p>{card.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-cta-section">
        <div className="landing-cta-panel">
          <span className="eyebrow">Start Building</span>
          <h2>Turn the next prompt into a world that can keep expanding.</h2>
          <p>Use the landing page as the front door, then continue inside the same visual system in the workspace itself.</p>
          <div className="landing-hero-actions">
            <button className="landing-cta-button" onClick={onOpenAuth} type="button">
              {isSignedIn ? 'Return To App' : 'Start Free'}
            </button>
            <button className="landing-secondary-button" onClick={onEnterApp} type="button">
              View The App
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
