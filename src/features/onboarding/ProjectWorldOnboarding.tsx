import { useMemo, useRef, useState, type ChangeEvent } from 'react'

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
} from '../../domain/worldPrompt'
import { EntityIcon, type EntityIconId } from '../../shared/entityIcons'

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

const GENERATION_PHASES: Array<{
  id: string
  icon: EntityIconId
  title: string
  description: string
}> = [
  {
    id: 'analyzing',
    icon: 'content',
    title: 'Analyzing your input',
    description: 'Understanding the story, themes, and key elements...',
  },
  {
    id: 'extracting',
    icon: 'group',
    title: 'Extracting entities',
    description: 'Finding characters, places, factions, and objects...',
  },
  {
    id: 'mapping',
    icon: 'graph',
    title: 'Mapping relationships',
    description: 'Building connections and relationship pressure...',
  },
  {
    id: 'arcs',
    icon: 'thread',
    title: 'Generating story arcs',
    description: 'Identifying plotlines, conflicts, and timelines...',
  },
  {
    id: 'finalizing',
    icon: 'global',
    title: 'Finalizing world',
    description: 'Organizing everything in your world graph...',
  },
]

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

function describeSeedEvent(event: WorldPromptEvent) {
  const parsed = worldPromptEventPayloadSchema.safeParse(event.payload)
  if (!parsed.success) return null
  const payload = parsed.data
  if (event.eventType === 'work_item_started' && payload.workItem?.label) {
    return payload.plannerProgress?.message || `Building ${payload.workItem.label}`
  }
  if (event.eventType === 'work_item_completed' && payload.workItem?.label) {
    return `${payload.workItem.label} complete.`
  }
  if (event.eventType === 'work_item_failed' && payload.workItem?.label) {
    return `${payload.workItem.label} was skipped.`
  }
  if (payload.plannerProgress?.message) return payload.plannerProgress.message
  if (payload.note) return payload.note
  if (event.eventType === 'op_applied' && payload.op) {
    if (payload.op.op === 'upsert_entity') return `Created ${payload.op.payload.entity.name}`
    if (payload.op.op === 'upsert_relationship') {
      return `Linked ${payload.op.payload.relationship.sourceRef?.name ?? payload.op.payload.relationship.sourceEntityKey ?? 'source'} to ${payload.op.payload.relationship.targetRef?.name ?? payload.op.payload.relationship.targetEntityKey ?? 'target'}`
    }
    if (payload.op.op === 'update_world_wiki_metadata') return 'Updated world overview'
  }
  if (event.eventType === 'message_created' && payload.message?.role === 'assistant') return payload.message.content
  if (event.eventType === 'turn_completed') return 'Initial generation complete. Opening graph.'
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

function buildGenerationPhaseRows(events: WorldPromptEvent[], seedGenerationStarted: boolean) {
  let entityCount = 0
  let relationshipCount = 0
  let sequenceCount = 0
  let finalizing = false
  let completed = false

  for (const event of events) {
    const parsed = worldPromptEventPayloadSchema.safeParse(event.payload)
    if (!parsed.success) continue
    const payload = parsed.data
    if (event.eventType === 'op_applied' && payload.op) {
      if (payload.op.op === 'upsert_entity') {
        const nodeType = payload.op.payload.entity.nodeType
        if (nodeType === 'sequence_unit' || nodeType === 'event') sequenceCount += 1
        else entityCount += 1
      }
      if (payload.op.op === 'upsert_relationship') relationshipCount += 1
      if (payload.op.op === 'update_world_wiki_metadata') finalizing = true
    }
    if (event.eventType === 'work_item_started' && payload.workItem?.kind) {
      if (payload.workItem.kind === 'entity_batch') entityCount += 1
      if (payload.workItem.kind === 'sequence_unit') sequenceCount += 1
      if (payload.workItem.kind === 'relationship_batch') relationshipCount += 1
      if (payload.workItem.kind === 'wiki_metadata' || payload.workItem.kind === 'final_summary') finalizing = true
    }
    if (event.eventType === 'turn_completed' && payload.note?.toLowerCase().includes('initial generation complete')) {
      completed = true
    }
  }

  const activeIndex = completed
    ? GENERATION_PHASES.length
    : finalizing
      ? 4
      : sequenceCount > 0
        ? 3
        : relationshipCount > 0
          ? 2
          : entityCount > 0 || seedGenerationStarted
            ? 1
            : 0

  return GENERATION_PHASES.map((phase, index) => ({
    ...phase,
    status: completed || index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending',
  }))
}

export function ProjectWorldOnboarding({
  isSaving,
  seedInference,
  seedGenerationStarted,
  sessionEvents,
  sessionMessages: _sessionMessages,
  onSubmit,
  onContinueSeed,
  projectName: _projectName,
}: ProjectWorldOnboardingProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
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
    .map((event) => ({ id: event.id, text: describeSeedEvent(event) }))
    .filter((row): row is { id: string; text: string } => Boolean(row.text?.trim()))
  const visibleLogRows = dedupeLogRows(seedEventRows).map((row) => row.text).slice(-8)
  const selectedStyle = seedInference?.artStyleOptions.find((option) => option.id === selectedArtStyleId)
    ?? seedInference?.artStyleOptions.find((option) => option.recommended)
    ?? seedInference?.artStyleOptions[0]
    ?? null

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
    const sourceLabel = effectiveSourceContext.kind === 'file'
      ? effectiveSourceContext.fileName || effectiveSourceContext.title || 'Uploaded file'
      : effectiveSourceContext.kind === 'url'
        ? effectiveSourceContext.title || effectiveSourceContext.url || 'Imported link'
        : effectiveSourceContext.kind === 'example'
          ? effectiveSourceContext.title || 'Example seed'
          : 'Prompt'
    const logRows = dedupeLogRows([
      {
        id: 'prompt-received',
        text: `${sourceLabel} received. Reading the story, themes, and key elements.`,
      },
      {
        id: 'inference-result',
        text: `World direction set. ${generationSeedInference.inference.rationale}`,
      },
      ...(!seedGenerationStarted
        ? [{ id: 'await-style', text: 'Waiting for art style selection before building your world.' }]
        : [{ id: 'skeleton-started', text: 'Art style selected. Building the full starting world map.' }]),
      ...seedEventRows,
    ])
    const phaseRows = buildGenerationPhaseRows(sessionEvents, seedGenerationStarted)

    return (
      <div className="world-onboarding-input-first is-generating">
        <div className="world-onboarding-background-graph" aria-hidden="true" />
        <section className="world-onboarding-generation-shell" aria-live="polite">
          <div className="world-onboarding-generation-head">
            <h1>Building your world...</h1>
            <p>This usually takes 20-60 seconds.</p>
          </div>

          <div className="world-onboarding-phase-grid">
            {phaseRows.map((phase) => (
              <div key={phase.id} className={`world-onboarding-phase-row is-${phase.status}`}>
                <div className="world-onboarding-phase-icon">
                  <EntityIcon id={phase.icon} />
                </div>
                <div>
                  <strong>{phase.title}</strong>
                  <p>{phase.description}</p>
                </div>
                <span className="world-onboarding-phase-state" aria-label={phase.status}>
                  {phase.status === 'done' ? <EntityIcon id="check" /> : null}
                </span>
              </div>
            ))}
          </div>

          <div className="world-onboarding-log world-onboarding-log-expanded" aria-label="Generation details">
            {logRows.map((row, index) => (
              <div key={`${row.id}-${index}`} className="world-onboarding-log-row">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{row.text}</p>
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
