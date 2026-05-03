import test from 'node:test'
import assert from 'node:assert/strict'

import type { ProjectContext } from './projectContext.ts'
import type { WorldEntity, WorldRelationship, WorldWikiPresentationMetadata } from './worldGraph.ts'
import type { WorldPromptSuggestion } from './worldPrompt.ts'
import { worldPromptIncrementalWorkItemSchema } from './worldPrompt.ts'
import {
  buildAppGraphReadinessFindings,
  buildAppImplementationPlanIncrementalWorkItems,
  buildDefaultAppIncrementalWorkItems,
  filterSuggestionsForPromptStrategy,
  getWorldPromptStrategy,
  normalizeWorkItemForPromptStrategy,
  suggestionContainsForbiddenAppStoryLanguage,
} from './worldPromptStrategies.ts'

const appContext: ProjectContext = {
  projectType: 'app',
  projectSubtype: 'mascot_daily_ritual',
  brainProfile: 'app',
  artStylePreset: 'playful_ritual_companion',
  artStyleDescription: '',
  onboardingCompletedAt: null,
  onboardingVersion: 'test',
  source: 'onboarding',
}

const gameContext: ProjectContext = {
  projectType: 'game',
  projectSubtype: 'narrative_rpg_mobile',
  brainProfile: 'game',
  artStylePreset: 'premium_stylized_3d',
  artStyleDescription: '',
  onboardingCompletedAt: null,
  onboardingVersion: 'test',
  source: 'onboarding',
}

function createEntity(input: Partial<WorldEntity> & Pick<WorldEntity, 'key' | 'name' | 'nodeType'>): WorldEntity {
  return {
    id: input.id ?? input.key,
    key: input.key,
    name: input.name,
    summary: input.summary ?? '',
    context: input.context ?? '',
    nodeType: input.nodeType,
    aliases: input.aliases ?? [],
    tags: input.tags ?? [],
    status: input.status ?? 'active',
    thumbnailAssetKey: input.thumbnailAssetKey ?? null,
    linkedDefinitionKey: input.linkedDefinitionKey ?? null,
    source: input.source ?? 'ai',
    customProperties: input.customProperties ?? {},
    metadata: input.metadata ?? {},
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }
}

function createRelationship(input: Partial<WorldRelationship> & Pick<WorldRelationship, 'key' | 'sourceEntityKey' | 'targetEntityKey' | 'verb'>): WorldRelationship {
  return {
    id: input.id ?? input.key,
    key: input.key,
    sourceEntityKey: input.sourceEntityKey,
    targetEntityKey: input.targetEntityKey,
    verb: input.verb,
    direction: input.direction ?? 'outbound',
    strength: input.strength ?? null,
    confidence: input.confidence ?? null,
    source: input.source ?? 'ai',
    notes: input.notes ?? '',
    state: input.state ?? 'confirmed',
    metadata: input.metadata ?? {},
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }
}

function suggestion(input: Partial<WorldPromptSuggestion> & Pick<WorldPromptSuggestion, 'id' | 'label' | 'prompt'>): WorldPromptSuggestion {
  return {
    id: input.id,
    label: input.label,
    prompt: input.prompt,
    kind: input.kind ?? 'continue_scope',
    style: input.style ?? 'secondary',
    source: input.source ?? 'wave2',
    threadKey: input.threadKey ?? null,
    summary: input.summary ?? '',
    estimatedNodeCount: input.estimatedNodeCount ?? 1,
    estimatedEdgeCount: input.estimatedEdgeCount ?? 1,
    willQueueImages: input.willQueueImages ?? false,
    willQueueCinematics: input.willQueueCinematics ?? false,
    uiKind: input.uiKind,
    executionMode: input.executionMode,
    actionMode: input.actionMode,
    applyPolicy: input.applyPolicy,
    targetEntityKeys: input.targetEntityKeys,
    targetThreadKeys: input.targetThreadKeys,
    suggestedViewKey: input.suggestedViewKey,
    targetRootEntityKey: input.targetRootEntityKey,
    preferredViewKind: input.preferredViewKind,
    focusLayer: input.focusLayer,
    retrievalHint: input.retrievalHint,
    generatedReason: input.generatedReason,
    generatedFromTurnId: input.generatedFromTurnId,
  }
}

test('app project context selects app prompt strategy', () => {
  assert.equal(getWorldPromptStrategy(appContext).id, 'app')
  assert.equal(getWorldPromptStrategy(gameContext).id, 'game')
  assert.equal(getWorldPromptStrategy({ ...appContext, projectType: 'story', brainProfile: 'story', projectSubtype: 'feature_film' }).id, 'story')
})

