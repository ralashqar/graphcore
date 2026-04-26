import type { CSSProperties } from 'react'

export type EntityIconId =
  | 'graph'
  | 'content'
  | 'credits'
  | 'info'
  | 'item'
  | 'group'
  | 'concept'
  | 'event'
  | 'character'
  | 'environment'
  | 'asset'
  | 'activity'
  | 'cinematic'
  | 'global'
  | 'release'
  | 'archetype'
  | 'expand'
  | 'close'
  | 'check'
  | 'plus'

type EntityIconProps = {
  className?: string
  id: EntityIconId
  title?: string
}

type IconGlyphProps = {
  style?: CSSProperties
}

const RASTER_ICON_BY_ID: Partial<Record<EntityIconId, string>> = {
  character: '/world-node-icons/world-node-actor.png',
  group: '/world-node-icons/world-node-group.png',
  environment: '/world-node-icons/world-node-place.png',
  item: '/world-node-icons/world-node-object.png',
  concept: '/world-node-icons/world-node-concept.png',
  event: '/world-node-icons/world-node-event.png',
}

function Stroke(props: IconGlyphProps) {
  return { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 1.7, ...props }
}

function IconPath({ id }: { id: EntityIconId }) {
  const stroke = Stroke({})

  switch (id) {
    case 'graph':
      return (
        <>
          <circle cx="6" cy="6" r="2.2" {...stroke} />
          <circle cx="18" cy="6" r="2.2" {...stroke} />
          <circle cx="12" cy="18" r="2.2" {...stroke} />
          <path d="M8 7.2 10.2 10.8M16 7.2 13.8 10.8" {...stroke} />
        </>
      )
    case 'content':
      return (
        <>
          <rect x="4.5" y="5" width="15" height="14" rx="2.5" {...stroke} />
          <path d="M8 9.5h8M8 13h6M8 16.5h5" {...stroke} />
        </>
      )
    case 'credits':
      return (
        <>
          <ellipse cx="12" cy="12" rx="7.2" ry="7.2" {...stroke} />
          <path d="M9.2 9.8h5.6M9.2 14.2h5.6" {...stroke} />
          <path d="M10.2 7.8v8.4M13.8 7.8v8.4" {...stroke} />
        </>
      )
    case 'info':
      return (
        <>
          <circle cx="12" cy="12" r="7.2" {...stroke} />
          <path d="M12 10.3v5" {...stroke} />
          <circle cx="12" cy="7.3" r="0.8" style={{ fill: 'currentColor' }} />
        </>
      )
    case 'item':
      return (
        <>
          <path d="M12 3.8 19 8v8l-7 4.2L5 16V8l7-4.2Z" {...stroke} />
          <path d="M12 3.8v16.4M5 8l7 4.2L19 8" {...stroke} />
        </>
      )
    case 'group':
      return (
        <>
          <circle cx="8" cy="9" r="2.3" {...stroke} />
          <circle cx="16" cy="9" r="2.3" {...stroke} />
          <circle cx="12" cy="6.6" r="2.1" {...stroke} />
          <path d="M5.4 18c.5-2.4 1.9-4 3.8-4.6M18.6 18c-.5-2.4-1.9-4-3.8-4.6M9.6 18c.4-2.7 1.8-4.7 2.4-4.7s2 2 2.4 4.7" {...stroke} />
        </>
      )
    case 'concept':
      return (
        <>
          <path d="M12 4.5 14.2 9.1 19 12l-4.8 2.9L12 19.5l-2.2-4.6L5 12l4.8-2.9L12 4.5Z" {...stroke} />
          <circle cx="12" cy="12" r="1.5" {...stroke} />
        </>
      )
    case 'event':
      return (
        <>
          <path d="M12 4.8v4.2M12 15v4.2M4.8 12H9M15 12h4.2M7.3 7.3l2.9 2.9M13.8 13.8l2.9 2.9M16.7 7.3l-2.9 2.9M10.2 13.8l-2.9 2.9" {...stroke} />
          <circle cx="12" cy="12" r="2.2" {...stroke} />
        </>
      )
    case 'character':
      return (
        <>
          <circle cx="12" cy="8.2" r="3.2" {...stroke} />
          <path d="M6.8 19c.8-3.4 3-5.2 5.2-5.2S16.4 15.6 17.2 19" {...stroke} />
        </>
      )
    case 'environment':
      return (
        <>
          <path d="M4.5 19h15" {...stroke} />
          <path d="M6.2 19V9.5L12 5l5.8 4.5V19" {...stroke} />
          <path d="M9.4 19v-4.2h5.2V19" {...stroke} />
        </>
      )
    case 'asset':
      return (
        <>
          <rect x="5" y="4.5" width="14" height="15" rx="2.5" {...stroke} />
          <path d="M8.5 15.5 11.2 12.8l2.2 2.2 2.9-3.1 2.2 2.8" {...stroke} />
          <circle cx="10" cy="9" r="1.3" {...stroke} />
        </>
      )
    case 'activity':
      return (
        <>
          <path d="M12 5.2v6.1l3.6 2.1" {...stroke} />
          <circle cx="12" cy="12" r="7.2" {...stroke} />
        </>
      )
    case 'cinematic':
      return (
        <>
          <rect x="4.5" y="6.2" width="15" height="11.6" rx="2.2" {...stroke} />
          <path d="M8.5 6.2v11.6M15.5 6.2v11.6M4.5 10h15M4.5 14h15" {...stroke} />
          <path d="m10 10.2 4.2 1.8-4.2 1.8z" {...stroke} style={{ fill: 'currentColor', stroke: 'none' }} />
        </>
      )
    case 'global':
      return (
        <>
          <circle cx="12" cy="12" r="7.2" {...stroke} />
          <path d="M4.8 12h14.4M12 4.8c2 1.9 3.1 4.3 3.1 7.2S14 17.3 12 19.2M12 4.8c-2 1.9-3.1 4.3-3.1 7.2s1.1 5.3 3.1 7.2" {...stroke} />
        </>
      )
    case 'release':
      return (
        <>
          <path d="M12 3.8 19 8v8l-7 4.2L5 16V8l7-4.2Z" {...stroke} />
          <path d="M9.3 12.2 11.2 14.1 15 10.2" {...stroke} />
        </>
      )
    case 'archetype':
      return (
        <>
          <path d="M12 4.4 18.5 8.2v7.6L12 19.6l-6.5-3.8V8.2L12 4.4Z" {...stroke} />
          <path d="M12 8.2 9.2 12 12 15.8 14.8 12 12 8.2Z" {...stroke} />
        </>
      )
    case 'expand':
      return (
        <>
          <path d="M9.2 4.8H4.8v4.4" {...stroke} />
          <path d="M14.8 4.8h4.4v4.4" {...stroke} />
          <path d="M9.2 19.2H4.8v-4.4" {...stroke} />
          <path d="M14.8 19.2h4.4v-4.4" {...stroke} />
          <path d="M4.8 9.2 9.4 4.6" {...stroke} />
          <path d="m14.6 4.6 4.6 4.6" {...stroke} />
          <path d="m4.8 14.8 4.6 4.6" {...stroke} />
          <path d="m14.6 19.4 4.6-4.6" {...stroke} />
        </>
      )
    case 'close':
      return (
        <>
          <path d="m7.2 7.2 9.6 9.6M16.8 7.2l-9.6 9.6" {...stroke} />
        </>
      )
    case 'check':
      return (
        <>
          <path d="M6.8 12.4 10.4 16l6.8-7.2" {...stroke} />
        </>
      )
    case 'plus':
      return (
        <>
          <path d="M12 5.2v13.6M5.2 12h13.6" {...stroke} />
        </>
      )
    default:
      return null
  }
}

export function EntityIcon({ className, id, title }: EntityIconProps) {
  const rasterSrc = RASTER_ICON_BY_ID[id]
  if (rasterSrc) {
    return (
      <img
        alt={title ?? ''}
        aria-hidden={title ? undefined : 'true'}
        aria-label={title}
        className={['entity-icon-image', className].filter(Boolean).join(' ')}
        role={title ? 'img' : undefined}
        src={rasterSrc}
      />
    )
  }
  return (
    <svg aria-hidden={title ? undefined : 'true'} aria-label={title} className={className} viewBox="0 0 24 24" role="img">
      <IconPath id={id} />
    </svg>
  )
}

export function iconForDefinitionKind(kind: string | null | undefined): EntityIconId {
  switch (kind) {
    case 'character':
      return 'character'
    case 'group':
      return 'group'
    case 'concept':
      return 'concept'
    case 'event':
      return 'event'
    case 'environment':
      return 'environment'
    case 'item':
      return 'item'
    default:
      return 'content'
  }
}
