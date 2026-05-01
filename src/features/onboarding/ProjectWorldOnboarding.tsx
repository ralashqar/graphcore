import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type RefObject } from 'react'

import { workspaceService } from '../../application/services/workspaceService'
import {
  buildPromptSourceContext,
  extractOnboardingSourceFromFile,
  normalizeOnboardingSourceText,
} from '../../domain/onboardingSource'
import {
  worldPromptEventPayloadSchema,
  type WorldPromptArtStyleOption,
  type WorldPromptEvent,
  type WorldPromptGenerationJobStep,
  type WorldPromptMessage,
  type WorldPromptSeedInferenceResponse,
  type WorldPromptSourceContext,
  type WorldPromptTurn,
} from '../../domain/worldPrompt'
import { EntityIcon, type EntityIconId } from '../../shared/entityIcons'
import {
  LandingIcon,
  orbitEdgePairs as ONBOARDING_ORBIT_EDGE_PAIRS,
  orbitNodes as ONBOARDING_ORBIT_NODES,
} from '../landing/LandingPage'
import { buildWorldPromptSessionTokenMeter } from '../world/worldPresentation'
import {
  buildSeedAssemblySections,
  type SeedAssemblyItem,
  type SeedAssemblySection,
} from './projectWorldOnboardingPreview'

const STORY_ART_STYLE_ATLAS_URL = '/onboarding/styles/story-art-styles-atlas.png'
const STORY_ART_STYLE_ATLAS_INDEX: Partial<Record<string, readonly [number, number]>> = {
  live_action_cinematic: [0, 0],
  photoreal_game_cg: [1, 0],
  premium_stylized_3d: [2, 0],
  stylized_hero_3d: [0, 1],
  anime_cg: [1, 1],
  stylized_fantasy: [2, 1],
  toon_illustration: [0, 2],
  storybook_illustration: [1, 2],
  custom: [2, 2],
}

type ProjectWorldOnboardingProps = {
  isSaving: boolean
  seedInference: WorldPromptSeedInferenceResponse | null
  seedGenerationStarted: boolean
  sessionEvents: WorldPromptEvent[]
  generationSteps: WorldPromptGenerationJobStep[]
  sessionMessages: WorldPromptMessage[]
  sessionTurns: WorldPromptTurn[]
  onSubmit: (values: { prompt: string; sourceContext: WorldPromptSourceContext }) => Promise<void> | void
  onContinueSeed: (values: { turnId: string; selectedArtStylePreset: string; selectedArtStyleDescription?: string }) => Promise<void> | void
  projectName: string
}

const EXAMPLES = [
  {
    title: 'Fantasy World',
    summary: 'A fallen empire where memory is the last magic.',
    prompt: 'Create a connected fantasy world about a fallen empire ruled by shadows, where memory is the last magic. Include three major characters, two rival factions, one forbidden artifact, and the first sequence beat that starts the central conflict.',
  },
  {
    title: 'Cyberpunk City',
    summary: 'A megacity controlled by contracts and synthetic ghosts.',
    prompt: 'Create a cyberpunk city world where corporate saints, street archivists, and synthetic ghosts fight over an algorithm that predicts betrayal. Build the core cast, factions, places, objects, and relationship pressure.',
  },
  {
    title: 'Sci-Fi Universe',
    summary: 'An exploration myth about a moon that remembers every civilization.',
    prompt: 'Create a sci-fi universe about explorers who find a moon-sized archive that remembers every extinct civilization. Add the mission crew, rival institutions, key locations, artifacts, and the event that makes the discovery dangerous.',
  },
  {
    title: 'Upload Your Script',
    summary: 'Bring a script, bible, outline, or notes file.',
    prompt: 'Use my uploaded source as the canon seed. Build the first connected world graph from the characters, places, factions, objects, events, and story beats it contains.',
  },
]

type OnboardingOrbitNode = typeof ONBOARDING_ORBIT_NODES[number]

type OnboardingOrbitDisplayNode = OnboardingOrbitNode & {
  variantIndex: number
}

type OnboardingOrbitSwapState = {
  slotClassName: string
  phase: 'out' | 'in'
}

type OnboardingOrbitConnector = {
  id: string
  d: string
}

const ONBOARDING_OUTPUT_CARDS: Array<{
  title: string
  copy: string
  icon: EntityIconId
  media: string
  chips: string[]
}> = [
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
    icon: 'character',
    media: 'atlas-character',
    chips: ['Portrait', 'Sheet', '+8'],
  },
  {
    title: 'Stories & Scripts',
    copy: 'Scripts, dialogue, novels & entries.',
    icon: 'content',
    media: 'atlas-script',
    chips: ['DOCX', 'PDF', 'TXT'],
  },
  {
    title: 'Brand & Marketing',
    copy: 'Logos, posters, packaging & brand kits.',
    icon: 'release',
    media: 'atlas-brand',
    chips: ['Poster', 'Kit', 'Cover'],
  },
  {
    title: 'Game Assets',
    copy: '3D concepts, props, icons & environments.',
    icon: 'asset',
    media: 'atlas-game',
    chips: ['Sword', 'Shield', '+25'],
  },
  {
    title: 'Audio & Voice',
    copy: 'Music, SFX, ambience & voice lines.',
    icon: 'activity',
    media: 'atlas-audio',
    chips: ['Theme', 'Ambience', 'VO'],
  },
]

type SeedGenerationLogRowStatus = 'pending' | 'active' | 'done' | 'failed'

type SeedGenerationLogRow = {
  id: string
  icon: EntityIconId
  title: string
  detail: string
  status: SeedGenerationLogRowStatus
  createdAt: string
  sequence: number
  index: number | null
  total: number | null
}

type ExpandedOnboardingPreview = {
  title: string
  label: string
  text: string
}

const ACTIVE_GENERATION_PROGRESS_ROW_ID = 'active-generation-progress'
const ONBOARDING_PREVIEW_TEXT_LIMIT = 240

