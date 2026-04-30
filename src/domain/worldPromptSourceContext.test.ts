import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isInitialSeedGenerationTurn,
  isPendingInitialSeedGenerationTurn,
  worldPromptProjectContextInferenceSchema,
  worldPromptEventPayloadSchema,
  worldPromptIncrementalManifestSchema,
  worldPromptSeedGenerationRequestSchema,
  worldPromptSeedInferenceRequestSchema,
  worldPromptStartTurnRequestSchema,
} from './worldPrompt.ts'
import { getDefaultProjectContext } from './projectContextProfiles.ts'

const minimalSnapshot = {
  workspace: {
    id: 'workspace-1',
    name: 'Workspace',
    slug: 'workspace',
    role: 'owner',
  },
  project: {
    id: 'project-1',
    name: 'Project',
    slug: 'project',
    summary: '',
    visibility: 'private',
  },
  draft: {
    id: 'draft-1',
    name: 'Draft',
    version: 1,
    isPrimary: true,
    updatedAt: '',
    metadata: {},
  },
  definitions: [],
  graphs: [],
  assets: [],
  worldEntities: [],
  worldRelationships: [],
  worldViews: [],
  worldOperators: [],
  worldResults: [],
  worldGraphConnections: [],
  worldThreads: [],
  gameSpec: null,
  projectContext: null,
}

test('world prompt start request accepts source context', () => {
  const parsed = worldPromptStartTurnRequestSchema.parse({
    prompt: 'Build from this file.',
    sourceContext: {
      kind: 'file',
      title: 'Outline',
      fileName: 'outline.txt',
      mimeType: 'text/plain',
      url: null,
      extractedText: 'A kingdom under glass.',
      charCount: 23,
      truncated: false,
    },
    snapshot: minimalSnapshot,
  })

  assert.equal(parsed.sourceContext?.kind, 'file')
  assert.equal(parsed.sourceContext?.fileName, 'outline.txt')
})

test('incremental manifest and work item event payloads validate', () => {
  const manifest = worldPromptIncrementalManifestSchema.parse({
    summary: 'Build the first connected world skeleton.',
    classification: 'graphable_broad',
    assistantSummary: 'Creating the starting world in steps.',
    workItems: [
      {
        id: 'core_cast',
        kind: 'entity_batch',
        label: 'Core cast',
        objective: 'Create the main characters.',
        expectedOps: 4,
        critical: true,
      },
      {
        id: 'opening_sequence',
        kind: 'sequence_unit',
        label: 'Opening sequence',
        objective: 'Create the first authored story beat.',
        sequenceOrdinal: 1,
      },
    ],
  })

  assert.equal(manifest.workItems.length, 2)
  assert.equal(manifest.workItems[1]?.kind, 'sequence_unit')

  const payload = worldPromptEventPayloadSchema.parse({
    plannerStatus: 'planning',
    workItem: manifest.workItems[0],
    workItemIndex: 1,
    workItemTotal: 2,
    plannerProgress: {
      phase: 'generating_entity',
      message: 'Core cast: Create the main characters.',
      sequence: 1,
      workItemId: 'core_cast',
      workItemKind: 'entity_batch',
      index: 1,
      total: 2,
    },
  })

  assert.equal(payload.workItem?.label, 'Core cast')
  assert.equal(payload.plannerProgress?.phase, 'generating_entity')
})

test('project context inference validates supported subtype', () => {
  const inferred = worldPromptProjectContextInferenceSchema.parse({
    projectType: 'game',
    projectSubtype: 'action_rpg',
    artStylePreset: 'premium_stylized_3d',
    confidence: 0.86,
  })

  assert.equal(inferred.projectType, 'game')
  assert.equal(inferred.projectSubtype, 'action_rpg')
})

test('initial seed request schemas accept inference and generation stages', () => {
  const inferenceRequest = worldPromptSeedInferenceRequestSchema.parse({
    prompt: 'A haunted city under the ocean.',
    sessionKey: 'world.seed.test',
    sourceContext: {
      kind: 'prompt',
      title: '',
      fileName: null,
      mimeType: null,
      url: null,
      extractedText: 'A haunted city under the ocean.',
      charCount: 31,
      truncated: false,
    },
    snapshot: minimalSnapshot,
  })
  assert.equal(inferenceRequest.sessionKey, 'world.seed.test')

  const generationRequest = worldPromptSeedGenerationRequestSchema.parse({
    turnId: 'turn-1',
    selectedArtStylePreset: 'live_action_cinematic',
    selectedArtStyleDescription: 'Cinematic practical lighting.',
    snapshot: {
      ...minimalSnapshot,
      projectContext: getDefaultProjectContext('story'),
    },
  })
  assert.equal(generationRequest.selectedArtStylePreset, 'live_action_cinematic')
})

test('first-run default context remains incomplete before inference', () => {
  const context = getDefaultProjectContext('story')

  assert.equal(context.projectType, 'story')
  assert.equal(context.projectSubtype, 'feature_film')
  assert.equal(context.onboardingCompletedAt, null)
})

test('initial seed generation helper stays pending until terminal status', () => {
  const metadata = {
    initialSeedMode: 'generate_skeleton',
    initialSeedContext: {
      mode: 'generate_skeleton',
      selectedArtStylePreset: 'live_action_cinematic',
      selectedArtStyleDescription: 'Cinematic practical lighting.',
      skeletonProfileId: 'story.feature_film',
    },
  } as const

  assert.equal(isInitialSeedGenerationTurn({ metadata }), true)
  assert.equal(isPendingInitialSeedGenerationTurn({ metadata, status: 'streaming' }), true)
  assert.equal(isPendingInitialSeedGenerationTurn({ metadata, status: 'failed' }), true)
  assert.equal(isPendingInitialSeedGenerationTurn({ metadata, status: 'completed' }), false)
  assert.equal(isPendingInitialSeedGenerationTurn({ metadata, status: 'cancelled' }), false)
})