test('app strategy filters story-shaped suggestions', () => {
  const suggestions = [
    suggestion({
      id: 'story-threat',
      label: 'Deepen The Main Threat',
      prompt: 'Add the villain pressure and hidden truth.',
    }),
    suggestion({
      id: 'app-api',
      label: 'Define Data And API Contracts',
      prompt: 'Add data_model, action, api_endpoint, and backend_function nodes.',
    }),
  ]

  const filtered = filterSuggestionsForPromptStrategy(suggestions, appContext)
  assert.deepEqual(filtered.map((entry) => entry.id), ['app-api'])
  assert.equal(suggestionContainsForbiddenAppStoryLanguage(suggestions[0]), true)
})

test('game strategy keeps playable graph suggestions and filters app implementation suggestions', () => {
  const suggestions = [
    suggestion({
      id: 'app-paywall',
      label: 'Define Subscription Paywall',
      prompt: 'Add conversion and paywall screens.',
    }),
    suggestion({
      id: 'game-rules',
      label: 'Validate Playable Rules',
      prompt: 'Add choice_condition and choice_outcome nodes for inventory, travel, and shadow-token gates.',
    }),
  ]

  const filtered = filterSuggestionsForPromptStrategy(suggestions, gameContext)
  assert.deepEqual(filtered.map((entry) => entry.id), ['game-rules'])
})

test('incremental app work items carry project type and app slice without sequence units', () => {
  const item = worldPromptIncrementalWorkItemSchema.parse({
    id: 'core_flow',
    kind: 'sequence_unit',
    label: 'Core App Flow',
    objective: 'Map onboarding and paywall flow.',
    entityTypes: ['user_flow', 'screen', 'sequence_unit'],
  })

  const normalized = normalizeWorkItemForPromptStrategy(item, appContext)
  assert.equal(normalized.projectType, 'app')
  assert.equal(normalized.kind, 'entity_batch')
  assert.equal(normalized.appSlice, 'flows')
  assert.equal(normalized.sequenceOrdinal, null)
  assert.equal(normalized.entityTypes.includes('sequence_unit'), false)

  const defaults = buildDefaultAppIncrementalWorkItems()
  assert.equal(defaults.every((entry) => entry.projectType === 'app'), true)
  assert.equal(defaults.some((entry) => entry.appSlice === 'data_api'), true)
  assert.equal(defaults.some((entry) => entry.entityTypes.includes('code_file')), false)
})

test('app implementation plan work items are limited to code planning and relationships', () => {
  const items = buildAppImplementationPlanIncrementalWorkItems()
  assert.deepEqual(items.map((item) => item.appSlice), ['towers_code_files', 'relationships'])
  assert.equal(items[0].entityTypes.every((nodeType) => nodeType === 'tower' || nodeType === 'code_file'), true)
  assert.equal(items.some((item) => item.entityTypes.includes('sequence_unit')), false)

  const normalized = normalizeWorkItemForPromptStrategy(worldPromptIncrementalWorkItemSchema.parse({
    id: 'implementation',
    kind: 'entity_batch',
    label: 'Implementation',
    objective: 'Create screens, towers, code files, and chapters.',
    entityTypes: ['screen', 'tower', 'code_file', 'sequence_unit'],
    appSlice: 'towers_code_files',
  }), appContext)

  assert.deepEqual(normalized.entityTypes, ['tower', 'code_file'])
})

test('app graph readiness reports app-specific gaps without story wording', () => {
  const screen = createEntity({
    key: 'world.screen.home',
    name: 'Daily Home Screen',
    nodeType: 'screen',
    summary: 'Home for the daily loop.',
    customProperties: { app: { route: '/home' } },
  })
  const action = createEntity({
    key: 'world.action.create-entry',
    name: 'Create Daily Entry',
    nodeType: 'action',
    summary: 'Stores a daily check-in.',
  })
  const api = createEntity({
    key: 'world.api.daily-entry',
    name: 'POST Daily Entry',
    nodeType: 'api_endpoint',
    summary: 'Creates a daily entry.',
    customProperties: { app: { method: 'POST', path: '/api/daily-entry' } },
  })
  const wikiMetadata: WorldWikiPresentationMetadata = {
    title: 'GlimmerNest',
    logline: 'A daily ritual app for magical creature cards.',
    colorScheme: { primary: '#6d5dfc' },
  }

  const findings = buildAppGraphReadinessFindings({
    entities: [screen, action, api],
    relationships: [
      createRelationship({ key: 'r1', sourceEntityKey: screen.key, targetEntityKey: action.key, verb: 'emits' }),
    ],
    wikiMetadata,
  })
  const text = findings.map((finding) => `${finding.title} ${finding.summary}`).join(' ')

  assert.equal(findings.length > 0, true)
  assert.match(text, /screen contract|API contract|product layers|design system/i)
  assert.doesNotMatch(text, /threat|lore|hidden truth|motives|protagonist|sequence unit/i)
})
