import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isInitialSeedGenerationTurn,
  isPendingInitialSeedGenerationTurn,
  worldPromptProjectContextInferenceSchema,
  worldPromptEventPayloadSchema,
  worldPromptIncrementalManifestSchema,
  promptToWorldOpSchema,
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

test('world prompt source context accepts feed prompt mode', () => {
  const parsed = worldPromptStartTurnRequestSchema.parse({
    prompt: 'Insert a new chapter between chapter 2 and 3.',
    sourceContext: {
      kind: 'prompt',
      title: 'Feed prompt',
      extractedText: '',
      charCount: 0,
      truncated: false,
      promptMode: 'rewire',
    },
    snapshot: minimalSnapshot,
  })

  assert.equal(parsed.sourceContext?.promptMode, 'rewire')
})

test('canon transaction event payload and structural patch ops validate', () => {
  const relationshipPatch = promptToWorldOpSchema.parse({
    id: 'op-rewire-1',
    op: 'relationship_rewire_patch',
    payload: {
      reason: 'The stewardship link should point at the protocol instead.',
      rewires: [{
        targetRelationshipKey: 'rel-1',
        sourceEntityKey: 'anya',
        targetEntityKey: 'protocol',
        verb: 'stewards',
      }],
    },
  })
  const mergePatch = promptToWorldOpSchema.parse({
    id: 'op-merge-1',
    op: 'entity_merge_patch',
    payload: {
      sourceEntityKey: 'ghostline-collective-duplicate',
      targetEntityKey: 'ghostline-collective',
      reason: 'Duplicate faction created by prompt update.',
    },
  })
  const payload = worldPromptEventPayloadSchema.parse({
    canonIntent: {
      intent: 'structural_rewire',
      confidence: 0.9,
      reason: 'Insert/relink language detected.',
      promptMode: 'rewire',
    },
    transaction: {
      id: 'turn.turn-1',
      intent: 'structural_rewire',
      risk: 'high',
      status: 'validating',
      affectedEntityKeys: ['anya', 'protocol'],
      affectedRelationshipKeys: ['rel-1'],
      approvalRequired: true,
    },
    validation: {
      status: 'warning',
      issues: [{ code: 'approval_required', message: 'Relationship rewire requires preview approval.', severity: 'medium' }],
    },
    op: relationshipPatch,
    audit: { title: 'Relationship rewired' },
  })

  assert.equal(relationshipPatch.op, 'relationship_rewire_patch')
  assert.equal(mergePatch.op, 'entity_merge_patch')
  assert.equal(payload.canonIntent?.intent, 'structural_rewire')
  assert.equal(payload.transaction?.risk, 'high')
})

test('entity canon update op and node evolution events validate', () => {
  const op = promptToWorldOpSchema.parse({
    id: 'op-canon-1',
    op: 'update_entity_canon',
    payload: {
      targetEntityKey: 'world.actor.anya',
      factAdditions: [{
        factId: 'turn-1.fact.1',
        kind: 'state',
        text: 'Anya now carries the first-week leadership burden.',
      }],
      currentStatePatch: {
        role: 'acting field leader',
      },
      rationale: 'The prompt changes Anya current role without replacing her identity.',
      risk: 'low',
    },
  })
  const payload = worldPromptEventPayloadSchema.parse({
    nodeEvolution: {
      summary: 'Anya is an existing-node state change, not a new character.',
      decisions: [{
        subject: 'Anya Sorin',
        decision: 'state_change',
        targetEntityKey: 'world.actor.anya',
        confidence: 0.91,
        rationale: 'The prompt refers to the existing named character and changes her current role.',
        risk: 'low',
        suggestedFactKind: 'state',
      }],
    },
    op,
    audit: {
      title: 'Anya current state updated',
      addedFacts: [{ factId: 'turn-1.fact.1' }],
      currentStateChanged: true,
    },
  })

  assert.equal(op.op, 'update_entity_canon')
  assert.equal(op.payload.factAdditions[0]?.kind, 'state')
  assert.equal(payload.nodeEvolution?.decisions?.[0]?.decision, 'state_change')
  assert.equal(payload.audit?.currentStateChanged, true)
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
