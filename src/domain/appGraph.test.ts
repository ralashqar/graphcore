import test from 'node:test'
import assert from 'node:assert/strict'

import { APP_BLUEPRINTS, getAllAppBlueprints } from './appBlueprints.ts'
import { APP_EXPO_BASE_FILE_PLAN, createDefaultAppCodegenProjectPlan } from './appCodegen.ts'
import {
  appGraphEdgeVerbSchema,
  appGraphNodeTypeSchema,
  defaultCapabilityRule,
  isAppGraphNodeType,
} from './appGraph.ts'
import { projectContextSchema } from './projectContext.ts'
import { getBrainProfileSummary, getProjectSubtypeOptions } from './projectContextProfiles.ts'
import { worldEntityCreateInputSchema } from './worldGraph.ts'

test('app project context accepts app type and subtypes', () => {
  const parsed = projectContextSchema.parse({
    projectType: 'app',
    projectSubtype: 'ai_utility_wrapper',
    brainProfile: 'app',
    artStylePreset: 'premium_mobile_utility',
  })

  assert.equal(parsed.projectType, 'app')
  assert.equal(parsed.projectSubtype, 'ai_utility_wrapper')
  assert.equal(getProjectSubtypeOptions('app').length, 3)
  assert.match(getBrainProfileSummary('content_generator'), /screens/i)
})

test('app graph node and edge contracts cover MVP ontology', () => {
  assert.equal(isAppGraphNodeType('screen'), true)
  assert.equal(isAppGraphNodeType('sequence_unit'), false)
  assert.equal(appGraphNodeTypeSchema.parse('api_endpoint'), 'api_endpoint')
  assert.equal(appGraphEdgeVerbSchema.parse('requires_capability'), 'requires_capability')

  const screen = worldEntityCreateInputSchema.parse({
    name: 'ResultRevealScreen',
    nodeType: 'screen',
    summary: 'Reveals the generated result.',
    customProperties: {
      app: {
        route: '/reveal',
        purpose: 'Show first value and next action.',
      },
    },
  })

  assert.equal(screen.nodeType, 'screen')
  assert.equal(screen.ensureLinkedDefinition, true)
})

test('app blueprints define commercial screen/data/action coverage', () => {
  for (const blueprint of getAllAppBlueprints()) {
    assert.ok(blueprint.requiredScreens.length >= 7)
    assert.ok(blueprint.typicalDataModels.length >= 5)
    assert.ok(blueprint.commonActions.length >= 5)
    assert.ok(blueprint.monetizationMoment.length > 0)
  }

  assert.equal(APP_BLUEPRINTS.mascot_daily_ritual.requiredScreens.some((screen) => screen.name === 'ResultRevealScreen'), true)
})

test('app codegen plan targets Expo React Native preview', () => {
  const plan = createDefaultAppCodegenProjectPlan()

  assert.equal(plan.stack, 'expo_react_native')
  assert.equal(plan.previewTarget, 'expo_web')
  assert.ok(APP_EXPO_BASE_FILE_PLAN.some((file) => file.path === 'app/_layout.tsx'))
  assert.ok(plan.files.some((file) => file.path === 'lib/backend/LocalMockBackendAdapter.ts'))
})

test('app capability rules mark native-only features for later dev builds', () => {
  assert.equal(defaultCapabilityRule('Camera').expoGo, 'supported')

  const health = defaultCapabilityRule('HealthKit')
  assert.equal(health.webPreview, 'mocked')
  assert.equal(health.expoGo, 'unsupported')
  assert.equal(health.requiresDevBuild, true)
  assert.equal(health.requiresAppleDeveloper, true)
})