function buildGenerationPrompt(prompt: string, sourceContext: WorldPromptSourceContext) {
  const sourceText = sourceContext.extractedText.trim()
  if (!sourceText || sourceText === prompt.trim()) return prompt.trim()
  const sourceLabel = sourceContext.kind === 'url'
    ? `URL source: ${sourceContext.title || sourceContext.url}`
    : sourceContext.kind === 'file'
      ? `Uploaded source: ${sourceContext.fileName ?? sourceContext.title}`
      : `Source: ${sourceContext.title}`
  return [
    prompt.trim(),
    '',
    sourceLabel,
    sourceText,
  ].filter(Boolean).join('\n\n')
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

function getOnboardingOrbitVariant(node: OnboardingOrbitNode, variantIndex: number) {
  const variants = [
    { title: node.title, icon: node.icon },
    ...(node.alternates ?? []),
  ]

  return variants[variantIndex % variants.length] ?? variants[0]
}

function createInitialOnboardingOrbitNodes(): OnboardingOrbitDisplayNode[] {
  return ONBOARDING_ORBIT_NODES.map((node) => ({
    ...node,
    variantIndex: 0,
  }))
}

function useRotatingOnboardingOrbitNodes() {
  const prefersReducedMotion = usePrefersReducedMotion()
  const recentSlotClassNameRef = useRef<string | null>(null)
  const [activeNodes, setActiveNodes] = useState<OnboardingOrbitDisplayNode[]>(createInitialOnboardingOrbitNodes)
  const [swapState, setSwapState] = useState<OnboardingOrbitSwapState | null>(null)

  useEffect(() => {
    if (prefersReducedMotion) {
      setActiveNodes(createInitialOnboardingOrbitNodes())
      setSwapState(null)
      return
    }

    let startTimeoutId = 0
    let swapTimeoutId = 0
    let settleTimeoutId = 0
    let cancelled = false

    const scheduleNextSwap = () => {
      const delayMs = 3900 + Math.random() * 2600

      startTimeoutId = window.setTimeout(() => {
        if (cancelled) return

        const swappableSlots = ONBOARDING_ORBIT_NODES.filter(
          (node) => node.alternates?.length && node.className !== recentSlotClassNameRef.current,
        )
        const slot = swappableSlots[Math.floor(Math.random() * swappableSlots.length)] ?? ONBOARDING_ORBIT_NODES[0]
        recentSlotClassNameRef.current = slot.className
        setSwapState({ slotClassName: slot.className, phase: 'out' })

        swapTimeoutId = window.setTimeout(() => {
          if (cancelled) return

          setActiveNodes((currentNodes) =>
            currentNodes.map((currentNode) => {
              if (currentNode.className !== slot.className) return currentNode

              const nextVariantIndex =
                (currentNode.variantIndex + 1) % (1 + (slot.alternates?.length ?? 0))
              const nextVariant = getOnboardingOrbitVariant(slot, nextVariantIndex)

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

function useOnboardingOrbitConnectors(
  stageRef: RefObject<HTMLElement | null>,
  composerRef: RefObject<HTMLElement | null>,
  activeNodes: OnboardingOrbitDisplayNode[],
) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const [connectors, setConnectors] = useState<OnboardingOrbitConnector[]>([])
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const stageElement = stageRef.current
    const composerElement = composerRef.current
    if (!stageElement || !composerElement) return

    let animationFrameId = 0
    let resizeFrameId = 0
    let cancelled = false

    const measureConnectors = () => {
      if (cancelled) return

      const stageRect = stageElement.getBoundingClientRect()
      const composerRect = composerElement.getBoundingClientRect()
      const centerX = composerRect.left + composerRect.width / 2 - stageRect.left
      const centerY = composerRect.top + composerRect.height / 2 - stageRect.top
      const frameCenterBySlot = new Map<string, { x: number; y: number }>()
      const nextConnectors = activeNodes.flatMap((node) => {
        const frame = stageElement.querySelector<HTMLElement>(
          `.world-onboarding-orbit-node[data-orbit-slot="${node.className}"] .world-onboarding-icon-frame`,
        )
        if (!frame) return []

        const frameRect = frame.getBoundingClientRect()
        const x1 = frameRect.left + frameRect.width / 2 - stageRect.left
        const y1 = frameRect.top + frameRect.height / 2 - stageRect.top
        frameCenterBySlot.set(node.className, { x: x1, y: y1 })
        const distanceX = centerX - x1
        const distanceY = centerY - y1
        const controlX = Math.max(60, Math.min(180, Math.abs(distanceX) * 0.48))
        const controlY = Math.max(16, Math.min(58, Math.abs(distanceY) * 0.18))
        const direction = distanceX >= 0 ? 1 : -1
        const verticalDirection = distanceY >= 0 ? 1 : -1
        const d = [
          `M ${x1.toFixed(1)} ${y1.toFixed(1)}`,
          `C ${(x1 + direction * controlX).toFixed(1)} ${(y1 + verticalDirection * controlY).toFixed(1)},`,
          `${(centerX - direction * controlX * 0.72).toFixed(1)} ${(centerY - verticalDirection * controlY).toFixed(1)},`,
          `${centerX.toFixed(1)} ${centerY.toFixed(1)}`,
        ].join(' ')

        return [{ id: node.className, d }]
      })
      const adjacentConnectors = ONBOARDING_ORBIT_EDGE_PAIRS.flatMap(([fromSlot, toSlot]) => {
        const from = frameCenterBySlot.get(fromSlot)
        const to = frameCenterBySlot.get(toSlot)
        if (!from || !to) return []

        return [
          {
            id: `${fromSlot}-${toSlot}`,
            d: `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} L ${to.x.toFixed(1)} ${to.y.toFixed(1)}`,
          },
        ]
      })

      setStageSize({ width: stageRect.width, height: stageRect.height })
      setConnectors([...adjacentConnectors, ...nextConnectors])
    }

    const measureOnAnimationFrame = () => {
      measureConnectors()
      animationFrameId = window.requestAnimationFrame(measureOnAnimationFrame)
    }

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(resizeFrameId)
      resizeFrameId = window.requestAnimationFrame(measureConnectors)
    }

    const resizeObserver = new ResizeObserver(scheduleMeasure)
    resizeObserver.observe(stageElement)
    resizeObserver.observe(composerElement)
    scheduleMeasure()
    window.addEventListener('resize', scheduleMeasure)
    if (!prefersReducedMotion) {
      animationFrameId = window.requestAnimationFrame(measureOnAnimationFrame)
    }

    return () => {
      cancelled = true
      window.cancelAnimationFrame(animationFrameId)
      window.cancelAnimationFrame(resizeFrameId)
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
    }
  }, [activeNodes, composerRef, prefersReducedMotion, stageRef])

  return { connectors, stageSize }
}

function formatInferenceLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function getStoryArtStyleAtlasStyle(presetId: string) {
  const tile = STORY_ART_STYLE_ATLAS_INDEX[presetId]
  if (!tile) return null
  const [column, row] = tile
  return {
    backgroundImage: `url(${STORY_ART_STYLE_ATLAS_URL})`,
    backgroundSize: '300% 300%',
    backgroundPosition: `${column * 50}% ${row * 50}%`,
    backgroundRepeat: 'no-repeat',
  }
}

function cleanSeedLogText(text: string) {
  return text
    .replace(/^Assembling the first wave of safe graph changes\.$/i, 'Preparing the graph change list.')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactPreviewText(text: string, limit = ONBOARDING_PREVIEW_TEXT_LIMIT) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return text
  return `${normalized.slice(0, limit).trimEnd()}...`
}

function isLongPreviewText(text: string) {
  return text.replace(/\s+/g, ' ').trim().length > ONBOARDING_PREVIEW_TEXT_LIMIT
}

function workItemIcon(kind: string | null | undefined): EntityIconId {
  switch (kind) {
    case 'entity_batch':
      return 'group'
    case 'relationship_batch':
      return 'graph'
    case 'sequence_unit':
      return 'thread'
    case 'thread_batch':
      return 'thread'
    case 'wiki_metadata':
      return 'content'
    case 'suggestion_batch':
      return 'concept'
    case 'final_summary':
      return 'global'
    default:
      return 'content'
  }
}

function nodeTypeIcon(nodeType: string | null | undefined): EntityIconId {
  switch (nodeType) {
    case 'actor':
      return 'character'
    case 'place':
      return 'environment'
    case 'object':
      return 'item'
    case 'group':
      return 'group'
    case 'concept':
      return 'concept'
    case 'event':
    case 'sequence_unit':
      return 'event'
    default:
      return 'content'
  }
}

function workItemRowId(index: number | null, fallbackId: string | null | undefined) {
  return index !== null && index > 0 ? `work-index-${index}` : `work-${fallbackId ?? 'unknown'}`
}

function pushOrReplaceGenerationLogRow(rows: SeedGenerationLogRow[], nextRow: SeedGenerationLogRow) {
  const existingIndex = rows.findIndex((row) => row.id === nextRow.id)
  if (existingIndex >= 0) {
    rows[existingIndex] = {
      ...rows[existingIndex],
      ...nextRow,
      sequence: Math.max(rows[existingIndex].sequence, nextRow.sequence),
    }
    return
  }

  const previous = rows.at(-1)
  if (
    previous
    && previous.title.trim() === nextRow.title.trim()
    && previous.detail.trim() === nextRow.detail.trim()
    && previous.status === nextRow.status
  ) {
    return
  }

  rows.push(nextRow)
}

function seedEventToLogRow(
  event: WorldPromptEvent,
  workItemProgressById: Map<string, { index: number | null; total: number | null }>,
): SeedGenerationLogRow | null {
  const parsed = worldPromptEventPayloadSchema.safeParse(event.payload)
  if (!parsed.success) return null
  const payload = parsed.data
  const workItemId = payload.workItem?.id ?? payload.plannerProgress?.workItemId ?? null
  const knownWorkItemProgress = workItemId ? workItemProgressById.get(workItemId) ?? null : null
  const base = {
    createdAt: event.createdAt,
    sequence: event.sequence,
    index: payload.workItemIndex ?? payload.plannerProgress?.index ?? knownWorkItemProgress?.index ?? null,
    total: payload.workItemTotal ?? payload.plannerProgress?.total ?? knownWorkItemProgress?.total ?? null,
  }

  if (event.eventType === 'op_applied' && payload.op) {
    if (payload.op.op === 'upsert_entity') {
      const entity = payload.op.payload.entity
      return {
        ...base,
        id: `op-${event.id}`,
        icon: nodeTypeIcon(entity.nodeType),
        title: `Created ${entity.name}`,
        detail: '',
        status: 'done',
      }
    }
    if (payload.op.op === 'upsert_relationship') {
      const relationship = payload.op.payload.relationship
      return {
        ...base,
        id: `op-${event.id}`,
        icon: 'graph',
        title: `Linked ${relationship.sourceRef?.name ?? relationship.sourceEntityKey ?? 'source'} to ${relationship.targetRef?.name ?? relationship.targetEntityKey ?? 'target'}`,
        detail: relationship.verb ? formatInferenceLabel(relationship.verb) : '',
        status: 'done',
      }
    }
    if (payload.op.op === 'update_world_wiki_metadata') {
      return {
        ...base,
        id: `op-${event.id}`,
        icon: 'content',
        title: 'Updated world overview',
        detail: 'Project wiki metadata refreshed from the generated canon.',
        status: 'done',
      }
    }
  }
  if (event.eventType === 'work_item_started') return null
  if (event.eventType === 'work_item_completed' && payload.workItem?.label) {
    return {
      ...base,
      id: workItemRowId(base.index, payload.workItem.id ?? event.id),
      icon: workItemIcon(payload.workItem.kind),
      title: payload.workItem.label,
      detail: cleanSeedLogText(payload.note || 'Completed.'),
      status: 'done',
    }
  }
  if (event.eventType === 'work_item_failed' && payload.workItem?.label) {
    return {
      ...base,
      id: workItemRowId(base.index, payload.workItem.id ?? event.id),
      icon: workItemIcon(payload.workItem.kind),
      title: payload.workItem.label,
      detail: cleanSeedLogText(payload.note || 'Skipped after validation.'),
      status: 'failed',
    }
  }
  if (payload.note) {
    const note = cleanSeedLogText(payload.note)
    const lowerNote = note.toLowerCase()
    const isWarningNote = event.eventType === 'turn_failed'
      || lowerNote.includes('failed')
      || lowerNote.includes('malformed')
      || lowerNote.includes('could not')
      || lowerNote.includes('cancelled')
    if (!isWarningNote) return null
    return {
      ...base,
      id: `note-${event.id}`,
      icon: 'content',
      title: event.eventType === 'turn_failed' ? 'Generation stopped' : 'Generation warning',
      detail: note,
      status: event.eventType === 'turn_failed' ? 'failed' : 'done',
    }
  }
  if (event.eventType === 'message_created' && payload.message?.role === 'assistant' && payload.message.content) {
    return {
      ...base,
      id: `message-${event.id}`,
      icon: 'content',
      title: 'Summary',
      detail: cleanSeedLogText(payload.message.content),
      status: 'done',
    }
  }
  if (event.eventType === 'turn_completed') {
    return {
      ...base,
      id: `complete-${event.id}`,
      icon: 'check',
      title: 'Initial generation complete',
      detail: 'Opening the graph with the new world highlighted.',
      status: 'done',
    }
  }
  if (event.eventType === 'turn_failed') {
    return {
      ...base,
      id: `failed-${event.id}`,
      icon: 'close',
      title: 'Initial generation stopped',
      detail: 'The graph could not be opened from this generation.',
      status: 'failed',
    }
  }
  return null
}

function isSeedTerminalEvent(event: WorldPromptEvent) {
  return event.eventType === 'turn_completed' || event.eventType === 'turn_failed'
}

function generationTurnIdsFromSteps(steps: WorldPromptGenerationJobStep[]) {
  return new Set(steps.map((step) => step.turnId).filter(Boolean))
}

function isGenerationTerminalEvent(event: WorldPromptEvent, generationTurnIds: Set<string>) {
  if (!isSeedTerminalEvent(event)) return false
  if (generationTurnIds.size === 0) return false
  return generationTurnIds.has(event.turnId)
}

function hasGenerationTerminalEvent(events: WorldPromptEvent[], steps: WorldPromptGenerationJobStep[]) {
  const generationTurnIds = generationTurnIdsFromSteps(steps)
  return events.some((event) => isGenerationTerminalEvent(event, generationTurnIds))
}

function isDurableSeedEvent(event: WorldPromptEvent) {
  return event.eventType === 'op_applied'
    || event.eventType === 'message_created'
    || event.eventType === 'turn_completed'
    || event.eventType === 'turn_failed'
    || event.eventType === 'work_item_completed'
    || event.eventType === 'work_item_failed'
}

function latestSeedActivityRow(input: {
  events: WorldPromptEvent[]
  generationSteps: WorldPromptGenerationJobStep[]
  seedInference: WorldPromptSeedInferenceResponse
}): SeedGenerationLogRow | null {
  if (hasGenerationTerminalEvent(input.events, input.generationSteps)) return null
  const latestDurableSequence = input.events
    .filter((event) => isDurableSeedEvent(event))
    .reduce((latest, event) => Math.max(latest, event.sequence), -1)
  const liveEvents = [...input.events]
    .sort((left, right) => {
      const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      return timeDelta !== 0 ? timeDelta : left.sequence - right.sequence
    })
    .filter((event) => event.sequence >= latestDurableSequence)
  const latestProgress = [...liveEvents].reverse().map((event) => {
    const parsed = worldPromptEventPayloadSchema.safeParse(event.payload)
    if (!parsed.success) return null
    const progress = parsed.data.plannerProgress
    if (!progress?.message || progress.done) return null
    return {
      event,
      progress,
    }
  }).find(Boolean)
  if (latestProgress) {
    return {
      id: ACTIVE_GENERATION_PROGRESS_ROW_ID,
      icon: workItemIcon(latestProgress.progress.workItemKind),
      title: 'Generating',
      detail: cleanSeedLogText(latestProgress.progress.message),
      status: 'active',
      createdAt: latestProgress.event.createdAt,
      sequence: latestProgress.event.sequence + 0.001,
      index: latestProgress.progress.index ?? null,
      total: latestProgress.progress.total ?? null,
    }
  }

  const runningStep = [...input.generationSteps]
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .find((step) => step.status === 'running')
  if (runningStep) {
    const title = typeof runningStep.metadata?.label === 'string'
      ? runningStep.metadata.label
      : formatInferenceLabel(runningStep.phase)
    return {
      id: ACTIVE_GENERATION_PROGRESS_ROW_ID,
      icon: runningStep.phase === 'relationships' ? 'graph' : runningStep.phase === 'sequence_units' ? 'thread' : runningStep.phase === 'finalize' ? 'global' : 'content',
      title: 'Generating',
      detail: title,
      status: 'active',
      createdAt: runningStep.startedAt ?? runningStep.updatedAt,
      sequence: 10_000 + runningStep.orderIndex,
      index: runningStep.orderIndex + 1,
      total: input.generationSteps.length || null,
    }
  }

  const nextQueuedStep = [...input.generationSteps]
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .find((step) => step.status === 'queued')
  if (nextQueuedStep) {
    const title = typeof nextQueuedStep.metadata?.label === 'string'
      ? nextQueuedStep.metadata.label
      : formatInferenceLabel(nextQueuedStep.phase)
    return {
      id: ACTIVE_GENERATION_PROGRESS_ROW_ID,
      icon: nextQueuedStep.phase === 'relationships' ? 'graph' : nextQueuedStep.phase === 'sequence_units' ? 'thread' : nextQueuedStep.phase === 'finalize' ? 'global' : 'content',
      title: 'Generating',
      detail: `Waiting to start ${title.toLowerCase()}.`,
      status: 'active',
      createdAt: nextQueuedStep.createdAt,
      sequence: 10_000 + nextQueuedStep.orderIndex,
      index: nextQueuedStep.orderIndex + 1,
      total: input.generationSteps.length || null,
    }
  }

  return {
    id: ACTIVE_GENERATION_PROGRESS_ROW_ID,
    icon: 'global',
    title: 'Generating',
    detail: 'Waiting for the next generated item.',
    status: 'active',
    createdAt: input.seedInference.turn.updatedAt,
    sequence: 10_000,
    index: null,
    total: null,
  }
}

function mergeStableGenerationLogRows(previousRows: SeedGenerationLogRow[], nextRows: SeedGenerationLogRow[]) {
  if (previousRows.length === 0) return nextRows
  const mergedById = new Map<string, SeedGenerationLogRow>()
  for (const row of previousRows) {
    if (row.id !== ACTIVE_GENERATION_PROGRESS_ROW_ID) mergedById.set(row.id, row)
  }
  for (const row of nextRows) {
    if (row.id !== ACTIVE_GENERATION_PROGRESS_ROW_ID) mergedById.set(row.id, row)
  }
  return [...mergedById.values()].sort((left, right) => {
    if (left.sequence !== right.sequence) return left.sequence - right.sequence
    return left.id.localeCompare(right.id)
  })
}

function dedupeLogRows<T extends { text: string }>(rows: T[]) {
  const deduped: T[] = []
  for (const row of rows) {
    const previous = deduped.at(-1)
    if (previous && previous.text.trim() === row.text.trim()) continue
    deduped.push(row)
  }
  return deduped
}

function buildSeedGenerationLogRows(input: {
  events: WorldPromptEvent[]
  generationSteps: WorldPromptGenerationJobStep[]
  seedGenerationStarted: boolean
  seedInference: WorldPromptSeedInferenceResponse | null
  sourceLabel: string
}): SeedGenerationLogRow[] {
  if (!input.seedInference) return []
  const generationTurnIds = generationTurnIdsFromSteps(input.generationSteps)
  const rows: SeedGenerationLogRow[] = [
    {
      id: 'prompt-received',
      icon: 'content',
      title: `${input.sourceLabel} received`,
      detail: 'Reading the submitted prompt and source context.',
      status: 'done',
      createdAt: input.seedInference.turn.createdAt,
      sequence: 0,
      index: null,
      total: null,
    },
    {
      id: 'inference-result',
      icon: 'graph',
      title: `${formatInferenceLabel(input.seedInference.inference.projectType)} / ${formatInferenceLabel(input.seedInference.inference.projectSubtype)}`,
      detail: cleanSeedLogText(input.seedInference.inference.rationale || 'World direction inferred from the prompt.'),
      status: 'done',
      createdAt: input.seedInference.turn.updatedAt,
      sequence: 1,
      index: null,
      total: null,
    },
  ]

  if (!input.seedGenerationStarted) {
    rows.push({
      id: 'await-style',
      icon: 'concept',
      title: 'Choose an art style',
      detail: 'The initial world build will start after this selection.',
      status: 'active',
      createdAt: input.seedInference.turn.updatedAt,
      sequence: 2,
      index: null,
      total: null,
    })
    return rows
  }

  if (input.generationSteps.some((step) => step.status === 'failed' || step.status === 'cancelled')) {
    for (const step of [...input.generationSteps].sort((left, right) => left.orderIndex - right.orderIndex)) {
      if (step.status !== 'failed' && step.status !== 'cancelled') continue
      const title = typeof step.metadata?.label === 'string'
        ? step.metadata.label
        : formatInferenceLabel(step.phase)
      const detail = step.errorMessage
        ? step.errorMessage
        : step.status === 'cancelled'
          ? `${title} was cancelled.`
          : `${title} could not be completed.`
      pushOrReplaceGenerationLogRow(rows, {
        id: `generation-step-${step.id}`,
        icon: step.phase === 'relationships' ? 'graph' : step.phase === 'sequence_units' ? 'thread' : step.phase === 'finalize' ? 'global' : 'content',
        title,
        detail: cleanSeedLogText(detail),
        status: 'failed',
        createdAt: step.createdAt,
        sequence: 2 + step.orderIndex,
        index: step.orderIndex + 1,
        total: input.generationSteps.length,
      })
    }
  }

  if (input.events.length === 0) return rows

  const workItemProgressById = new Map<string, { index: number | null; total: number | null }>()
  for (const event of input.events) {
    const parsed = worldPromptEventPayloadSchema.safeParse(event.payload)
    if (!parsed.success) continue
    const payload = parsed.data
    const workItemId = payload.workItem?.id ?? payload.plannerProgress?.workItemId ?? null
    if (!workItemId) continue
    const index = payload.workItemIndex ?? payload.plannerProgress?.index ?? null
    const total = payload.workItemTotal ?? payload.plannerProgress?.total ?? null
    if (index !== null || total !== null) {
      workItemProgressById.set(workItemId, { index, total })
    }
  }

  for (const event of [...input.events].sort((left, right) => {
    const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    return timeDelta !== 0 ? timeDelta : left.sequence - right.sequence
  })) {
    if (isSeedTerminalEvent(event) && generationTurnIds.size > 0 && !generationTurnIds.has(event.turnId)) {
      continue
    }
    const parsed = worldPromptEventPayloadSchema.safeParse(event.payload)
    if (parsed.success && parsed.data.plannerProgress?.phase === 'planning_manifest' && parsed.data.plannerProgress.done) {
      const total = parsed.data.plannerProgress.total ?? parsed.data.plannerOutline?.length ?? null
      const outline = parsed.data.plannerOutline ?? []
      outline.forEach((label, index) => {
        pushOrReplaceGenerationLogRow(rows, {
          id: workItemRowId(index + 1, null),
          icon: 'content',
          title: label,
          detail: 'Waiting for this planned build step.',
          status: 'pending',
          createdAt: event.createdAt,
          sequence: event.sequence + index / 100,
          index: index + 1,
          total,
        })
      })
    }
    const row = seedEventToLogRow(event, workItemProgressById)
    if (row) pushOrReplaceGenerationLogRow(rows, row)
  }

  return rows
}

export function ProjectWorldOnboarding({
  isSaving,
  seedInference,
  seedGenerationStarted,
  sessionEvents,
  generationSteps,
  sessionMessages,
  sessionTurns,
  onSubmit,
  onContinueSeed,
  projectName: _projectName,
}: ProjectWorldOnboardingProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const generationLogRef = useRef<HTMLDivElement | null>(null)
  const generationPreviewRef = useRef<HTMLDivElement | null>(null)
  const latestPreviewCardRef = useRef<HTMLDivElement | null>(null)
  const promptSystemRef = useRef<HTMLElement | null>(null)
  const composerCardRef = useRef<HTMLElement | null>(null)
  const [prompt, setPrompt] = useState('')
  const [sourceContext, setSourceContext] = useState<WorldPromptSourceContext | null>(null)
  const [sourceWarning, setSourceWarning] = useState<string | null>(null)
  const [urlDraft, setUrlDraft] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [selectedArtStyleId, setSelectedArtStyleId] = useState<string | null>(null)
  const [expandedPreview, setExpandedPreview] = useState<ExpandedOnboardingPreview | null>(null)
  const orbitAnimation = useRotatingOnboardingOrbitNodes()
  const orbitConnectors = useOnboardingOrbitConnectors(
    promptSystemRef,
    composerCardRef,
    orbitAnimation.activeNodes,
  )

  const effectiveSourceContext = useMemo(() => {
    if (sourceContext) return sourceContext
    return buildPromptSourceContext(prompt)
  }, [prompt, sourceContext])
  const generatedPrompt = useMemo(
    () => buildGenerationPrompt(prompt, effectiveSourceContext),
    [effectiveSourceContext, prompt],
  )
  const canSubmit = !isSaving && !isExtracting && generatedPrompt.trim().length > 0
  const seedEventRows = sessionEvents
    .map((event) => {
      const row = seedEventToLogRow(event, new Map())
      return row ? { id: row.id, text: row.detail || row.title } : { id: event.id, text: null }
    })
    .filter((row): row is { id: string; text: string } => Boolean(row.text?.trim()))
  const visibleLogRows = dedupeLogRows(seedEventRows).map((row) => row.text).slice(-8)
  const selectedStyle = seedInference?.artStyleOptions.find((option) => option.id === selectedArtStyleId)
    ?? seedInference?.artStyleOptions.find((option) => option.recommended)
    ?? seedInference?.artStyleOptions[0]
    ?? null
  const generationSourceLabel = effectiveSourceContext.kind === 'file'
    ? effectiveSourceContext.fileName || effectiveSourceContext.title || 'Uploaded file'
    : effectiveSourceContext.kind === 'url'
      ? effectiveSourceContext.title || effectiveSourceContext.url || 'Imported link'
      : effectiveSourceContext.kind === 'example'
        ? effectiveSourceContext.title || 'Example seed'
        : 'Prompt'
  const computedGenerationLogRows = useMemo(() => buildSeedGenerationLogRows({
    events: sessionEvents,
    generationSteps,
    seedGenerationStarted,
    seedInference,
    sourceLabel: generationSourceLabel,
  }), [generationSourceLabel, generationSteps, seedGenerationStarted, seedInference, sessionEvents])
  const stableGenerationLogRowsRef = useRef<SeedGenerationLogRow[]>([])
  const stableGenerationKeyRef = useRef<string | null>(null)
  const generationKey = seedInference?.turn.id ?? null
  if (stableGenerationKeyRef.current !== generationKey) {
    stableGenerationKeyRef.current = generationKey
    stableGenerationLogRowsRef.current = []
  }
  const seedGenerationIsTerminal = sessionEvents.some((event) => isSeedTerminalEvent(event))
  const shouldPreserveGenerationRows = Boolean(seedInference && seedGenerationStarted && !seedGenerationIsTerminal)
  const generationLogRows = shouldPreserveGenerationRows
    ? mergeStableGenerationLogRows(stableGenerationLogRowsRef.current, computedGenerationLogRows)
    : computedGenerationLogRows
  stableGenerationLogRowsRef.current = generationLogRows
  const activeGenerationLogRow = seedInference && seedGenerationStarted
    ? latestSeedActivityRow({
      events: sessionEvents,
      generationSteps,
      seedInference,
    })
    : null
  const visibleGenerationLogRows = generationLogRows.filter((row) => row.id !== ACTIVE_GENERATION_PROGRESS_ROW_ID)
  const seedAssemblySections = useMemo(() => buildSeedAssemblySections(sessionEvents), [sessionEvents])
  const seedAssemblyItems = useMemo(() => seedAssemblySections.flatMap((section) => section.items), [seedAssemblySections])
  const latestSeedAssemblyItemId = seedAssemblyItems.at(-1)?.id ?? null
  const tokenMeter = useMemo(() => buildWorldPromptSessionTokenMeter({
    turns: sessionTurns,
    messages: sessionMessages,
    events: sessionEvents,
    generationJobSteps: generationSteps,
  }), [generationSteps, sessionEvents, sessionMessages, sessionTurns])
  const generationLogScrollKey = visibleGenerationLogRows
    .map((row) => `${row.id}:${row.status}:${row.title}:${row.detail}`)
    .join('|')

  useEffect(() => {
    const element = generationLogRef.current
    if (!element) return
    const frameId = window.requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [generationLogScrollKey])

  useEffect(() => {
    if (!latestSeedAssemblyItemId || !generationPreviewRef.current) return
    const frameId = window.requestAnimationFrame(() => {
      latestPreviewCardRef.current?.scrollIntoView({ block: 'end', behavior: seedGenerationStarted ? 'smooth' : 'auto' })
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [latestSeedAssemblyItemId, seedGenerationStarted])

  useEffect(() => {
    if (!expandedPreview) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setExpandedPreview(null)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [expandedPreview])

  async function handleSubmit() {
    if (!canSubmit) return
    setError(null)
    try {
      await onSubmit({
        prompt: generatedPrompt,
        sourceContext: {
          ...effectiveSourceContext,
          extractedText: effectiveSourceContext.extractedText || prompt.trim(),
        },
      })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'World generation failed.')
      throw submitError
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    setSourceWarning(null)
    setIsExtracting(true)
    try {
      const result = await extractOnboardingSourceFromFile(file)
      setSourceContext(result.context)
      setSourceWarning(result.warning)
      if (!prompt.trim()) {
        setPrompt(`Build the first connected world graph from ${file.name}. Extract the important characters, places, factions, objects, events, story beats, and relationships.`)
      }
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : 'Could not read that file.')
    } finally {
      setIsExtracting(false)
    }
  }

  async function handleUrlImport() {
    const url = urlDraft.trim()
    if (!url) return
    setError(null)
    setSourceWarning(null)
    setIsExtracting(true)
    try {
      const context = await workspaceService.extractSourceUrlForWorldPrompt(url)
      setSourceContext(context)
      setSourceWarning(context.truncated ? 'Using the first imported section from this URL.' : null)
      if (!prompt.trim()) {
        setPrompt(`Build the first connected world graph from this link. Extract the important people, places, groups, objects, events, story beats, and relationships.`)
      }
      setLinkOpen(false)
      setUrlDraft('')
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : 'Could not import that URL.')
    } finally {
      setIsExtracting(false)
    }
  }

  function handleExample(example: typeof EXAMPLES[number]) {
    const normalized = normalizeOnboardingSourceText(example.prompt)
    setPrompt(example.prompt)
    setSourceContext({
      kind: 'example',
      title: example.title,
      fileName: null,
      mimeType: null,
      url: null,
      extractedText: normalized.text,
      charCount: normalized.charCount,
      truncated: normalized.truncated,
    })
    setSourceWarning(null)
    setError(null)
  }

  function openExpandedPreview(title: string, label: string, text: string) {
    setExpandedPreview({ title, label, text })
  }

  function renderPreviewText(title: string, label: string, text: string, className = 'world-onboarding-preview-text') {
    if (!text.trim()) return null
    const long = isLongPreviewText(text)
    return (
      <div className={className}>
        <span>{compactPreviewText(text)}</span>
        {long ? (
          <button onClick={() => openExpandedPreview(title, label, text)} type="button">
            Read full
          </button>
        ) : null}
      </div>
    )
  }

  function renderAssemblyDetailsButton(item: SeedAssemblyItem) {
    if (!item.detailText?.trim()) return null
    return (
      <button
        className="world-onboarding-assembly-detail-button"
        onClick={() => openExpandedPreview(item.title, item.subtitle || 'Details', item.detailText ?? '')}
        type="button"
      >
        Details
      </button>
    )
  }

  function renderAssemblyItem(item: SeedAssemblyItem, section: SeedAssemblySection, isLatest: boolean) {
    if (section.kind === 'relationships') {
      return (
        <div
          key={item.id}
          ref={isLatest ? latestPreviewCardRef : null}
          className={`world-onboarding-assembly-relationship${isLatest ? ' is-latest' : ''}`}
        >
          <div className="world-onboarding-assembly-icon is-small">
            <EntityIcon id={item.icon} />
          </div>
          <div>
            <strong>{item.relationshipText || item.title}</strong>
            {item.summary ? <p>{compactPreviewText(item.summary, 150)}</p> : null}
          </div>
          {renderAssemblyDetailsButton(item)}
        </div>
      )
    }

    if (section.kind === 'storyBeats') {
      return (
        <article
          key={item.id}
          ref={isLatest ? latestPreviewCardRef : null}
          className={`world-onboarding-assembly-beat${isLatest ? ' is-latest' : ''}`}
        >
          <div className="world-onboarding-assembly-ordinal">{item.ordinal ?? item.sequence}</div>
          <div className="world-onboarding-assembly-beat-body">
            <div className="world-onboarding-assembly-card-head">
              <span>{item.subtitle}</span>
              <h3>{item.title}</h3>
            </div>
            {item.summary ? <p className="world-onboarding-assembly-summary">{compactPreviewText(item.summary, 220)}</p> : null}
            {item.outcome ? (
              <div className="world-onboarding-assembly-outcome">
                <span>Outcome</span>
                <p>{compactPreviewText(item.outcome, 180)}</p>
              </div>
            ) : null}
            {renderAssemblyDetailsButton(item)}
          </div>
        </article>
      )
    }

    return (
      <article
        key={item.id}
        ref={isLatest ? latestPreviewCardRef : null}
        className={`world-onboarding-assembly-card is-${section.kind}${isLatest ? ' is-latest' : ''}`}
      >
        <div className="world-onboarding-assembly-icon">
          <EntityIcon id={item.icon} />
        </div>
        <div className="world-onboarding-assembly-card-head">
          <span>{item.subtitle}</span>
          <h3>{item.title}</h3>
        </div>
        {item.summary ? <p className="world-onboarding-assembly-summary">{compactPreviewText(item.summary, 190)}</p> : null}
        {item.roleLabel ? <small>{item.roleLabel}</small> : null}
        {renderAssemblyDetailsButton(item)}
      </article>
    )
  }

  function renderAssemblySection(section: SeedAssemblySection) {
    const isTimeline = section.kind === 'storyBeats'
    const isRelationships = section.kind === 'relationships'
    const bodyClassName = isTimeline
      ? 'world-onboarding-assembly-timeline'
      : isRelationships
        ? 'world-onboarding-assembly-relationship-list'
        : 'world-onboarding-assembly-grid'
    return (
      <section key={section.kind} className={`world-onboarding-assembly-section is-${section.kind}`}>
        <div className="world-onboarding-assembly-section-head">
          <div className="world-onboarding-assembly-icon is-small">
            <EntityIcon id={section.icon} />
          </div>
          <div>
            <span>{section.subtitle}</span>
            <h3>{section.title}</h3>
          </div>
          <strong>{section.items.length}</strong>
        </div>
        <div className={bodyClassName}>
          {section.items.map((item) => renderAssemblyItem(item, section, item.id === latestSeedAssemblyItemId))}
        </div>
      </section>
    )
  }

  const submittedPromptPreview = prompt.trim() || seedInference?.turn.prompt || generatedPrompt
  const activeGenerationTitle = seedGenerationStarted ? activeGenerationLogRow?.title ?? 'Generating' : 'Ready to build'
  const activeGenerationDetail = seedGenerationStarted
    ? activeGenerationLogRow?.detail ?? 'Waiting for the next generated item.'
    : 'Choose an art style to start.'

  const generationSeedInference = seedInference
  if (generationSeedInference) {
    return (
      <div className="world-onboarding-input-first is-generating">
        <div className="world-onboarding-background-graph" aria-hidden="true" />
        <section className="world-onboarding-generation-workspace" aria-live="polite">
          <aside className="world-onboarding-generation-side">
            <div className="world-onboarding-generation-head">
              <h1>Building your world...</h1>
              <div className="world-onboarding-generation-subhead">
                <p>This usually takes 20-60 seconds.</p>
                <span className="world-onboarding-token-meter" title={tokenMeter.title}>
                  {tokenMeter.label} tokens
                </span>
              </div>
            </div>

            <div className="world-onboarding-generation-prompt-card">
              <span className="eyebrow">{generationSourceLabel}</span>
              <strong>{formatInferenceLabel(generationSeedInference.inference.projectType)} / {formatInferenceLabel(generationSeedInference.inference.projectSubtype)}</strong>
              {renderPreviewText('Submitted prompt', 'Prompt', submittedPromptPreview, 'world-onboarding-generation-prompt-text')}
            </div>

            <div className="world-onboarding-generation-active">
              <div className="world-onboarding-live-icon">
                <EntityIcon id={activeGenerationLogRow?.icon ?? 'global'} />
              </div>
              <div>
                <span className="eyebrow">Now</span>
                <strong>{activeGenerationTitle}</strong>
                {activeGenerationDetail ? <p>{activeGenerationDetail}</p> : null}
              </div>
              {activeGenerationLogRow ? <span className="world-onboarding-now-spinner" aria-hidden="true" /> : null}
            </div>

            <div ref={generationLogRef} className="world-onboarding-live-log is-compact" aria-label="Generation details">
              {visibleGenerationLogRows.slice(-7).map((row) => (
                <div key={row.id} className={`world-onboarding-live-row is-${row.status}`}>
                  <div className="world-onboarding-live-icon">
                    <EntityIcon id={row.icon} />
                  </div>
                  <div className="world-onboarding-live-copy">
                    <strong>{row.title}</strong>
                    {row.detail ? <p>{row.detail}</p> : null}
                  </div>
                  <span className="world-onboarding-live-state" aria-label={row.status}>
                    {row.status === 'done' ? <EntityIcon id="check" /> : null}
                    {row.status === 'failed' ? <EntityIcon id="close" /> : null}
                  </span>
                  {row.index !== null && row.total !== null ? (
                    <span className="world-onboarding-live-count">{row.index}/{row.total}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </aside>

          <main className="world-onboarding-preview-panel">
            <div className="world-onboarding-preview-head">
              <div>
                <span className="eyebrow">World assembly</span>
                <h2>Your world forming live</h2>
              </div>
              <span>{seedAssemblyItems.length} pieces</span>
            </div>

            <div ref={generationPreviewRef} className="world-onboarding-preview-feed" aria-label="World assembly">
              {seedAssemblySections.length === 0 ? (
                <div className="world-onboarding-preview-empty">
                  <div className="world-onboarding-live-icon">
                    <EntityIcon id="content" />
                  </div>
                  <strong>Waiting for the first world piece...</strong>
                  <p>The overview, cast, places, artifacts, lore, story beats, and connections will assemble here as they land.</p>
                </div>
              ) : null}
              {seedAssemblySections.map(renderAssemblySection)}
            </div>
          </main>
        </section>

        {expandedPreview ? (
          <div className="world-onboarding-modal-backdrop" onClick={() => setExpandedPreview(null)} role="presentation">
            <section className="world-onboarding-preview-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
              <div className="world-onboarding-modal-head">
                <span className="eyebrow">{expandedPreview.label}</span>
                <h2>{expandedPreview.title}</h2>
              </div>
              <div className="world-onboarding-preview-modal-body">{expandedPreview.text}</div>
              <button className="ghost-button compact" onClick={() => setExpandedPreview(null)} type="button">Close</button>
            </section>
          </div>
        ) : null}

        {!seedGenerationStarted ? (
          <div className="world-onboarding-modal-backdrop" role="presentation">
            <section className="world-onboarding-style-modal" role="dialog" aria-modal="true" aria-labelledby="world-onboarding-style-title">
              <div className="world-onboarding-modal-head">
                <span className="eyebrow">Art direction</span>
                <h2 id="world-onboarding-style-title">Choose the look before generation</h2>
                <p>{generationSeedInference.inference.rationale}</p>
              </div>
              <div className="world-onboarding-seed-style-grid">
                {generationSeedInference.artStyleOptions.map((option: WorldPromptArtStyleOption) => {
                  const atlasStyle = generationSeedInference.inference.projectType === 'story'
                    ? getStoryArtStyleAtlasStyle(option.id)
                    : null
                  return (
                    <button
                      key={option.id}
                      className={`world-onboarding-seed-style-card${(selectedStyle?.id ?? selectedArtStyleId) === option.id ? ' is-selected' : ''}`}
                      disabled={isSaving}
                      onClick={() => setSelectedArtStyleId(option.id)}
                      type="button"
                    >
                      <div className={`world-onboarding-seed-style-media${atlasStyle ? ' is-atlas' : ''}`} style={atlasStyle ?? undefined}>
                        {!atlasStyle && option.thumbnailUrl ? <img src={option.thumbnailUrl} alt="" /> : null}
                      </div>
                      <div className="world-onboarding-seed-style-copy">
                        <strong>{option.label}</strong>
                        <small>{option.recommended ? 'Recommended' : option.group}</small>
                      </div>
                    </button>
                  )
                })}
              </div>
              {error ? <div className="world-onboarding-error">{error}</div> : null}
              <button
                className="primary-button world-onboarding-create-button button-with-spinner"
                disabled={isSaving || !selectedStyle}
                onClick={() => {
                  if (!generationSeedInference || !selectedStyle) return
                  void onContinueSeed({
                    turnId: generationSeedInference.turn.id,
                    selectedArtStylePreset: selectedStyle.id,
                    selectedArtStyleDescription: selectedStyle.description,
                  })
                }}
                type="button"
              >
                {isSaving ? <><span className="button-spinner" aria-hidden="true" />Building world...</> : 'Build my world'}
              </button>
            </section>
          </div>
        ) : null}
      </div>
    )
  }

  const legacySeedInference = seedInference as unknown as WorldPromptSeedInferenceResponse | null

  return (
    <div className="world-onboarding-input-first">
      <div className="world-onboarding-background-graph" aria-hidden="true" />
      <img
        className="world-onboarding-side-hero-graphic"
        src="/landing/hero-world-core-v4.png"
        alt=""
        aria-hidden="true"
      />
      <section className="world-onboarding-hero">
        <h1>Create your <span>world</span></h1>
        
      </section>

      <section ref={promptSystemRef} className="world-onboarding-prompt-system" aria-label="Create a connected world from one prompt">
        <svg
          className="world-onboarding-orbit-edge-layer"
          aria-hidden="true"
          viewBox={`0 0 ${orbitConnectors.stageSize.width || 1180} ${orbitConnectors.stageSize.height || 360}`}
        >
          <defs>
            <linearGradient id="world-onboarding-orbit-edge-gradient" x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#8b3cff" stopOpacity="0.2" />
              <stop offset="48%" stopColor="#39d8ff" stopOpacity="0.42" />
              <stop offset="100%" stopColor="#2277ff" stopOpacity="0.18" />
            </linearGradient>
            <filter id="world-onboarding-orbit-edge-glow" x="-30%" y="-80%" width="160%" height="260%">
              <feGaussianBlur stdDeviation="2.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {orbitConnectors.connectors.map((connector) => (
            <path
              className="world-onboarding-orbit-edge"
              d={connector.d}
              filter="url(#world-onboarding-orbit-edge-glow)"
              key={connector.id}
            />
          ))}
        </svg>
        {orbitAnimation.activeNodes.map((node) => {
          const swapClass =
            orbitAnimation.swapState?.slotClassName === node.className
              ? ` is-orbit-swapping-${orbitAnimation.swapState.phase}`
              : ''

          return (
            <article
              className={`world-onboarding-orbit-node ${node.className}${swapClass}`}
              data-orbit-slot={node.className}
              key={node.className}
            >
              <span className="world-onboarding-orbit-node-drift">
                <span className="world-onboarding-orbit-node-inner">
                  <strong>{node.title}</strong>
                  <span className="world-onboarding-icon-frame">
                    <LandingIcon id={node.icon} />
                  </span>
                </span>
              </span>
            </article>
          )
        })}

        <section ref={composerCardRef} className="world-onboarding-composer-card">
        <label className="world-onboarding-prompt-label" htmlFor="world-onboarding-prompt">
          Describe your world, story, game, brand, or idea
        </label>
        <div className="world-onboarding-prompt-shell">
          <textarea
            id="world-onboarding-prompt"
            placeholder="e.g. A fallen empire ruled by shadows, where memory is the last magic..."
            value={prompt}
            maxLength={4000}
            disabled={Boolean(seedInference) || isSaving}
            onChange={(event) => {
              setPrompt(event.target.value)
              if (sourceContext?.kind === 'prompt') setSourceContext(null)
            }}
            rows={7}
          />
          <span className="world-onboarding-prompt-count">{prompt.length} / 4000</span>
          {!seedInference ? (
            <button
              className="world-onboarding-prompt-send-button"
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
              type="button"
              aria-label="Create world"
            >
              {isSaving || isExtracting ? <span className="button-spinner" aria-hidden="true" /> : <EntityIcon id="send" />}
            </button>
          ) : null}
        </div>

        {sourceContext && sourceContext.kind !== 'prompt' ? (
          <div className="world-onboarding-source-pill">
            <EntityIcon id={sourceContext.kind === 'url' ? 'content' : sourceContext.kind === 'file' ? 'content' : 'graph'} />
            <strong>{sourceContext.title || sourceContext.fileName || sourceContext.url || 'Source attached'}</strong>
            <span>{sourceContext.charCount.toLocaleString()} chars{sourceContext.truncated ? ' / truncated' : ''}</span>
            <button className="ghost-button compact" onClick={() => setSourceContext(null)} type="button">Remove</button>
          </div>
        ) : null}

        <div className="world-onboarding-source-actions">
          <button className="world-onboarding-source-button" disabled={Boolean(seedInference) || isExtracting || isSaving} onClick={() => fileInputRef.current?.click()} type="button">
            <EntityIcon id="content" />
            <span><strong>Upload file</strong><small>PDF, DOCX, TXT, JSON</small></span>
          </button>
          <button className="world-onboarding-source-button" disabled={Boolean(seedInference) || isExtracting || isSaving} onClick={() => setLinkOpen((value) => !value)} type="button">
            <EntityIcon id="content" />
            <span><strong>Paste link</strong><small>Docs, sites, references</small></span>
          </button>
          <button className="world-onboarding-source-button" disabled={Boolean(seedInference) || isExtracting || isSaving} onClick={() => handleExample(EXAMPLES[0])} type="button">
            <EntityIcon id="graph" />
            <span><strong>Try example</strong><small>See what is possible</small></span>
          </button>
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept=".txt,.md,.markdown,.json,.pdf,.docx,text/plain,text/markdown,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileChange}
          />
        </div>

        {linkOpen ? (
          <div className="world-onboarding-link-row">
            <input value={urlDraft} onChange={(event) => setUrlDraft(event.target.value)} placeholder="https://..." />
            <button className="primary-button compact" disabled={!urlDraft.trim() || isExtracting} onClick={() => void handleUrlImport()} type="button">
              {isExtracting ? 'Importing...' : 'Import'}
            </button>
          </div>
        ) : null}

        {sourceWarning ? <div className="inline-note">{sourceWarning}</div> : null}
        {error ? <div className="world-onboarding-error">{error}</div> : null}

        {legacySeedInference ? (
          <div className="world-onboarding-seed-panel" aria-live="polite">
            <div className="world-onboarding-inference-card">
              <span className="eyebrow">Inferred project</span>
              <strong>{formatInferenceLabel(legacySeedInference.inference.projectType)} / {formatInferenceLabel(legacySeedInference.inference.projectSubtype)}</strong>
              <p>{legacySeedInference.inference.rationale}</p>
              <small>{Math.round(legacySeedInference.inference.confidence * 100)}% confidence · {legacySeedInference.skeletonProfile.label}</small>
            </div>
            <div className="world-onboarding-style-grid">
              {legacySeedInference.artStyleOptions.map((option: WorldPromptArtStyleOption) => (
                <button
                  key={option.id}
                  className={`world-onboarding-style-option${(selectedStyle?.id ?? selectedArtStyleId) === option.id ? ' is-selected' : ''}`}
                  onClick={() => setSelectedArtStyleId(option.id)}
                  type="button"
                >
                  {option.thumbnailUrl ? <img src={option.thumbnailUrl} alt="" /> : null}
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.recommended ? 'Recommended' : option.group}</small>
                  </span>
                </button>
              ))}
            </div>
            <button
              className="primary-button world-onboarding-create-button button-with-spinner"
              disabled={isSaving || !selectedStyle}
              onClick={() => {
                if (!legacySeedInference || !selectedStyle) return
                void onContinueSeed({
                  turnId: legacySeedInference.turn.id,
                  selectedArtStylePreset: selectedStyle.id,
                  selectedArtStyleDescription: selectedStyle.description,
                })
              }}
              type="button"
            >
              {isSaving ? <><span className="button-spinner" aria-hidden="true" />Building world...</> : 'Build my world'}
            </button>
            <div className="world-onboarding-log">
              {visibleLogRows.length > 0 ? visibleLogRows.map((row, index) => (
                <div key={`${row}-${index}`} className="world-onboarding-log-row">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <p>{row}</p>
                </div>
              )) : (
                <div className="world-onboarding-log-row">
                  <span>01</span>
                  <p>Waiting for art style selection before building the initial skeleton.</p>
                </div>
              )}
            </div>
          </div>
        ) : null}
        </section>
      </section>

      <aside className="landing-proof-panel world-onboarding-proof-panel">
        <h2>Everything stays connected.</h2>
        <p>Change one thing, and it flows everywhere.</p>
        <img className="landing-mini-network" src="/landing/connected-network-v1.png" alt="" aria-hidden="true" />
        <p>One source of truth. Infinite possibilities.</p>
      </aside>

      <section className="world-onboarding-output-section" aria-label="Connected GraphCore outputs">
        <div className="world-onboarding-output-flow" aria-hidden="true">
          <svg viewBox="0 0 1200 260" preserveAspectRatio="none">
            <defs>
              <linearGradient id="world-onboarding-flow-gradient" x1="0%" x2="100%" y1="0%" y2="0%">
                <stop offset="0%" stopColor="#8b3cff" stopOpacity="0.82" />
                <stop offset="52%" stopColor="#d36cff" stopOpacity="0.72" />
                <stop offset="100%" stopColor="#39d8ff" stopOpacity="0.82" />
              </linearGradient>
              <linearGradient id="world-onboarding-flow-pulse-gradient" x1="0%" x2="100%" y1="0%" y2="0%">
                <stop offset="0%" stopColor="#8b3cff" stopOpacity="0" />
                <stop offset="32%" stopColor="#d36cff" stopOpacity="0.54" />
                <stop offset="52%" stopColor="#f3fdff" stopOpacity="0.86" />
                <stop offset="72%" stopColor="#39d8ff" stopOpacity="0.54" />
                <stop offset="100%" stopColor="#2277ff" stopOpacity="0" />
              </linearGradient>
              <filter id="world-onboarding-flow-glow" x="-20%" y="-80%" width="140%" height="260%">
                <feGaussianBlur stdDeviation="3.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="world-onboarding-flow-pulse-glow" x="-24%" y="-120%" width="148%" height="340%">
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
            <path className="world-onboarding-flow-line is-one" d="M600 0 C575 58 118 60 90 248" />
            <path className="world-onboarding-flow-line is-two" d="M600 0 C592 72 308 76 294 248" />
            <path className="world-onboarding-flow-line is-three" d="M600 0 C604 92 498 98 498 248" />
            <path className="world-onboarding-flow-line is-four" d="M600 0 C596 92 702 98 702 248" />
            <path className="world-onboarding-flow-line is-five" d="M600 0 C608 72 892 76 906 248" />
            <path className="world-onboarding-flow-line is-six" d="M600 0 C625 58 1082 60 1110 248" />
            <path className="world-onboarding-flow-pulse-glow is-one" d="M600 0 C575 58 118 60 90 248" />
            <path className="world-onboarding-flow-pulse-glow is-two" d="M600 0 C592 72 308 76 294 248" />
            <path className="world-onboarding-flow-pulse-glow is-three" d="M600 0 C604 92 498 98 498 248" />
            <path className="world-onboarding-flow-pulse-glow is-four" d="M600 0 C596 92 702 98 702 248" />
            <path className="world-onboarding-flow-pulse-glow is-five" d="M600 0 C608 72 892 76 906 248" />
            <path className="world-onboarding-flow-pulse-glow is-six" d="M600 0 C625 58 1082 60 1110 248" />
            <path className="world-onboarding-flow-pulse is-one" d="M600 0 C575 58 118 60 90 248" />
            <path className="world-onboarding-flow-pulse is-two" d="M600 0 C592 72 308 76 294 248" />
            <path className="world-onboarding-flow-pulse is-three" d="M600 0 C604 92 498 98 498 248" />
            <path className="world-onboarding-flow-pulse is-four" d="M600 0 C596 92 702 98 702 248" />
            <path className="world-onboarding-flow-pulse is-five" d="M600 0 C608 72 892 76 906 248" />
            <path className="world-onboarding-flow-pulse is-six" d="M600 0 C625 58 1082 60 1110 248" />
            <circle className="world-onboarding-flow-dot" cx="600" cy="0" r="4" />
            <circle className="world-onboarding-flow-dot" cx="90" cy="248" r="3" />
            <circle className="world-onboarding-flow-dot" cx="294" cy="248" r="3" />
            <circle className="world-onboarding-flow-dot" cx="498" cy="248" r="3" />
            <circle className="world-onboarding-flow-dot" cx="702" cy="248" r="3" />
            <circle className="world-onboarding-flow-dot" cx="906" cy="248" r="3" />
            <circle className="world-onboarding-flow-dot" cx="1110" cy="248" r="3" />
          </svg>
        </div>
        <div className="world-onboarding-output-grid">
          {ONBOARDING_OUTPUT_CARDS.map((card) => (
            <article className="world-onboarding-output-card" key={card.title}>
              <header>
                <span className="world-onboarding-icon-frame">
                  <EntityIcon id={card.icon} />
                </span>
                <div>
                  <strong>{card.title}</strong>
                  <p>{card.copy}</p>
                </div>
              </header>
              <div className={`world-onboarding-output-media ${card.media}`} />
              <div className="world-onboarding-card-chips">
                {card.chips.map((chip) => (
                  <span key={chip}>{chip}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
