import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'

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
  type WorldPromptMessage,
  type WorldPromptSeedInferenceResponse,
  type WorldPromptSourceContext,
  type WorldPromptTurn,
} from '../../domain/worldPrompt'
import { EntityIcon, type EntityIconId } from '../../shared/entityIcons'
import { buildWorldPromptSessionTokenMeter } from '../world/worldPresentation'

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

function plannerPhaseTitle(phase: string | null | undefined) {
  if (!phase) return 'Planning world graph'
  return formatInferenceLabel(phase)
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
        detail: `${formatInferenceLabel(entity.nodeType)} node added to the world graph.`,
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
        detail: relationship.verb ? formatInferenceLabel(relationship.verb) : 'Relationship added.',
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
  if (event.eventType === 'work_item_started' && payload.workItem?.label) {
    return {
      ...base,
      id: workItemRowId(base.index, payload.workItem.id ?? event.id),
      icon: workItemIcon(payload.workItem.kind),
      title: payload.workItem.label,
      detail: cleanSeedLogText(payload.plannerProgress?.message || payload.workItem.objective || 'Building this part of the world graph.'),
      status: 'active',
    }
  }
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
  if (payload.plannerProgress?.message) {
    return {
      ...base,
      id: `planner-${payload.plannerProgress.phase}-${payload.plannerProgress.sequence}`,
      icon: workItemIcon(payload.plannerProgress.workItemKind),
      title: plannerPhaseTitle(payload.plannerProgress.phase),
      detail: cleanSeedLogText(payload.plannerProgress.message),
      status: payload.plannerProgress.done ? 'done' : 'active',
    }
  }
  if (payload.note) {
    return {
      ...base,
      id: `note-${event.id}`,
      icon: 'content',
      title: 'Generation note',
      detail: cleanSeedLogText(payload.note),
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
  seedGenerationStarted: boolean
  seedInference: WorldPromptSeedInferenceResponse | null
  sourceLabel: string
}): SeedGenerationLogRow[] {
  if (!input.seedInference) return []
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

  if (input.events.length === 0) {
    rows.push({
      id: 'generation-starting',
      icon: 'global',
      title: 'Starting initial skeleton generation',
      detail: 'Waiting for the first live planner event.',
      status: 'active',
      createdAt: input.seedInference.turn.updatedAt,
      sequence: 2,
      index: null,
      total: null,
    })
    return rows
  }

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
  sessionMessages,
  sessionTurns,
  onSubmit,
  onContinueSeed,
  projectName: _projectName,
}: ProjectWorldOnboardingProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const generationLogRef = useRef<HTMLDivElement | null>(null)
  const [prompt, setPrompt] = useState('')
  const [sourceContext, setSourceContext] = useState<WorldPromptSourceContext | null>(null)
  const [sourceWarning, setSourceWarning] = useState<string | null>(null)
  const [urlDraft, setUrlDraft] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [selectedArtStyleId, setSelectedArtStyleId] = useState<string | null>(null)

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
  const generationLogRows = useMemo(() => buildSeedGenerationLogRows({
    events: sessionEvents,
    seedGenerationStarted,
    seedInference,
    sourceLabel: generationSourceLabel,
  }), [generationSourceLabel, seedGenerationStarted, seedInference, sessionEvents])
  const tokenMeter = useMemo(() => buildWorldPromptSessionTokenMeter({
    turns: sessionTurns,
    messages: sessionMessages,
    events: sessionEvents,
  }), [sessionEvents, sessionMessages, sessionTurns])
  const generationLogScrollKey = generationLogRows
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

  const generationSeedInference = seedInference
  if (generationSeedInference) {
    return (
      <div className="world-onboarding-input-first is-generating">
        <div className="world-onboarding-background-graph" aria-hidden="true" />
        <section className="world-onboarding-generation-shell" aria-live="polite">
          <div className="world-onboarding-generation-head">
            <h1>Building your world...</h1>
            <div className="world-onboarding-generation-subhead">
              <p>This usually takes 20-60 seconds.</p>
              <span className="world-onboarding-token-meter" title={tokenMeter.title}>
                {tokenMeter.label} tokens
              </span>
            </div>
          </div>

          <div ref={generationLogRef} className="world-onboarding-live-log" aria-label="Generation details">
            {generationLogRows.map((row) => (
              <div key={row.id} className={`world-onboarding-live-row is-${row.status}`}>
                <div className="world-onboarding-live-icon">
                  <EntityIcon id={row.icon} />
                </div>
                <div className="world-onboarding-live-copy">
                  <strong>{row.title}</strong>
                  <p>{row.detail}</p>
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
        </section>

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
      <section className="world-onboarding-hero">
        <h1>Create your <span>world</span></h1>
        <p>Start with one prompt, link, or file. GraphCore will turn it into a connected world.</p>
      </section>

      <section className="world-onboarding-composer-card">
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
          <span>{prompt.length} / 4000</span>
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

      {!seedInference ? (
        <>
          <button className="primary-button world-onboarding-create-button button-with-spinner" disabled={!canSubmit} onClick={() => void handleSubmit()} type="button">
            {isSaving || isExtracting ? <><span className="button-spinner" aria-hidden="true" />Creating world...</> : 'Create world'}
          </button>
          <div className="world-onboarding-create-note">Next: choose an art style, then GraphCore builds your world.</div>
        </>
      ) : null}

      <section className={`world-onboarding-example-strip${seedInference ? ' is-disabled' : ''}`}>
        <div className="world-onboarding-divider"><span>Try an example</span></div>
        <div className="world-onboarding-example-grid">
          {EXAMPLES.map((example) => (
            <button key={example.title} className="world-onboarding-example-card" disabled={Boolean(seedInference) || isSaving} onClick={() => handleExample(example)} type="button">
              <strong>{example.title}</strong>
              <span>{example.summary}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
