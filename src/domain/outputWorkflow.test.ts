import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

import {
  buildOutputGuidanceBundleForNode,
  buildOutputWorkflowExecutionPlan,
  buildOutputWorkflowFingerprint,
  bindOutputPromptWorldScope,
  classifyOutputPrompt,
  defaultOutputWorkflowConcurrency,
  getOutputWorkflowNodeExecutionMetadata,
  markDirtyOutputWorkflowNodes,
  outputWorkflowArtifactKindSchema,
  outputWorkflowGraphRequestSchema,
  outputWorkflowGraphResponseSchema,
  outputFeedResponseSchema,
  outputRequestStatusProjectionSchema,
  outputWorkflowRepairRequestSchema,
  outputWorkflowRepairResponseSchema,
  outputRequestDeleteResponseSchema,
  outputRequestStartRequestSchema,
  outputWorkflowNodeRegistry,
  outputWorkflowPlanRequestSchema,
  planOutputPrompt,
  planOutputRequestWorkflow,
  planOutputWorkflow,
  resolveCinematicStorySourceScope,
  runOutputWorkflowReadyQueue,
  selectOutputWorkflowRunSubgraph,
  continuityAssetStateSchema,
  continuityVisualDependencyEdgeSchema,
  sequenceAnimaticContinuityAssetBatchSchema,
  sequenceAnimaticContinuityPackV1Schema,
  sequenceAnimaticContinuityAssetWorkflowEnsureRequestSchema,
  sequenceAnimaticContinuityAssetWorkflowEnsureResponseSchema,
  sequenceAnimaticContinuityBlockDeriveRequestSchema,
  sequenceAnimaticContinuityBlockDeriveResponseSchema,
  sequenceAnimaticContinuityStructureDeriveRequestSchema,
  sequenceAnimaticContinuityStructureDeriveResponseSchema,
  sequenceAnimaticContinuityWorkflowEnsureRequestSchema,
  sequenceAnimaticKeyframeWorkflowEnsureResponseSchema,
  sequenceAnimaticShotProductionGraphEnsureResponseSchema,
  sequenceAnimaticShotCoverageIntentEnsureRequestSchema,
  sequenceAnimaticShotCoverageIntentEnsureResponseSchema,
  sequenceAnimaticSceneBoardPrepRequestSchema,
  sequenceAnimaticSceneBoardPrepResponseSchema,
  sequenceAnimaticSceneGraphNodeUpdateRequestSchema,
  sequenceAnimaticSceneGraphOverridesSchema,
  sequenceAnimaticZoneCoverageBoardEnsureRequestSchema,
  sequenceAnimaticZoneCoverageBoardEnsureResponseSchema,
  sequenceAnimaticShotRevisionArtifactV1Schema,
  sequenceAnimaticShotRevisionWorkflowEnsureRequestSchema,
  sequenceAnimaticStateResponseSchema,
  sequenceAnimaticDirectorPlanShotSchema,
  sequenceAnimaticManifestV1Schema,
  sequenceAnimaticGraphRoleSchema,
  sequenceAnimaticModeSchema,
  cinematicAnimaticModeSchema,
  topologicallySortOutputWorkflow,
  validateOutputWorkflowGraph,
  hashOutputWorkflowValue,
  buildWorkflowTemplateGraph,
  childWorkflowUtilityInputSchema,
  childWorkflowUtilityOutputSchema,
  createWorkflowNodeManifest,
  createWorkflowNodeExtensionScaffold,
  createWorkflowNodeManifestRegistry,
  createWorkflowTemplateRegistry,
  getWorkflowNodeManifest,
  normalizeWorkflowTemplateGraphRows,
  outputWorkflowNodeManifestsByPurpose,
  registerWorkflowTemplateManifest,
  validateWorkflowNodeManifestOutput,
  workflowNodeStreamingPolicySchema,
  workflowProjectionMetadataSchema,
  workflowTemplateSourceHash,
} from './outputWorkflow.ts'
import {
  buildSequenceAnimaticContinuityBatchWorkflowGraph,
  buildSequenceAnimaticContinuityAssetWorkflowGraph,
  buildSequenceAnimaticContinuityWorkflowGraph,
  buildSequenceAnimaticShotProductionWorkflowGraph,
  buildSequenceAnimaticShotRevisionWorkflowGraph,
  sequenceAnimaticGraphSpecVersion,
} from '../../supabase/functions/_shared/sequence-animatic-workflow-factory.ts'
import {
  buildSequenceAnimaticShotCoverageIntentWorkflowGraph,
  buildSequenceAnimaticZoneCoverageBoardWorkflowGraph,
  sequenceAnimaticSceneBoardPrepTemplateKey,
  sequenceAnimaticWorkflowTemplateRegistry,
} from '../../supabase/functions/_shared/sequence-animatic-scene-board-workflows.ts'
import {
  buildRecoveredOutputFromArtifact,
  resolveDurableWorkflowNodeOutput,
} from './outputWorkflowDurableResolver.ts'
import {
  getOutputWorkflowNodeContract,
  outputWorkflowRunIntentDefaults,
} from './outputWorkflowNodeContracts.ts'
import {
  buildReferenceManifestEntries,
  formatReferenceManifest,
} from './seedanceReferenceManifest.ts'
import {
  buildSequenceAnimaticLocationEvidenceLines,
  sanitizeSequenceAnimaticSpatialNodeFields,
  sanitizeSequenceAnimaticSpatialPromptText,
  sequenceAnimaticSpatialForbiddenNamesFromShots,
} from './sequenceAnimaticSpatialPrompt.ts'
import {
  OUTPUT_SKILL_REGISTRY,
  buildOutputGuidanceBundle,
  hashOutputGuidanceBundle,
  outputSkillSchema,
  resolveOutputSkillsForNode,
  validateOutputSkillRegistry,
} from './outputSkills.ts'
import { classifyPromptIntentScored, promptIntentCatalogVersion } from './promptIntentClassifier.ts'
import {
  buildOutputWorkflowGraphViewModel,
  buildOutputWorkflowLevelLayout,
  buildOutputWorkflowTargetedRunMetadata,
} from './outputWorkflowGraphView.ts'
import {
  collectActiveOutputRequestIds,
  hasActiveSequenceAnimaticWork,
  isTerminalOutputActivityStatus,
  outputProgressSignature,
} from './outputActivityMonitor.ts'

const now = '2026-05-03T00:00:00.000Z'
const repoRoot = resolve(import.meta.dirname, '../..')
const sharedOutputWorkflowModulePath = ['..', '..', 'supabase', 'functions', '_shared', 'output-workflow.ts'].join('/')

async function importSharedOutputWorkflow<T>(t: TestContext): Promise<T | null> {
  try {
    return await import(sharedOutputWorkflowModulePath) as T
  } catch (error) {
    const message = error instanceof Error
      ? `${error.message} ${String((error as { code?: unknown }).code ?? '')}`
      : String(error)
    if (/npm:|ERR_UNSUPPORTED_ESM_URL_SCHEME|Received protocol 'npm:'/.test(message)) {
      t.skip('Local Node ESM loader cannot import Supabase npm: specifiers; covered by source checks and worker build.')
      return null
    }
    throw error
  }
}

test('sequence animatic scene graph override schemas preserve authoring fields', () => {
  const request = sequenceAnimaticSceneGraphNodeUpdateRequestSchema.parse({
    projectId: 'project_1',
    draftId: 'draft_1',
    masterRequestId: 'request_1',
    nodeId: 'spot_bridge',
    nodeKind: 'spot',
    visualBriefOverride: '  rain-slick bridge landing with lantern spill  ',
    extraPromptDirection: 'Favor a wider usable staging plate.',
  })
  assert.equal(request.visualBriefOverride, 'rain-slick bridge landing with lantern spill')
  assert.equal(request.extraPromptDirection, 'Favor a wider usable staging plate.')

  const overrides = sequenceAnimaticSceneGraphOverridesSchema.parse({
    nodes: {
      spot_bridge: {
        nodeId: 'spot_bridge',
        nodeKind: 'spot',
        visualBriefOverride: request.visualBriefOverride,
        extraPromptDirection: request.extraPromptDirection,
        previousAssetKeys: ['asset_old'],
      },
    },
  })
  assert.equal(overrides.version, 'sequence_animatic_scene_graph_overrides_v1')
  assert.equal(overrides.nodes.spot_bridge?.visualBriefOverride, 'rain-slick bridge landing with lantern spill')
  assert.deepEqual(overrides.nodes.spot_bridge?.previousAssetKeys, ['asset_old'])
})

test('output activity monitor treats compatibility terminal statuses as inactive', () => {
  assert.equal(isTerminalOutputActivityStatus('completed'), true)
  assert.equal(isTerminalOutputActivityStatus('completed_with_errors'), true)
  assert.equal(isTerminalOutputActivityStatus('failed'), true)
  assert.equal(isTerminalOutputActivityStatus('cancelled'), true)
  assert.equal(isTerminalOutputActivityStatus('succeeded'), true)

  const baseRequest = {
    id: 'request-1',
    status: 'running',
    latestRunId: 'run-1',
    updatedAt: now,
    metadata: {},
  }
  const activeSnapshot = {
    outputRequests: [baseRequest],
    outputWorkflowRuns: [{ id: 'run-1', status: 'running' }],
  } as never
  assert.deepEqual(collectActiveOutputRequestIds(activeSnapshot), ['request-1'])
  assert.match(outputProgressSignature(activeSnapshot), /request-1:running/)

  const terminalSnapshot = {
    outputRequests: [baseRequest],
    outputWorkflowRuns: [{ id: 'run-1', status: 'succeeded' }],
  } as never
  assert.deepEqual(collectActiveOutputRequestIds(terminalSnapshot), [])

  const terminalProjectionSnapshot = {
    outputRequests: [{
      ...baseRequest,
      metadata: {
        outputStatusProjection: {
          status: 'completed_with_errors',
          terminal: true,
          updatedAt: now,
        },
      },
    }],
    outputWorkflowRuns: [{ id: 'run-1', status: 'running' }],
  } as never
  assert.deepEqual(collectActiveOutputRequestIds(terminalProjectionSnapshot), [])
})

test('sequence animatic monitor reports active work only while child runs or steps are active', () => {
  const baseState: any = {
    ok: true,
    unchanged: false,
    revision: 'rev-1',
    masterRequest: null,
    requests: [],
    workflows: [],
    runs: [],
    artifacts: [],
    assets: [],
    projections: [],
    events: [],
    scriptShotStatus: 'ready',
    scriptShots: [],
    scriptBlocks: [],
    blocks: [],
    shots: [],
    coverageSetups: [],
    coverageAnchors: [],
    shotContinuityStreamState: null,
  }

  assert.equal(hasActiveSequenceAnimaticWork({
    ...baseState,
    requests: [{ id: 'scene-request', status: 'running', latestRunId: 'run-1', metadata: {}, updatedAt: now }],
    runs: [{ id: 'run-1', status: 'running', steps: [] }],
  }), true)

  assert.equal(hasActiveSequenceAnimaticWork({
    ...baseState,
    requests: [{ id: 'scene-request', status: 'completed', latestRunId: 'run-1', metadata: {}, updatedAt: now }],
    runs: [{ id: 'run-1', status: 'completed', steps: [{ id: 'step-1', status: 'queued' }] }],
  }), true)

  assert.equal(hasActiveSequenceAnimaticWork({
    ...baseState,
    requests: [{ id: 'scene-request', status: 'completed', latestRunId: 'run-1', metadata: {}, updatedAt: now }],
    runs: [{ id: 'run-1', status: 'completed', steps: [{ id: 'step-1', status: 'completed' }] }],
  }), false)
})

test('output refresh source uses demand-driven progress monitor instead of full inbox watchdog', () => {
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')
  assert.match(appSource, /loadOutputProgress/)
  assert.match(appSource, /\[GraphCore\]\[outputs\] inbox loaded\/refreshed/)
  assert.doesNotMatch(appSource, /refreshCompactOutputInbox/)
  assert.doesNotMatch(appSource, /void refreshCompactOutputInbox\('watchdog'\)/)
  assert.doesNotMatch(appSource, /loadOutputInbox\(\{ force: true \}\)\s*\n\s*failureCount = 0/)
})

test('durable workflow output resolver normalizes node, run-step, and artifact outputs', () => {
  const node = {
    id: 'node-storyboard',
    workflowId: 'workflow-1',
    key: 'storyboard_sheet',
    nodeType: 'image_generation',
    label: 'Storyboard Sheet',
    position: { x: 0, y: 0 },
    config: { purpose: 'cinematic_v3_storyboard_sheet' },
    inputs: {},
    outputs: {},
    dirty: true,
    inputHash: '',
    outputHash: '',
    metadata: {},
    createdAt: now,
    updatedAt: now,
  } as const
  const artifact = {
    id: 'artifact-1',
    projectId: 'project-1',
    draftId: 'draft-1',
    workflowId: 'workflow-1',
    runId: 'run-1',
    nodeId: node.id,
    key: 'storyboard-sheet-artifact',
    name: 'Storyboard Sheet',
    kind: 'image',
    assetKey: 'asset-storyboard',
    mimeType: 'image/webp',
    summary: '',
    metadata: {
      nodeKey: 'storyboard_sheet',
      role: 'cinematic_v3_storyboard_sheet',
      usedAsVideoReference: true,
    },
    createdAt: now,
    updatedAt: now,
  } as const
  const fromArtifact = resolveDurableWorkflowNodeOutput({
    node,
    artifacts: [artifact],
    artifactRoles: ['cinematic_v3_storyboard_sheet'],
  })
  assert.equal(fromArtifact.status, 'ready')
  assert.equal(fromArtifact.source, 'artifact')
  assert.equal(fromArtifact.image?.assetKey, 'asset-storyboard')
  assert.equal(buildRecoveredOutputFromArtifact(node, artifact)?.assetKey, 'asset-storyboard')

  const fromNode = resolveDurableWorkflowNodeOutput({
    node: { ...node, outputs: { text: 'cached prompt' } },
    artifacts: [artifact],
  })
  assert.equal(fromNode.source, 'node_outputs')
  assert.equal(fromNode.text, 'cached prompt')

  const fromStep = resolveDurableWorkflowNodeOutput({
    node,
    step: {
      id: 'step-1',
      runId: 'run-1',
      workflowId: 'workflow-1',
      nodeId: node.id,
      nodeKey: 'storyboard_sheet',
      nodeType: 'image_generation',
      status: 'completed',
      orderIndex: 0,
      label: 'Storyboard Sheet',
      inputHash: '',
      outputHash: 'hash',
      outputs: { image: { assetKey: 'asset-step' } },
      provider: null,
      model: null,
      providerRequestId: null,
      errorMessage: null,
      metadata: {},
      startedAt: null,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  })
  assert.equal(fromStep.source, 'run_step_outputs')
  assert.equal(fromStep.image?.assetKey, 'asset-step')
})

test('workflow node contracts and run intents expose cinematic sequence defaults', () => {
  const sheetContract = getOutputWorkflowNodeContract({ purpose: 'cinematic_v3_storyboard_sheet' })
  assert.equal(sheetContract?.recoveryStrategy, 'node_step_artifact')
  assert.deepEqual(sheetContract?.artifactRoles, ['cinematic_v3_storyboard_sheet', 'cinematic_v2_storyboard_sheet'])
  assert.equal(outputWorkflowRunIntentDefaults('generate_block_video')?.runScope, 'node_only')
  assert.equal(outputWorkflowRunIntentDefaults('generate_block_video')?.cinematicVideoApproved, true)
  assert.equal(outputWorkflowRunIntentDefaults('prepare_storyboard_block')?.debugSkipVideoGeneration, true)
  assert.equal(getOutputWorkflowNodeContract({ purpose: 'sequence_animatic_manifest_artifact' })?.recoveryStrategy, 'node_step_artifact')
  assert.equal(sequenceAnimaticModeSchema.parse('full_sequence_unit'), 'master_script_only')
  assert.equal(sequenceAnimaticModeSchema.parse(null), undefined)
  assert.equal(cinematicAnimaticModeSchema.parse(null), undefined)
  const startRunSource = readFileSync(resolve(repoRoot, 'supabase/functions/start-output-workflow-run/index.ts'), 'utf8')
  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  assert.match(startRunSource, /outputWorkflowRunIntentDefaults/)
  assert.match(startRunSource, /notifyWorkerWakeBestEffort/)
  assert.match(startRunSource, /family:\s*'output_workflow'/)
  assert.match(workerSource, /outputWorkflowRunIntentDefaults/)
  assert.match(workerSource, /recoveredForTargetedExecution/)
  assert.match(workerSource, /notifyWorkerWakeBestEffort/)
  assert.match(workerSource, /source:\s*'sequence-animatic-orchestrator'/)
})

test('workflow contract validation reports missing required sequence animatic ports', () => {
  const validation = validateOutputWorkflowGraph({
    nodes: [
      { key: 'manifest', nodeType: 'utility_transform', config: { purpose: 'sequence_animatic_manifest' } },
      { key: 'artifact', nodeType: 'output_artifact', config: { purpose: 'sequence_animatic_manifest_artifact' } },
    ],
    edges: [
      { sourceNodeKey: 'manifest', sourcePort: 'text', targetNodeKey: 'artifact', targetPort: 'input' },
    ],
  })
  assert.equal(validation.ok, false)
  assert.match(validation.diagnostics.join('\n'), /manifest: missing required "director_plan" input/)
})

test('workflow node manifests back contracts and reject duplicate purpose registration', () => {
  const manifest = getWorkflowNodeManifest({ purpose: 'cinematic_v3_storyboard_sheet' })
  assert.equal(manifest?.purpose, 'cinematic_v3_storyboard_sheet')
  assert.equal(manifest?.recoveryStrategy, 'node_step_artifact')
  assert.equal(outputWorkflowNodeManifestsByPurpose.get('sequence_animatic_manifest_artifact')?.progressLabel, 'Registering animatic manifest')
  const duplicate = createWorkflowNodeManifest({
    purpose: 'duplicate_manifest_test',
    label: 'Duplicate',
    requiredInputs: [],
    producedOutputs: ['output'],
    artifactRoles: [],
    previewRoles: [],
    recoveryStrategy: 'none',
    progressLabel: 'Testing duplicate manifest',
    providerBacked: false,
    manualOnly: false,
  })
  assert.throws(
    () => createWorkflowNodeManifestRegistry([duplicate, duplicate]),
    /Duplicate workflow node manifest purpose/,
  )
})

test('workflow node manifests expose streaming policy and reusable extension scaffolds', () => {
  const sceneShotPlan = getWorkflowNodeManifest({ purpose: 'sequence_animatic_scene_shot_plan' })
  assert.equal(sceneShotPlan?.streamingPolicy.mode, 'jsonl')
  assert.deepEqual(sceneShotPlan?.streamingPolicy.partialArtifactRoles, ['sequence_animatic_scene_plan'])
  assert.equal(sceneShotPlan?.streamingPolicy.progressLabels.streaming, 'Streaming scene shot plan')

  const parsedStreamingPolicy = workflowNodeStreamingPolicySchema.parse({
    mode: 'jsonl',
    partialArtifactRoles: ['partial_board'],
    progressLabels: { streaming: 'Streaming partial board' },
  })
  assert.equal(parsedStreamingPolicy.resumeTokenRequired, false)

  const scaffold = createWorkflowNodeExtensionScaffold({
    purpose: 'test_modular_node',
    label: 'Test Modular Node',
    requiredInputs: ['input'],
    producedOutputs: ['output'],
    artifactRoles: ['test_artifact'],
    previewRoles: ['output'],
    recoveryStrategy: 'node_step_artifact',
    progressLabel: 'Testing modular node',
    providerBacked: false,
    manualOnly: false,
    config: { version: 1 },
  })
  assert.equal(scaffold.manifest.purpose, 'test_modular_node')
  assert.equal(scaffold.handlerKey, 'test_modular_node')
  assert.equal(scaffold.templateKey, 'test_modular_node_workflow')
  assert.deepEqual(scaffold.templateNodeConfig, { version: 1, purpose: 'test_modular_node' })
  assert.ok(scaffold.requiredTests.includes('handler:test_modular_node:output_schema'))
  assert.match(scaffold.checklist.join('\n'), /server-owned template registry/)
})

test('workflow node manifest output validation is reusable outside the worker', () => {
  const manifest = createWorkflowNodeManifest({
    purpose: 'strict_output_test',
    label: 'Strict Output Test',
    requiredInputs: [],
    producedOutputs: ['ok'],
    artifactRoles: [],
    previewRoles: ['ok'],
    recoveryStrategy: 'node_step',
    progressLabel: 'Testing strict output',
    providerBacked: false,
    manualOnly: false,
    outputSchema: z.object({ ok: z.literal(true) }).strict(),
  })
  assert.deepEqual(validateWorkflowNodeManifestOutput(manifest, { ok: true }), {
    ok: true,
    outputs: { ok: true },
    diagnostics: [],
  })
  const invalid = validateWorkflowNodeManifestOutput(manifest, { ok: false })
  assert.equal(invalid.ok, false)
  assert.match(invalid.diagnostics.join('\n'), /Invalid input/)
})

test('workflow graph validation rejects unknown manifest purposes', () => {
  const validation = validateOutputWorkflowGraph({
    nodes: [
      { key: 'input', nodeType: 'utility_transform', config: {} },
      { key: 'mystery', nodeType: 'utility_transform', config: { purpose: 'unregistered_runtime_node' } },
    ],
    edges: [
      { sourceNodeKey: 'input', sourcePort: 'output', targetNodeKey: 'mystery', targetPort: 'input' },
    ],
  })
  assert.equal(validation.ok, false)
  assert.match(validation.diagnostics.join('\n'), /unknown workflow node purpose "unregistered_runtime_node"/)
})

test('workflow template registry validates scene board prep graph and source hash stability', () => {
  const rawInput = {
    workflowId: 'workflow-scene-board',
    draftId: 'draft-1',
    commonConfig: {
      masterRequestId: 'master-1',
      sceneId: 'scene_001',
      sceneBoardPrepIdentity: 'identity-1',
    },
    command: {
      action: 'prepare_selected_board',
      sceneId: 'scene_001',
      zoneId: 'zone_a',
      shotIds: ['shot_002', 'shot_001'],
      forceRefresh: false,
    },
  }
  const result = buildWorkflowTemplateGraph({
    registry: sequenceAnimaticWorkflowTemplateRegistry,
    templateKey: sequenceAnimaticSceneBoardPrepTemplateKey,
    rawInput,
    validateGraph: (graph) => validateOutputWorkflowGraph(normalizeWorkflowTemplateGraphRows(graph) as any),
  })
  assert.equal(result.ok, true, result.diagnostics.join('\n'))
  assert.deepEqual(result.graph?.nodes.map((node) => node.key), [
    'scope_input',
    'required_ref_plan',
    'fanout_set_refs',
    'collect_set_refs',
    'fanout_scaffold_refs',
    'collect_scaffold_refs',
    'coverage_intent_batch',
    'fanout_coverage_intents',
    'collect_coverage_intents',
    'zone_coverage_grid',
    'fanout_zone_coverage_grids',
    'collect_zone_coverage_grids',
    'register_projection',
    'coverage_cell_artifact',
  ])
  const purposeByKey = new Map(result.graph?.nodes.map((node) => [node.key, String((node.config as Record<string, unknown>).purpose)]))
  assert.equal(purposeByKey.get('fanout_set_refs'), 'workflow_fanout_children')
  assert.equal(purposeByKey.get('collect_set_refs'), 'workflow_collect_child_artifacts')
  assert.equal(purposeByKey.get('coverage_intent_batch'), 'sequence_animatic_scene_board_coverage_intent_batch')
  assert.equal(purposeByKey.get('fanout_coverage_intents'), 'workflow_fanout_children')
  assert.equal(purposeByKey.get('zone_coverage_grid'), 'sequence_animatic_scene_board_zone_coverage_grid')
  assert.equal(purposeByKey.get('collect_zone_coverage_grids'), 'workflow_collect_child_artifacts')
  assert.equal(purposeByKey.get('register_projection'), 'workflow_register_artifact_projection')
  assert.doesNotMatch(JSON.stringify(result.graph), /workflow_ensure_child_workflow/)
  assert.match(JSON.stringify(result.graph?.edges), /projection__artifact/)
  assert.match(JSON.stringify(result.graph?.edges), /coverage_intent_batch__fanout_coverage_intents/)
  assert.match(JSON.stringify(result.graph?.edges), /zone_coverage_grid__fanout_zone_coverage_grids/)
  const sameHash = workflowTemplateSourceHash({
    command: rawInput.command,
    commonConfig: rawInput.commonConfig,
    draftId: rawInput.draftId,
    policyVersion: 'scene_board_prep_graph_v1',
  })
  const changedHash = workflowTemplateSourceHash({
    command: { ...rawInput.command, forceRefresh: true },
    commonConfig: rawInput.commonConfig,
    draftId: rawInput.draftId,
    policyVersion: 'scene_board_prep_graph_v1',
  })
  assert.equal(result.sourceHash, sameHash)
  assert.notEqual(result.sourceHash, changedHash)
})

test('scene board graph-native planner nodes use shared child spec planners', () => {
  const packSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-scene-board-pack.ts'), 'utf8')
  const plannerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/sequence-animatic-scene-board-child-planners.ts'), 'utf8')
  const utilitySource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-utility-pack.ts'), 'utf8')

  assert.match(packSource, /planSceneBoardCoverageIntentChildren/)
  assert.match(packSource, /planSceneBoardZoneCoverageGridChildren/)
  assert.match(packSource, /childWorkflows/)
  assert.match(plannerSource, /buildSequenceAnimaticShotCoverageIntentWorkflowGraph/)
  assert.match(plannerSource, /buildSequenceAnimaticZoneCoverageBoardWorkflowGraph/)
  assert.match(plannerSource, /coverageIntentBatchId/)
  assert.match(plannerSource, /boardId/)
  assert.doesNotMatch(plannerSource, /from '.\/output-workflow\.ts'/)
  assert.match(utilitySource, /entry\.childWorkflows/)
  assert.match(utilitySource, /ensureChildWorkflow/)
})

test('workflow template registry rejects duplicate templates and child utility schemas are strict', () => {
  const registry = createWorkflowTemplateRegistry()
  const template = {
    key: 'test_template',
    label: 'Test Template',
    inputSchema: z.object({ id: z.string() }),
    policyVersion: 'test_v1',
    buildGraph: (input: { id: string }) => ({ nodes: [{ key: input.id, config: {} }], edges: [] }),
    sourceHash: (input: { id: string }) => workflowTemplateSourceHash(input),
  }
  registerWorkflowTemplateManifest(registry, template)
  assert.throws(() => registerWorkflowTemplateManifest(registry, template), /already registered/)
  assert.equal(childWorkflowUtilityInputSchema.parse({
    parentRunId: 'run',
    parentWorkflowId: 'workflow',
    parentNodeKey: 'node',
    childTemplateKey: 'template',
    identityHash: 'hash',
  }).forceRefresh, false)
  assert.equal(childWorkflowUtilityOutputSchema.parse({
    childRequestId: 'request',
    childWorkflowId: 'workflow',
  }).status, 'waiting')
  assert.equal(workflowProjectionMetadataSchema.parse({ activeManifestPurpose: 'purpose' }).activeProgressLabel, '')
})

test('output worker routes execution through manifest dispatch', () => {
  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  assert.match(workerSource, /export async function executeWorkflowNodeByManifest/)
  assert.match(workerSource, /validateWorkflowNodeManifestOutput/)
  assert.match(workerSource, /const result = await executeWorkflowNodeByManifest/)
  assert.match(workerSource, /registerSceneBoardWorkflowNodePack/)
  assert.match(workerSource, /registerWorkflowUtilityNodePack/)
  assert.doesNotMatch(workerSource, /sequence-animatic-scene-board-set-ref-generation-v1/)
  assert.doesNotMatch(workerSource, /sequence-animatic-scene-board-zone-coverage-grid-v1/)
})

test('shared Seedance reference manifest formats exact provider order', () => {
  const manifest = buildReferenceManifestEntries({
    imageReferences: [
      { label: 'Storyboard sheet', role: 'storyboard_sheet' },
      { label: 'Tansy Mott', role: 'entity_reference' },
    ],
    videoReferences: [{ label: 'prior take', role: 'video_reference' }],
  })
  assert.deepEqual(manifest.map((entry) => entry.tag), ['@Image1', '@Image2', '@Video1'])
  assert.match(formatReferenceManifest(manifest), /@Image1: Storyboard sheet; primary sequential storyboard keyframe reference\./)
  assert.match(formatReferenceManifest(manifest), /@Video1: prior take; motion continuity reference\./)
})

function worldEntity(key: string, nodeType: string, name: string, customProperties: Record<string, unknown> = {}) {
  return {
    id: `id-${key}`,
    key,
    name,
    summary: `${name} summary`,
    context: `${name} context`,
    nodeType,
    aliases: [],
    tags: [],
    status: 'active',
    thumbnailAssetKey: null,
    linkedDefinitionKey: null,
    source: 'ai',
    customProperties,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  }
}

function readConfigPurpose(node: { config?: unknown }) {
  const config = node.config && typeof node.config === 'object' && !Array.isArray(node.config)
    ? node.config as Record<string, unknown>
    : {}
  return typeof config.purpose === 'string' ? config.purpose : ''
}

function readConfigQuality(node: { config?: unknown }) {
  const config = node.config && typeof node.config === 'object' && !Array.isArray(node.config)
    ? node.config as Record<string, unknown>
    : {}
  return typeof config.quality === 'string' ? config.quality : ''
}

function readConfigOutputFormat(node: { config?: unknown }) {
  const config = node.config && typeof node.config === 'object' && !Array.isArray(node.config)
    ? node.config as Record<string, unknown>
    : {}
  return typeof config.outputFormat === 'string' ? config.outputFormat : ''
}

test('output request delete response preserves compatibility while exposing cleanup counts', () => {
  const parsed = outputRequestDeleteResponseSchema.parse({
    ok: true,
    requestId: 'request-1',
    projectId: 'project-1',
    draftId: 'draft-1',
  })

  assert.equal(parsed.deleted, true)
  assert.equal(parsed.workflowId, null)
  assert.equal(parsed.latestRunId, null)
  assert.equal(parsed.deletedCounts.outputRequests, 0)
  assert.equal(parsed.deletedCounts.outputArtifacts, 0)
  assert.equal(parsed.deletedCounts.storageObjects, 0)

  const withCounts = outputRequestDeleteResponseSchema.parse({
    ok: true,
    requestId: 'request-1',
    projectId: 'project-1',
    draftId: 'draft-1',
    workflowId: 'workflow-1',
    latestRunId: 'run-1',
    deleted: true,
    deletedCounts: {
      outputRequests: 1,
      outputWorkflows: 1,
      outputWorkflowRuns: 2,
      outputWorkflowRunSteps: 4,
      outputWorkflowNodes: 3,
      outputWorkflowEdges: 2,
      outputArtifacts: 2,
      projectAssets: 2,
      storageObjects: 2,
    },
  })

  assert.equal(withCounts.deletedCounts.outputRequests, 1)
  assert.equal(withCounts.deletedCounts.outputWorkflowRuns, 2)
  assert.equal(withCounts.deletedCounts.projectAssets, 2)
})

test('output workflow graph loader schemas support compact graph refresh and selected-node hydration', () => {
  const request = outputWorkflowGraphRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    workflowId: 'workflow-1',
    runId: null,
    selectedNodeKey: 'screenplay_author',
    includeSelectedNodeOutput: true,
    knownGraphRevision: 'graph-rev',
  })
  assert.equal(request.includeSelectedNodeOutput, true)
  assert.equal(request.selectedNodeKey, 'screenplay_author')
  assert.equal(request.knownGraphRevision, 'graph-rev')

  const response = outputWorkflowGraphResponseSchema.parse({
    ok: true,
    workflow: null,
    nodes: [],
    edges: [],
    run: null,
    artifacts: [],
    assets: [],
    graphRevision: hashOutputWorkflowValue({ workflow: 'workflow-1', updatedAt: now }),
    selectedNodeOutput: {
      nodeKey: 'screenplay_author',
      outputs: { screenplayMarkdown: 'INT. SERVICE TUNNEL - NIGHT' },
      truncated: false,
    },
  })
  assert.equal(response.selectedNodeOutput?.outputs.screenplayMarkdown, 'INT. SERVICE TUNNEL - NIGHT')

  const unchanged = outputWorkflowGraphResponseSchema.parse({
    ok: true,
    unchanged: true,
    graphRevision: 'graph-rev',
  })
  assert.equal(unchanged.unchanged, true)
  assert.equal(unchanged.nodes.length, 0)

  const graphFunctionSource = readFileSync(resolve(repoRoot, 'supabase/functions/get-output-workflow-graph/index.ts'), 'utf8')
  assert.match(graphFunctionSource, /outputWorkflowRunStepSelect/)
  assert.match(graphFunctionSource, /Object\.keys\(outputs\)\.length === 0 && runRow/)
  assert.match(graphFunctionSource, /eq\('node_key', selectedNodeKey\)/)
})

test('output feed schemas support projection-backed inbox loading without run-step payloads', () => {
  const projection = outputRequestStatusProjectionSchema.parse({
    requestId: 'request-1',
    projectId: 'project-1',
    draftId: 'draft-1',
    workflowId: 'workflow-1',
    latestRunId: 'run-1',
    status: 'running',
    outputKind: 'cinematic_episode',
    title: 'Opening cinematic',
    progress: {
      totalSteps: 12,
      steps: { queued: 4, running: 1, completed: 7 },
    },
    activeNodeKey: 'cinematic_v2_storyboard_group_001_sheet',
    activeNodeLabel: 'Storyboard Sheet 1',
    latestError: null,
    artifactKeys: ['artifact-1'],
    previewAssetKeys: ['asset-1'],
    graphRevision: 'graph-rev',
    timelineRevision: 'timeline-rev',
    terminal: false,
    metadata: { projectionVersion: 1 },
    createdAt: now,
    updatedAt: now,
  })

  assert.equal(projection.progress.totalSteps, 12)
  assert.equal(projection.previewAssetKeys[0], 'asset-1')

  const feed = outputFeedResponseSchema.parse({
    ok: true,
    requests: [],
    workflows: [],
    runs: [],
    artifacts: [],
    assets: [],
    projections: [projection],
    page: {
      limit: 30,
      hasMore: false,
      nextCursor: null,
    },
  })

  assert.equal(feed.projections.length, 1)
  assert.equal(feed.page.hasMore, false)
  assert.equal(feed.unchanged, false)

  const unchangedFeed = outputFeedResponseSchema.parse({
    ok: true,
    unchanged: true,
    feedRevision: 'feed-rev',
    page: {
      limit: 30,
      hasMore: false,
      nextCursor: null,
    },
  })
  assert.equal(unchangedFeed.feedRevision, 'feed-rev')
  assert.equal(unchangedFeed.requests.length, 0)

  const source = readFileSync(resolve(repoRoot, 'supabase/functions/get-output-feed/index.ts'), 'utf8')
  assert.match(source, /output_request_status_projections/)
  assert.match(source, /knownFeedRevision/)
  assert.doesNotMatch(source, /output_workflow_run_steps/)

  const repositorySource = readFileSync(resolve(repoRoot, 'src/data/graphcoreRepository.ts'), 'utf8')
  const loadOutputInboxSource = repositorySource.slice(
    repositorySource.indexOf('export async function loadOutputInbox'),
    repositorySource.indexOf('export async function loadOutputWorkflowGraph'),
  )
  assert.match(loadOutputInboxSource, /get-output-feed/)
  assert.doesNotMatch(loadOutputInboxSource, /output_workflow_run_steps/)
})

test('Fal image webhooks are recorded as metadata while workers keep finalization authority', () => {
  const outputWorkerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const webhookSource = readFileSync(resolve(repoRoot, 'supabase/functions/fal-webhook/index.ts'), 'utf8')
  const migrationSource = readFileSync(resolve(repoRoot, 'supabase/migrations/20260515165615_fal_webhook_result_cache_indexes.sql'), 'utf8')

  assert.match(outputWorkerSource, /buildFalWebhookUrl/)
  assert.match(outputWorkerSource, /webhook_url/)
  assert.match(outputWorkerSource, /getWebhookResult/)
  assert.match(outputWorkerSource, /falWebhookImageUrl/)
  assert.match(outputWorkerSource, /OUTPUT_WORKFLOW_FAL_WEBHOOK_POLL_INTERVAL_MS/)
  assert.match(webhookSource, /FAL_WEBHOOK_REQUIRE_SIGNATURE/)
  assert.match(webhookSource, /visual_generation_jobs/)
  assert.match(webhookSource, /output_workflow_run_steps/)
  assert.match(webhookSource, /falWebhookImageUrl/)
  assert.match(webhookSource, /webhookMatchedTable/)
  assert.doesNotMatch(webhookSource, /complete_visual_generation_job/)
  assert.match(migrationSource, /output_workflow_run_steps_provider_request_id_idx/)
  assert.match(migrationSource, /output_workflow_run_steps_fal_request_id_metadata_idx/)
  assert.match(migrationSource, /visual_generation_jobs_fal_request_id_metadata_idx/)
})

test('output request status projection tolerates queued runs without active steps', () => {
  const migrationSource = readFileSync(resolve(repoRoot, 'supabase/migrations/20260514133431_fix_output_projection_unassigned_step_records.sql'), 'utf8')
  const activeStepMigrationSource = readFileSync(resolve(repoRoot, 'supabase/migrations/20260514155916_improve_output_projection_active_step_selection.sql'), 'utf8')
  const parallelStepsMigrationSource = readFileSync(resolve(repoRoot, 'supabase/migrations/20260515112500_expose_parallel_output_projection_steps.sql'), 'utf8')

  assert.match(migrationSource, /active_node_key text/)
  assert.match(migrationSource, /active_node_label text/)
  assert.match(migrationSource, /latest_step_error text/)
  assert.doesNotMatch(migrationSource, /running_step\.node_key/)
  assert.doesNotMatch(migrationSource, /failed_step\.error_message/)
  assert.match(activeStepMigrationSource, /status in \('running', 'failed', 'queued'\)/)
  assert.match(activeStepMigrationSource, /when 'running' then 0/)
  assert.match(activeStepMigrationSource, /when 'failed' then 1/)
  assert.match(activeStepMigrationSource, /when 'queued' then 2/)
  assert.match(activeStepMigrationSource, /'projectionVersion', 3/)
  assert.match(parallelStepsMigrationSource, /active_nodes jsonb := '\[\]'::jsonb/)
  assert.match(parallelStepsMigrationSource, /'activeNodes', coalesce\(active_nodes/)
  assert.match(parallelStepsMigrationSource, /'providerStatus', metadata ->> 'providerStatus'/)
  assert.match(parallelStepsMigrationSource, /'providerElapsedMs', metadata -> 'providerElapsedMs'/)
  assert.match(parallelStepsMigrationSource, /'falRequestId', metadata ->> 'falRequestId'/)
})

test('output workflow status endpoint uses run-only loader instead of graph bundle', () => {
  const statusFunctionSource = readFileSync(resolve(repoRoot, 'supabase/functions/get-output-workflow-status/index.ts'), 'utf8')
  assert.match(statusFunctionSource, /loadOutputWorkflowRunStatus/)
  assert.doesNotMatch(statusFunctionSource, /loadOutputWorkflowRunBundle/)

  const sharedSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  assert.match(sharedSource, /export async function loadOutputWorkflowRunStatus/)
  assert.match(sharedSource, /outputWorkflowRunStepStatusSelect/)
  assert.doesNotMatch(
    sharedSource.slice(
      sharedSource.indexOf('export async function loadOutputWorkflowRunStatus'),
      sharedSource.indexOf('async function heartbeat'),
    ),
    /output_workflow_nodes|output_workflow_edges/,
  )
})

test('output workflow repair schemas support preview and apply without broad cleanup', () => {
  const preview = outputWorkflowRepairRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    requestId: 'request-1',
  })
  assert.equal(preview.mode, 'preview')
  assert.equal(preview.cancelStaleRuns, false)

  const apply = outputWorkflowRepairRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    workflowId: 'workflow-1',
    mode: 'apply',
    cancelStaleRuns: true,
  })
  assert.equal(apply.mode, 'apply')
  assert.equal(apply.cancelStaleRuns, true)

  assert.throws(() => outputWorkflowRepairRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
  }))

  const response = outputWorkflowRepairResponseSchema.parse({
    ok: true,
    mode: 'preview',
    applied: false,
    projectId: 'project-1',
    draftId: 'draft-1',
    requestId: 'request-1',
    workflowId: 'workflow-1',
    findings: {
      stuckCleanupRequestIds: ['request-1'],
      staleRunIds: [],
      orphanWorkflowIds: [],
      activeRunIds: [],
      cleanupCounts: {
        outputRequests: 1,
        outputWorkflows: 1,
        outputWorkflowRuns: 0,
        outputWorkflowRunSteps: 0,
        outputWorkflowNodes: 2,
        outputWorkflowEdges: 1,
        outputArtifacts: 0,
        projectAssets: 0,
        storageObjects: 0,
      },
      diagnostics: ['request is deleting'],
    },
  })
  assert.equal(response.findings.stuckCleanupRequestIds[0], 'request-1')
})

test('output repair function previews by default and reuses shared cleanup helper', () => {
  const repairFunctionSource = readFileSync(resolve(repoRoot, 'supabase/functions/repair-output-workflow-state/index.ts'), 'utf8')
  assert.match(repairFunctionSource, /maybeHandleOptions/)
  assert.match(repairFunctionSource, /outputWorkflowRepairRequestSchema/)
  assert.match(repairFunctionSource, /dryRun: true/)
  assert.match(repairFunctionSource, /cleanupOutputRequests/)
  assert.match(repairFunctionSource, /mode === 'apply'/)

  const cleanupSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-cleanup.ts'), 'utf8')
  assert.match(cleanupSource, /workflowIds\?: string\[\]/)
  assert.match(cleanupSource, /dryRun\?: boolean/)
  assert.match(cleanupSource, /if \(input\.dryRun\)/)
})

test('worker database circuit breaker pauses all worker loops on Supabase health errors', () => {
  const workerSource = readFileSync(resolve(repoRoot, 'workers/world-generation/main.ts'), 'utf8')
  assert.match(workerSource, /dbCircuitBackoffMs/)
  assert.match(workerSource, /isTransientDatabaseError/)
  assert.match(workerSource, /pgrst002/)
  assert.match(workerSource, /schema cache/)
  assert.match(workerSource, /waitForDatabaseCircuit\('visual'\)/)
  assert.match(workerSource, /waitForDatabaseCircuit\('generation'\)/)
  assert.match(workerSource, /waitForDatabaseCircuit\('app_generation'\)/)
  assert.match(workerSource, /waitForDatabaseCircuit\('output_workflow'\)/)
  assert.match(workerSource, /Supabase database circuit opened/)
})

test('frontend skips live draft metadata reloads for demo draft ids and backs off output inbox health failures', () => {
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')
  assert.match(appSource, /LIVE_SUPABASE_ID_PATTERN/)
  assert.match(appSource, /!isLiveSupabaseId\(draftId\)/)
  assert.match(appSource, /current\?\.draft\.id === draftId/)
  assert.match(appSource, /backendHealthBackoffRef/)
  assert.match(appSource, /draftMetadataLoadInFlightRef/)
  assert.match(appSource, /draft_metadata:\$\{draftId\}/)
  assert.match(appSource, /direct draft metadata reload skipped while backend health backoff is active/)
  assert.match(appSource, /noteBackendHydrationFailure/)
  assert.match(appSource, /output inbox refresh skipped while backend health backoff is active/)
})

test('frontend keeps active output progress live without opening the graph', () => {
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')
  assert.match(appSource, /collectActiveOutputRequestIds/)
  assert.match(appSource, /activeOutputRequestSignature/)
  assert.match(appSource, /subscribeOutputSignals/)
  assert.match(appSource, /refreshOutputProgress\('watchdog'\)/)
  assert.match(appSource, /workspaceService\.loadOutputProgress/)
  const progressWatcherStart = appSource.indexOf('const activeOutputRequestSignature')
  const graphLoaderStart = appSource.indexOf('async function loadOutputWorkflowGraph')
  assert.notEqual(progressWatcherStart, -1)
  assert.notEqual(graphLoaderStart, -1)
  const progressWatcherBlock = appSource.slice(progressWatcherStart, graphLoaderStart)
  assert.doesNotMatch(progressWatcherBlock, /loadOutputWorkflowGraph\(/)
  assert.doesNotMatch(progressWatcherBlock, /loadOutputInbox\(\{ force: true \}\)\s*\n\s*failureCount = 0/)
})

test('timeline shot quality keyframe materialization can regenerate missing upstream planning nodes', () => {
  const outputsWorkspaceSource = readFileSync(resolve(repoRoot, 'src/features/outputs/OutputsWorkspace.tsx'), 'utf8')
  const materializeStart = outputsWorkspaceSource.indexOf("runMode: 'cinematic_v2_materialize_shot_quality_keyframe'")
  assert.notEqual(materializeStart, -1)
  const materializeBlock = outputsWorkspaceSource.slice(materializeStart, outputsWorkspaceSource.indexOf('cinematicV2QualityShotIds,', materializeStart))
  assert.match(materializeBlock, /runScope: 'upstream_to_node'/)
  assert.doesNotMatch(materializeBlock, /runScope: 'node_only'/)
  assert.match(materializeBlock, /forceNodeKeys: \[fanoutNodeKey\]/)
  assert.match(materializeBlock, /materializationMode: 'selected_shots'/)

  const keyframeStart = outputsWorkspaceSource.indexOf("runMode: 'cinematic_v2_shot_quality_keyframe'")
  assert.notEqual(keyframeStart, -1)
  const keyframeBlock = outputsWorkspaceSource.slice(keyframeStart, outputsWorkspaceSource.indexOf('cinematicV2QualityShotIds,', keyframeStart))
  assert.match(keyframeBlock, /runScope: 'node_only'/)
  assert.ok(keyframeBlock.includes('targetNodeKeys: [`${shotKeyPrefix}_keyframe_prompt`, ...targetNodeKeys]'))
  assert.match(keyframeBlock, /allowStaleUpstreamOutputs: true/)
  const keyframeRunStart = outputsWorkspaceSource.lastIndexOf('const keyframeRun = await', keyframeStart)
  assert.notEqual(keyframeRunStart, -1)
  const keyframeRunBlock = outputsWorkspaceSource.slice(keyframeRunStart, outputsWorkspaceSource.indexOf('const completedStatus = await pollRun', keyframeStart))
  assert.match(keyframeRunBlock, /sourceRunId: sourceRun\?\.id \?\? null/)
  assert.match(keyframeRunBlock, /materializedRunId: materializeRun\.run\.id/)

  const qualityIdsStart = outputsWorkspaceSource.indexOf('function cinematicV2QualityShotIdsForWorkflow')
  assert.notEqual(qualityIdsStart, -1)
  const qualityIdsBlock = outputsWorkspaceSource.slice(qualityIdsStart, outputsWorkspaceSource.indexOf('function cinematicV2ShotKeyPrefix', qualityIdsStart))
  assert.match(qualityIdsBlock, /return \[nextShotId\]/)
  assert.doesNotMatch(qualityIdsBlock, /snapshot\.outputWorkflowNodes|cinematicV2QualityShotIds\)/)
})

const snapshot = outputWorkflowPlanRequestSchema.shape.snapshot.parse({
  project: { id: 'project-1', name: 'Ash Archive', summary: 'A manuscript world.' },
  draft: { id: 'draft-1', name: 'Draft', metadata: {} },
  projectContext: {
    projectType: 'story',
    projectSubtype: 'fiction_novel',
    brainProfile: 'story',
    artStylePreset: 'live_action_cinematic',
    artStyleDescription: '',
    onboardingCompletedAt: now,
    onboardingVersion: 'test',
    source: 'onboarding',
  },
  worldEntities: [
    worldEntity('chapter-1', 'sequence_unit', 'Opening Ash', {
      sequence: {
        ordinal: 1,
        povCharacterKey: 'hero',
        povCharacterName: 'Mara',
        povNotes: 'Close third limited to Mara under pressure.',
        synopsis: 'The archive wakes.',
        outcome: 'The protagonist accepts the call.',
        consequences: [
          {
            affectedEntityKeys: ['hero', 'archive'],
            cause: 'Mara enters the archive.',
            effect: 'The route opens.',
          },
        ],
      },
    }),
    worldEntity('chapter-2', 'sequence_unit', 'Broken Index', {
      sequence: { ordinal: 2, synopsis: 'The first truth breaks.', outcome: 'The route narrows.' },
    }),
    worldEntity('hero', 'actor', 'Mara'),
    worldEntity('archive', 'place', 'The Archive'),
  ],
  worldRelationships: [],
  worldThreads: [],
  worldWiki: {
    title: 'Ash Archive',
    logline: 'A lost archivist follows a living index through a city that edits memory.',
    synopsis: 'A fiction manuscript with a clean chapter spine.',
    narrationPov: 'close third person limited',
    toneTags: ['literary', 'mysterious'],
    genre: 'fantasy mystery',
  },
})

test('node registry exposes approved workflow node types only', () => {
  assert.deepEqual(Object.keys(outputWorkflowNodeRegistry), [
    'world_context_query',
    'skill_context_query',
    'text_llm',
    'image_generation',
    'video_generation',
    'document_render',
    'utility_transform',
    'output_artifact',
  ])
})

test('output artifacts support HTML companion pages', () => {
  assert.equal(outputWorkflowArtifactKindSchema.parse('html'), 'html')
})

test('cinematic storyboard style override accepts blank as default', () => {
  const parsedStart = outputRequestStartRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic in the cafe',
    outputKindOverride: 'cinematic_episode',
    selectedSequenceUnitKeys: ['chapter_01'],
    cinematicStoryboardStyleOverride: '   ',
    snapshot,
  })
  assert.equal(parsedStart.cinematicStoryboardStyleOverride, undefined)
  assert.equal(parsedStart.outputKindOverride, 'cinematic_episode')
  assert.deepEqual(parsedStart.selectedSequenceUnitKeys, ['chapter_01'])

  const parsedPlan = outputWorkflowPlanRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic in the cafe',
    cinematicStoryboardStyleOverride: '',
    snapshot,
  })
  assert.equal(parsedPlan.cinematicStoryboardStyleOverride, undefined)
})

test('output skill registry is valid, versioned, and rejects duplicate keys', () => {
  assert.equal(validateOutputSkillRegistry().ok, true)
  assert.ok(OUTPUT_SKILL_REGISTRY.length >= 16)
  assert.match(outputSkillSchema.parse(OUTPUT_SKILL_REGISTRY[0]).version, /^\d+\.\d+\.\d+$/)
  assert.equal(validateOutputSkillRegistry([OUTPUT_SKILL_REGISTRY[0], OUTPUT_SKILL_REGISTRY[0]]).ok, false)
})

test('output skill resolution supports explicit keys, auto tags, world metadata, and stable hashes', () => {
  const resolved = resolveOutputSkillsForNode({
    nodeType: 'text_llm',
    purpose: 'chapter_prose',
    explicitSkillKeys: ['fiction_prose_voice'],
    autoSkillTags: ['anti_ai_tells'],
    worldWiki: snapshot.worldWiki,
  })
  const bundle = buildOutputGuidanceBundle({
    skills: resolved.skills,
    contextualGuidance: resolved.contextualGuidance,
  })
  const repeatHash = hashOutputGuidanceBundle({ ...bundle, guidanceHash: 'changed' })

  assert.deepEqual(resolved.diagnostics, [])
  assert.ok(bundle.skillKeys.includes('fiction_prose_voice'))
  assert.ok(bundle.skillKeys.includes('anti_ai_telltales'))
  assert.ok(bundle.guidance.some((entry) => entry.includes('Tone tags')))
  assert.ok(bundle.guidance.some((entry) => entry.includes('Project narration POV')))
  assert.equal(bundle.guidanceHash, repeatHash)
})

test('prompt-first output router classifies output prompts and binds mentioned entities', () => {
  const catalogClassification = classifyPromptIntentScored('Create a vertical poster image of Suri in their samurai outfit standing inside the Pact Chamber, holding a confident heroic pose under warm cinematic light.')
  assert.equal(catalogClassification.intent, 'output_generation')
  assert.equal(catalogClassification.outputKind, 'poster_image')
  assert.equal(catalogClassification.targetFormat, 'image')
  assert.equal(catalogClassification.catalogVersion, promptIntentCatalogVersion)
  assert.equal(catalogClassification.requiresConfirmation, false)

  const classification = classifyOutputPrompt('Make a poster image of Mara in The Archive')
  assert.equal(classification.intent, 'output_generation')
  assert.equal(classification.outputKind, 'poster_image')

  const cinematicPosterClassification = classifyOutputPrompt('Create a vertical poster image of Suri in their samurai outfit standing inside the Pact Chamber, holding a confident heroic pose under warm cinematic light.')
  assert.equal(cinematicPosterClassification.intent, 'output_generation')
  assert.equal(cinematicPosterClassification.outputKind, 'poster_image')

  const drawClassification = classifyOutputPrompt('Draw an image of Mara in The Archive')
  assert.equal(drawClassification.intent, 'output_generation')
  assert.equal(drawClassification.outputKind, 'concept_art_image')

  const scope = bindOutputPromptWorldScope({
    prompt: 'Make a poster image of Mara in The Archive',
    worldEntities: snapshot.worldEntities,
  })
  assert.deepEqual(scope.selectedEntityKeys.sort(), ['archive', 'hero'])
})

test('catalog-ranked prompt intent separates canon mutation, documents, and ambiguous mixed requests', () => {
  const canon = classifyPromptIntentScored('Add a new chapter between Chapter 4 and Chapter 5 focused on the Echo Map awakening.')
  assert.equal(canon.intent, 'world_mutation')
  assert.equal(canon.outputKind, 'unknown')

  const critique = classifyPromptIntentScored('Evaluate where the story could be fleshed out more and suggest the strongest next areas.')
  assert.equal(critique.intent, 'answer_only')
  assert.equal(critique.outputKind, 'unknown')
  assert.equal(critique.requiresConfirmation, false)

  const bible = classifyPromptIntentScored('Write a story bible for the current world.')
  assert.equal(bible.intent, 'output_generation')
  assert.equal(bible.outputKind, 'story_bible_from_world')
  assert.equal(bible.targetFormat, 'pdf')

  const mixed = classifyPromptIntentScored('Create something cool with Suri.')
  assert.equal(mixed.requiresConfirmation, true)
})

test('prompt-first output router classifies cinematic and UGC video prompts', () => {
  const trailer = classifyOutputPrompt('Create a cinematic trailer storyboard for Chapter 1')
  assert.equal(trailer.intent, 'output_generation')
  assert.equal(trailer.outputKind, 'cinematic_trailer')

  const ugc = classifyOutputPrompt('Make a UGC video ad creative with a hook and CTA')
  assert.equal(ugc.intent, 'output_generation')
  assert.equal(ugc.outputKind, 'ugc_episode')

  const plan = planOutputPrompt({
    prompt: 'Make a cinematic sequence from Chapter 1',
    snapshot,
  })
  assert.equal(plan.outputKind, 'cinematic_episode')
  assert.equal(plan.targetFormat, 'video')
  assert.equal(plan.documentMode, 'cinematic')
})

test('cinematic prompt binding does not infer sequence units from shared names', () => {
  const localSnapshot = outputWorkflowPlanRequestSchema.shape.snapshot.parse({
    ...snapshot,
    worldEntities: [
      worldEntity('skybridge-garden', 'place', 'Skybridge Garden'),
      worldEntity('chapter-skybridge-garden', 'sequence_unit', 'Skybridge Garden', {
        sequence: { ordinal: 1, synopsis: 'A confrontation in the garden.', outcome: 'The chase begins.' },
      }),
      worldEntity('eva-9', 'actor', 'Eva-9'),
    ],
  })

  const promptPlan = planOutputPrompt({
    prompt: 'Create a cinematic where Eva-9 sings in Skybridge Garden',
    snapshot: localSnapshot,
  })
  assert.equal(promptPlan.outputKind, 'cinematic_episode')
  assert.deepEqual(promptPlan.selectedSequenceUnitKeys, [])
  assert.deepEqual(promptPlan.selectedEntityKeys.sort(), ['eva-9', 'skybridge-garden'])

  const workflowPlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic where Eva-9 sings in Skybridge Garden',
    targetFormat: 'video',
    selectedEntityKeys: promptPlan.selectedEntityKeys,
    selectedSequenceUnitKeys: promptPlan.selectedSequenceUnitKeys,
    snapshot: localSnapshot,
  }, 'cinematic_episode')

  assert.deepEqual(workflowPlan.sourceSequenceUnitKeys, [])
  assert.deepEqual(workflowPlan.sourceEntityKeys.sort(), ['eva-9', 'skybridge-garden'])
  const contextNode = workflowPlan.nodes.find((node) => node.key === 'world_context')
  assert.deepEqual((contextNode?.config as Record<string, unknown>).sourceSequenceUnitKeys, [])
  assert.ok(workflowPlan.nodes.some((node) => readConfigPurpose(node) === 'sequence_animatic_scene_graph_assignment'))

  const explicitEntityPlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic where Eva-9 sings in Skybridge Garden',
    targetFormat: 'video',
    selectedEntityKeys: ['eva-9', 'chapter-skybridge-garden', 'skybridge-garden'],
    snapshot: localSnapshot,
  }, 'cinematic_episode')
  assert.deepEqual(explicitEntityPlan.sourceEntityKeys.sort(), ['eva-9', 'skybridge-garden'])

  const explicitSequencePlan = planOutputPrompt({
    prompt: 'Create a cinematic where Eva-9 sings in Skybridge Garden',
    snapshot: localSnapshot,
    selectedSequenceUnitKeys: ['chapter-skybridge-garden'],
  })
  assert.deepEqual(explicitSequencePlan.selectedSequenceUnitKeys, ['chapter-skybridge-garden'])
})

test('cinematic story-source resolver defers prompt-mode source binding to backend LLM', () => {
  const firstChapterPlan = planOutputPrompt({
    prompt: 'Create a cinematic for first chapter',
    snapshot,
  })
  assert.equal(firstChapterPlan.outputKind, 'cinematic_episode')
  assert.deepEqual(firstChapterPlan.selectedSequenceUnitKeys, [])

  const firstPartPlan = planOutputPrompt({
    prompt: 'Create a cinematic for the first part of the first chapter',
    snapshot,
  })
  assert.deepEqual(firstPartPlan.selectedSequenceUnitKeys, [])

  const namedSourcePlan = planOutputPrompt({
    prompt: 'Create a cinematic from Opening Ash',
    snapshot,
  })
  assert.deepEqual(namedSourcePlan.selectedSequenceUnitKeys, [])

  const independentPromptPlan = planOutputPrompt({
    prompt: 'Create a cinematic where Mara performs in The Archive',
    snapshot,
  })
  assert.deepEqual(independentPromptPlan.selectedEntityKeys.sort(), ['archive', 'hero'])
  assert.deepEqual(independentPromptPlan.selectedSequenceUnitKeys, [])

  const explicitResolution = resolveCinematicStorySourceScope({
    prompt: 'Create a cinematic where Mara performs in The Archive',
    worldEntities: snapshot.worldEntities,
    selectedSequenceUnitKeys: ['chapter-2'],
  })
  assert.equal(explicitResolution.sourceMode, 'explicit_sequence')
  assert.deepEqual(explicitResolution.selectedSequenceUnitKeys, ['chapter-2'])
})

test('cinematic asset packs prefer entity reference sheets over stale world icons', async (t) => {
  const imported = await importSharedOutputWorkflow<{
    buildDeterministicCinematicAssetPack: (context: Record<string, unknown>) => {
      entities: Array<{ key: string; assetKeys: string[] }>
      missingReferenceEntityKeys: string[]
    }
  }>(t)
  if (!imported) return
  const { buildDeterministicCinematicAssetPack } = imported

  const referenceSheetKey = 'entity_reference_sheet_anya_sorin_anya_sorin'
  const worldIconKey = 'world_icon_anya_sorin_anya_sorin'
  const referenceSheetPath = 'generated/entity-reference-sheets/451ff5a5-86cb-4310-92ce-463e82e67763/14a009e6-07f8-4025-a77b-34d6a7afa084/anya_sorin.webp'
  const directReferenceSheetUrl = 'https://cdn.example.com/generated/entity-reference-sheets/anya_sorin.webp'
  const pack = buildDeterministicCinematicAssetPack({
    entities: [
      {
        key: 'anya_sorin',
        name: 'Anya Sorin',
        nodeType: 'actor',
        summary: 'Anya summary',
        thumbnailAssetKey: worldIconKey,
        metadata: {
          referenceSheetAssetKey: referenceSheetKey,
          referenceSheetStoragePath: referenceSheetPath,
          referenceSheetUrl: directReferenceSheetUrl,
          referenceSheetAssetKeys: [worldIconKey],
        },
      },
    ],
    assets: [
      { key: worldIconKey, storagePath: 'generated/world-icons/draft/job/01_anya_sorin.webp', mimeType: 'image/webp' },
      { key: referenceSheetKey, storagePath: referenceSheetPath, mimeType: 'image/webp' },
    ],
  })
  const assetKeys = pack.entities[0]?.assetKeys ?? []
  assert.ok(assetKeys.includes(referenceSheetKey))
  assert.ok(assetKeys.includes(referenceSheetPath))
  assert.ok(assetKeys.includes(directReferenceSheetUrl))
  assert.ok(assetKeys.includes(worldIconKey))
  assert.ok(assetKeys.indexOf(referenceSheetKey) < assetKeys.indexOf(worldIconKey))
  assert.ok(assetKeys.indexOf(referenceSheetPath) < assetKeys.indexOf(worldIconKey))
  assert.ok(assetKeys.indexOf(directReferenceSheetUrl) < assetKeys.indexOf(worldIconKey))

  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  assert.match(workerSource, /refreshWorldContextVisualReferences/)
  assert.match(workerSource, /resolveProjectAssetByKey/)
  assert.match(workerSource, /isProjectAssetStoragePath/)
})

test('prompt-first entity binding is typo-tolerant and does not fall back to unrelated image references', () => {
  const worldEntities = [
    worldEntity('ilya', 'actor', 'Ilya Sorin'),
    worldEntity('anya', 'actor', 'Anya Sorin'),
    worldEntity('nara', 'actor', 'Nara Quill'),
    worldEntity('checkpoint', 'place', 'Compliance Checkpoint'),
  ] as typeof snapshot.worldEntities
  const scope = bindOutputPromptWorldScope({
    prompt: 'Draw Ilay saluting to Anya',
    worldEntities,
  })

  assert.deepEqual(scope.selectedEntityKeys.sort(), ['anya', 'ilya'])

  const localSnapshot = outputWorkflowPlanRequestSchema.shape.snapshot.parse({
    ...snapshot,
    worldEntities,
  })
  const plan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Draw Ilay saluting to Anya',
    targetFormat: 'image',
    snapshot: localSnapshot,
  }, 'concept_art_image')

  assert.deepEqual(plan.sourceEntityKeys.sort(), ['anya', 'ilya'])
  assert.ok(!plan.sourceEntityKeys.includes('nara'))
  const contextNode = plan.nodes.find((node) => node.key === 'world_context')
  assert.equal((contextNode?.config as Record<string, unknown> | undefined)?.strictSourceEntityFilter, true)
})

test('story cinematic requests build scene-graph-assigned parallel animatic graph by default while explicit legacy modes are rejected', () => {
  const plan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic sequence from Chapter 1 with a shot-by-shot storyboard.',
    targetFormat: 'video',
    selectedSequenceUnitKeys: ['chapter-1'],
    snapshot,
  }, 'cinematic_episode')

  assert.equal(plan.preset, 'cinematic_episode_from_sequence')
  assert.deepEqual(plan.sourceEntityKeys.sort(), ['archive', 'hero'])
  assert.ok(plan.sourceEntityKeys.length < snapshot.worldEntities.filter((entity) => entity.nodeType !== 'sequence_unit').length + 1)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_v3_reference_select').length, 1)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_v3_screenplay_author').length, 1)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'sequence_animatic_scene_graph_assignment').length, 1)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'sequence_animatic_scene_package').length, 0)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'sequence_animatic_scene_plan_fanout').length, 0)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'sequence_animatic_scene_register').length, 1)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'sequence_animatic_director_plan').length, 0)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'sequence_animatic_manifest').length, 0)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'sequence_animatic_orchestrator').length, 0)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_v3_shot_break_plan').length, 0)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_v3_dynamic_shot_parse_fanout').length, 0)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_v3_dynamic_storyboard_fanout').length, 0)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_v2_scene_compile').length, 0)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_v2_layout_plan').length, 0)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_v2_shot_plan').length, 0)
  assert.equal(plan.nodes.filter((node) => node.nodeType === 'video_generation').length, 0)
  assert.ok(!plan.nodes.some((node) => readConfigPurpose(node) === 'cinematic_dynamic_take_fanout'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'cinematic_v3_screenplay_author' && edge.targetNodeKey === 'sequence_animatic_scene_graph_assignment'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'sequence_animatic_scene_graph_assignment' && edge.targetNodeKey === 'sequence_animatic_scene_register'))
  assert.ok(plan.diagnostics.some((line) => line.includes('scene-graph assignment mode')))
  assert.equal(validateOutputWorkflowGraph({ nodes: plan.nodes, edges: plan.edges }).ok, true)

  const packageNode = plan.nodes.find((node) => node.key === 'sequence_animatic_scene_graph_assignment')
  const sceneRegisterNode = plan.nodes.find((node) => node.key === 'sequence_animatic_scene_register')
  assert.equal(packageNode?.config.cinematicPipelineVersion, 'v3_script_storyboards')
  assert.equal(packageNode?.config.sequenceAnimaticMode, 'master_script_only')
  assert.equal(packageNode?.config.purpose, 'sequence_animatic_scene_graph_assignment')
  assert.equal(sceneRegisterNode?.config.autoStartFirstScene, true)

  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const v3ParseMaterializer = workerSource.slice(
    workerSource.indexOf('async function materializeDynamicCinematicV3ShotParseFanout'),
    workerSource.indexOf('async function materializeDynamicCinematicV2ShotFanout'),
  )
  const scenePlanMaterializer = workerSource.slice(
    workerSource.indexOf('async function materializeSequenceAnimaticScenePlanFanout'),
    workerSource.indexOf('async function materializeDynamicCinematicV3ShotParseFanout'),
  )
  assert.match(workerSource, /cinematicVideoApprovedEnabled/)
  assert.match(workerSource, /cinematic_video_approval_required/)
  assert.match(workerSource, /cinematic_v3_shot_break_plan/)
  assert.match(workerSource, /cinematic_v3_shot_parse_group/)
  assert.match(v3ParseMaterializer, /v3_parse_groups_direct_storyboards_1/)
  assert.match(v3ParseMaterializer, /cinematic_v3_storyboard_prompt/)
  assert.match(v3ParseMaterializer, /cinematic_v3_storyboard_sheet/)
  assert.match(v3ParseMaterializer, /cinematic_v3_panel_extract/)
  assert.match(v3ParseMaterializer, /cinematic_v3_storyboard_group_video_prompt/)
  assert.match(v3ParseMaterializer, /cinematic_v3_timeline_assemble/)
  assert.match(v3ParseMaterializer, /key: 'artifact', nodeType: 'output_artifact'/)
  assert.match(v3ParseMaterializer, /screenplayAnimaticMasterMode/)
  assert.match(v3ParseMaterializer, /: \[\.\.\.groupParseKeys, \.\.\.directStoryboardKeys, 'cinematic_v3_timeline_assemble', 'artifact'\]/)
  assert.doesNotMatch(v3ParseMaterializer, /cinematic_v3_shot_plan_merge/)
  assert.doesNotMatch(v3ParseMaterializer, /purpose: 'cinematic_v3_dynamic_storyboard_fanout'/)
  assert.match(workerSource, /cinematic_v3_storyboard_group_video/)
  assert.match(workerSource, /cinematic_v3_panel_extract/)
  assert.match(workerSource, /Return plain Markdown screenplay/)
  assert.match(v3ParseMaterializer, /storyboardGroups/)
  assert.match(scenePlanMaterializer, /sequence_animatic_scene_shot_plan/)
  assert.match(scenePlanMaterializer, /sequence_animatic_scene_plan_merge/)
  assert.match(scenePlanMaterializer, /sourcePort: 'scene_plan'/)
  assert.match(workerSource, /scene_plan: directorPlan/)
  const sceneShotPlanContract = getOutputWorkflowNodeContract({
    key: 'sequence_animatic_scene_shot_plan_scene_001',
    nodeType: 'utility_transform',
    config: { purpose: 'sequence_animatic_scene_shot_plan' },
  })
  assert.ok(sceneShotPlanContract?.producedOutputs.includes('scene_plan'))
  assert.match(scenePlanMaterializer, /scenePlannerConcurrency/)
  assert.match(scenePlanMaterializer, /sequence_animatic_director_plan_artifact/)
  assert.match(workerSource, /creative_scene_screenplay_v3/)
  assert.match(workerSource, /scene_graph_assignment_v1/)
  assert.match(workerSource, /sequence_animatic_scene_graph_assignment/)
  assert.match(workerSource, /#Scene scene_001/)
  assert.match(workerSource, /#Location canonical_world_location_ref/)
  assert.match(workerSource, /CHARACTER NAME \[ref:canonical_or_local_ref\]/)
  assert.match(workerSource, /Do not use #Set, #Zone, #Spot, #Viewpoint/)
  assert.match(workerSource, /Assign each screenplay scene to a usable scene graph package/)
  assert.match(workerSource, /fixed \$\{layout\.rows\}x\$\{layout\.columns\} rectangular grid/)
  assert.match(workerSource, /single full-image panel, not a multi-cell grid/)
  assert.match(workerSource, /buildCinematicV3StoryboardLayout/)
  assert.match(workerSource, /Cells \$\{layout\.panelCount \+ 1\}-\$\{gridCellCount\} are intentional empty placeholders/)
  assert.match(workerSource, /cinematic_v3_storyboard_sheets[\s\S]*continueOnError: true/)
  assert.match(workerSource, /\$\{assetPackSourceNodeKey\}__\$\{videoPromptKey\}/)
  assert.match(workerSource, /targetNodeKey: videoPromptKey, targetPort: 'asset_pack'/)
  assert.match(workerSource, /caption/)
  assert.match(workerSource, /storyboardPanelPrompt/)
  assert.match(workerSource, /videoDirection/)
  assert.match(workerSource, /performanceBeats/)
  assert.match(workerSource, /DIRECTED CONTROLS/)
  assert.match(workerSource, /formatSeedanceShotLine/)
  assert.match(workerSource, /startSeconds: localStartSeconds/)
  assert.match(workerSource, /endSeconds: localEndSeconds/)
  assert.match(workerSource, /PERFORMANCE \/ VOICE/)
  assert.match(workerSource, /buildSeedanceCharacterVoiceGuide/)
  assert.match(workerSource, /voiceDescription/)
  assert.match(workerSource, /screenplay_with_shot_markers_v1/)
  assert.match(workerSource, /buildCinematicV3ShotBreakPlan/)
  assert.match(workerSource, /Materialized \$\{result\.parseGroupCount\} Cinematics V3 screenplay parse group/)
  assert.match(workerSource, /runCinematicV2StructuredNodeBackground/)
  assert.match(workerSource, /priorProviderRequestId/)

  assert.throws(() => planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic sequence from Chapter 1 with a shot-by-shot storyboard.',
    targetFormat: 'video',
    selectedSequenceUnitKeys: ['chapter-1'],
    cinematicPipelineVersion: 'v2_shot_orchestration',
    snapshot,
  }, 'cinematic_episode'), /Legacy cinematic pipelines/)

  const ugcPlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a vertical UGC cinematic from Chapter 1.',
    targetFormat: 'video',
    selectedSequenceUnitKeys: ['chapter-1'],
    snapshot,
  }, 'ugc_episode')
  assert.equal(ugcPlan.preset, 'cinematic_episode_from_sequence')
  assert.equal(ugcPlan.nodes.filter((node) => readConfigPurpose(node) === 'sequence_animatic_scene_graph_assignment').length, 1)
  assert.equal(ugcPlan.nodes.filter((node) => readConfigPurpose(node) === 'sequence_animatic_scene_package').length, 0)
  assert.equal(ugcPlan.nodes.filter((node) => readConfigPurpose(node) === 'sequence_animatic_scene_register').length, 1)
  assert.equal(ugcPlan.nodes.filter((node) => readConfigPurpose(node) === 'sequence_animatic_director_plan').length, 0)
  assert.equal(ugcPlan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_dynamic_take_fanout').length, 0)
  assert.equal(ugcPlan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_v2_dynamic_shot_fanout').length, 0)
  assert.equal(ugcPlan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_v3_dynamic_storyboard_fanout').length, 0)
})

test('wiki sequence-unit animatics use full chapter screenplay master mode', () => {
  const plan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a screenplay animatic for Opening Ash.',
    targetFormat: 'video',
    selectedSequenceUnitKeys: ['chapter-1'],
    cinematicPipelineVersion: 'v3_script_storyboards',
    sequenceAnimaticMode: 'master_script_only',
    snapshot,
  }, 'cinematic_episode')

  const screenplayNode = plan.nodes.find((node) => readConfigPurpose(node) === 'cinematic_v3_screenplay_author')
  const shotBreakNode = plan.nodes.find((node) => readConfigPurpose(node) === 'cinematic_v3_shot_break_plan')
  const fanoutNode = plan.nodes.find((node) => readConfigPurpose(node) === 'cinematic_v3_dynamic_shot_parse_fanout')
  const scenePackageNode = plan.nodes.find((node) => readConfigPurpose(node) === 'sequence_animatic_scene_graph_assignment')
  const sceneRegisterNode = plan.nodes.find((node) => readConfigPurpose(node) === 'sequence_animatic_scene_register')
  const directorNode = plan.nodes.find((node) => readConfigPurpose(node) === 'sequence_animatic_director_plan')
  const manifestNode = plan.nodes.find((node) => readConfigPurpose(node) === 'sequence_animatic_manifest')
  const orchestratorNode = plan.nodes.find((node) => readConfigPurpose(node) === 'sequence_animatic_orchestrator')

  assert.equal(screenplayNode?.config.sequenceAnimaticMode, 'master_script_only')
  assert.equal(screenplayNode?.config.maxShotCount, 150)
  assert.equal(shotBreakNode, undefined)
  assert.equal(fanoutNode, undefined)
  assert.equal(scenePackageNode?.label, 'Scene Graph Assignment')
  assert.equal(scenePackageNode?.config.maxShotCount, 150)
  assert.equal(sceneRegisterNode?.label, 'Register Scenes')
  assert.equal(sceneRegisterNode?.config.autoStartFirstScene, true)
  assert.equal(plan.nodes.find((node) => readConfigPurpose(node) === 'sequence_animatic_scene_plan_fanout'), undefined)
  assert.equal(directorNode, undefined)
  assert.equal(manifestNode, undefined)
  assert.equal(orchestratorNode, undefined)
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'cinematic_v3_screenplay_author' && edge.targetNodeKey === 'sequence_animatic_scene_graph_assignment'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'sequence_animatic_scene_graph_assignment' && edge.targetNodeKey === 'sequence_animatic_scene_register'))
  assert.ok(plan.diagnostics.some((line) => line.includes('Sequence-unit screenplay animatic mode')))
  assert.ok(plan.diagnostics.some((line) => line.includes('scene-graph assignment mode')))

  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const startOutputRequestSource = readFileSync(resolve(repoRoot, 'supabase/functions/start-output-request/index.ts'), 'utf8')
  const domainWorkflowSource = readFileSync(resolve(repoRoot, 'src/domain/outputWorkflow.ts'), 'utf8')
  const repositorySource = readFileSync(resolve(repoRoot, 'src/data/graphcoreRepository.ts'), 'utf8')
  const worldGraphPageSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  const getSequenceAnimaticStateSource = readFileSync(resolve(repoRoot, 'supabase/functions/get-sequence-animatic-state/index.ts'), 'utf8')
  assert.match(workerSource, /Selected sequence unit to adapt fully/)
  assert.match(workerSource, /dramatic question, outcome, POV notes, character arc deltas, consequences, open loops/)
  assert.match(workerSource, /creative_scene_screenplay_v3/)
  assert.match(workerSource, /scene_graph_assignment_v1/)
  assert.match(workerSource, /writing only; scene graph assignment and technical shot planning happen in later workflow nodes/)
  assert.match(workerSource, /Do not use #Set, #Zone, #Spot, #Viewpoint/)
  assert.match(workerSource, /#Scene scene_001/)
  assert.match(workerSource, /Do not use #Set, #Zone, #Spot, #Viewpoint/)
  assert.doesNotMatch(workerSource, /#Set set_or_existing_set_id/)
  assert.match(workerSource, /inferredViewpointZoneId/)
  assert.match(workerSource, /inferredViewpointSetId/)
  assert.match(workerSource, /Scene graph viewpoint "\$\{addition\.id\}" has unknown parent zone/)
  assert.match(workerSource, /Scene graph viewpoint "\$\{addition\.id\}" has unknown parent set/)
  assert.doesNotMatch(workerSource, /spotIds: \[addition\.spotId \|\| addition\.parentId\]/)
  assert.match(workerSource, /screenplay_ready/)
  assert.match(workerSource, /screenplayAnimaticRole\) === 'master'|workflowMetadata\.screenplayAnimaticRole\) === 'master'/)
  assert.match(workerSource, /sequence_animatic_scene_graph_assignment/)
  assert.match(workerSource, /materializeSequenceAnimaticScenePlanFanout/)
  assert.match(workerSource, /sequence_animatic_scene_shot_plan/)
  assert.match(workerSource, /sequence_animatic_scene_plan_merge/)
  assert.match(workerSource, /buildSequenceAnimaticShotPlanFromBreaks/)
  assert.match(workerSource, /index === shotBreaks\.length - 1 \? 'closing' : 'action'/)
  assert.doesNotMatch(workerSource, /index === shotBreaks\.length - 1 \? 'resolution' : 'action'/)
  assert.match(workerSource, /legacyRoughShotCandidates/)
  assert.match(workerSource, /sequence_animatic_shot_continuity_jsonl_stream/)
  assert.match(workerSource, /runOpenAiResponsesStream/)
  assert.match(workerSource, /function compactSchemaDiagnostics\(error: z\.ZodError\)/)
  assert.match(workerSource, /compactSchemaDiagnostics\(parsed\.error\)\.join\('; '\)/)
  assert.match(workerSource, /Convert the creative screenplay into one compact streamed shot continuity plan/)
  assert.match(workerSource, /shot_continuity_stream_started/)
  assert.match(workerSource, /shot_streamed/)
  assert.match(workerSource, /coverage_setup/)
  assert.match(workerSource, /coverage_setup_registered/)
  assert.match(workerSource, /sequence_animatic_coverage_plan/)
  assert.match(workerSource, /Assign every shot to exactly one coverage setup/)
  assert.match(workerSource, /Coverage setup rules: do not emit coverage_setup records and do not set coverageSetupId/)
  assert.match(workerSource, /Ignored coverage_setup record from shot planner; coverage assignments are created only by the dedicated Coverage Plan node/)
  assert.doesNotMatch(workerSource, /Allowed record kinds: plan_start, block, coverage_setup, shot/)
  assert.doesNotMatch(workerSource, /Emit coverage_setup records before the shots that use them/)
  assert.match(workerSource, /coverageSetups/)
  assert.match(workerSource, /coverageSetupByShotId/)
  assert.match(workerSource, /finalizeSequenceAnimaticShotContinuityStreamPlan/)
  assert.match(workerSource, /Emit records in live-usable order/)
  assert.match(workerSource, /Do not wait for a whole block to be finished before emitting shots/)
  assert.match(workerSource, /Block records are optional during streaming/)
  assert.match(workerSource, /sequenceAnimaticSyntheticStreamBlocksFromShots/)
  assert.match(workerSource, /do not spend tokens duplicating top-level shotBindings, assetRequirements, warnings, diagnostics/)
  assert.match(workerSource, /maxOutputTokens: 64000/)
  assert.match(workerSource, /sequenceAnimaticShotContinuityMaxDurationSeconds = 10/)
  assert.match(workerSource, /sequenceAnimaticShotContinuityMaxShotCount = 150/)
  assert.match(workerSource, /sequenceAnimaticShotContinuityMaxTotalDurationSeconds/)
  assert.match(workerSource, /const parsedShotPlan = sequenceAnimaticShotPlanSchema\.safeParse\(rawShotPlan\)/)
  assert.match(workerSource, /: sequenceAnimaticShotPlanSchema\.parse\(\{/)
  assert.match(workerSource, /sequenceAnimaticShotContinuityMaxDialogueLines = 2/)
  assert.match(workerSource, /sequenceAnimaticShotContinuityMaxDialogueCharacters = 220/)
  assert.match(workerSource, /Use as many shots as the screenplay needs, up to/)
  assert.match(workerSource, /Do not compress dialogue or multi-beat action to fit an old shot-count budget/)
  assert.match(workerSource, /durationSeconds must be <=/)
  assert.match(workerSource, /at most \$\{sequenceAnimaticShotContinuityMaxDialogueLines\} short dialogue rows/)
  assert.match(workerSource, /split it into alternating dialogue\/reaction\/action shots/)
  assert.match(workerSource, /Every dialogue row must have speakerRefId and non-empty text/)
  assert.match(workerSource, /Never merge multiple screenplay dialogue turns into one dialogue row/)
  assert.match(workerSource, /\.filter\(\(line\) => line\.text\)/)
  assert.match(workerSource, /Every shot must include sceneBinding with at least setId or worldLocationRefId/)
  assert.match(workerSource, /Repaired shot continuity plan non-blockingly: \$\{missingBindings\.length\} shot/)
  assert.match(workerSource, /Recovered from accepted streamed shot records because plan_done was missing/)
  assert.match(workerSource, /Dropped \$\{missingOrderedShotIds\.length\} ordered shot reference/)
  assert.match(workerSource, /Dropped \$\{missingBlockShotIds\.length\} block shot reference/)
  assert.match(workerSource, /projectShotContinuityPlanV2ToDirectorPlan/)
  assert.match(workerSource, /sequenceAnimaticShotBindingFromSceneBinding/)
  assert.match(workerSource, /sourceScriptShotIds and sourceAnchorIds may be empty arrays/)
  assert.match(workerSource, /buildSequenceAnimaticScriptShotProjection/)
  assert.match(workerSource, /scriptShots/)
  assert.match(workerSource, /scriptBlocks/)
  assert.match(workerSource, /screenplay_shots_ready/)
  assert.match(workerSource, /shotContinuityPlan/)
  assert.match(workerSource, /normalizeCinematicV2ShotPurpose/)
  assert.match(workerSource, /cinematicV2ShotPurposeSchema/)
  assert.match(workerSource, /Build final sequence animatic manifest from shot continuity plan|Built final sequence animatic manifest from shot continuity plan/)
  assert.match(workerSource, /failed to mark output request failed/)
  assert.match(startOutputRequestSource, /sequenceAnimaticMasterRequest/)
  assert.match(startOutputRequestSource, /sequenceAnimaticMode === 'master_script_only'/)
  assert.match(startOutputRequestSource, /let sequenceAnimaticMode = payload\.sequenceAnimaticMode \?\? null/)
  assert.match(startOutputRequestSource, /let cinematicAnimaticMode = payload\.cinematicAnimaticMode \?\? null/)
  assert.match(startOutputRequestSource, /\?\? \(cinematicOutput \? 'v3_script_storyboards' : undefined\)/)
  assert.match(startOutputRequestSource, /payload\.selectedSequenceUnitKeys\.length > 0[\s\S]*sequenceAnimaticMode = 'master_script_only'/)
  assert.match(startOutputRequestSource, /cinematicAnimaticMode = 'prompt_cinematic_master'/)
  assert.match(startOutputRequestSource, /sequenceAnimaticMode,\s*\n\s*cinematicAnimaticMode,/)
  assert.doesNotMatch(startOutputRequestSource, /sequenceAnimaticMode: payload\.sequenceAnimaticMode/)
  assert.doesNotMatch(startOutputRequestSource, /cinematicAnimaticMode: payload\.cinematicAnimaticMode/)
  assert.match(domainWorkflowSource, /const fullSequenceUnitAnimatic = sequenceAnimaticMode === 'master_script_only'/)
  assert.match(domainWorkflowSource, /const promptCinematicAnimatic = cinematicAnimaticMode === 'prompt_cinematic_master'/)
  assert.match(domainWorkflowSource, /request = \{[\s\S]*sequenceAnimaticMode: 'master_script_only'/)
  assert.match(domainWorkflowSource, /request = \{[\s\S]*cinematicAnimaticMode: 'prompt_cinematic_master'/)
  assert.match(domainWorkflowSource, /request\.sequenceAnimaticMode === 'master_script_only'\) return 'cinematic_episode_from_sequence'/)
  assert.match(repositorySource, /filter: `request_id=eq\.\$\{input\.masterRequestId\}`/)
  assert.match(repositorySource, /shotIdsByBlockId/)
  assert.match(worldGraphPageSource, /applyLiveSequenceAnimaticStreamEvent/)
  assert.match(worldGraphPageSource, /eventType === 'shot_streamed'/)
  assert.match(getSequenceAnimaticStateSource, /shotIdsByBlockId/)
  assert.match(workerSource, /sequence_animatic_manifest/)
  assert.match(workerSource, /sequence_animatic_manifest_artifact/)
  assert.doesNotMatch(workerSource, /continuityEdge\(/)

  const state = sequenceAnimaticStateResponseSchema.parse({
    ok: true,
    revision: 'script-shots-ready',
    screenplayStatus: 'ready',
    screenplayMarkdown: 'The skiff glides between walls of luminous reeds.',
    scriptShotStatus: 'missing',
    shotContinuityPlanStatus: 'planning',
    shotContinuityStreamStatus: 'streaming',
    streamedShotContinuityPlan: {
      role: 'sequence_animatic_director_plan',
      screenplayAnimaticRole: 'director_plan',
      sequenceAnimaticRole: 'director_plan',
      shots: [{
        id: 'shot_001',
        blockId: 'block_001',
        title: 'Reed threshold',
        action: 'The skiff enters the flats.',
        sceneBinding: { setId: 'set_glass_reed_flats' },
      }],
      blocks: [{
        id: 'block_001',
        title: 'Arrival',
        shotIds: ['shot_001'],
      }],
    },
    streamedShotCount: 1,
    streamedBlockCount: 1,
  })
  assert.equal(state.screenplayStatus, 'ready')
  assert.equal(state.scriptShotStatus, 'missing')
  assert.equal(state.shotContinuityPlanStatus, 'planning')
  assert.equal(state.shotContinuityStreamStatus, 'streaming')
  assert.equal(state.streamedShotCount, 1)
  assert.equal(state.streamedShotContinuityPlan?.shots[0]?.id, 'shot_001')
  assert.deepEqual(sequenceAnimaticDirectorPlanShotSchema.parse({
    id: 'director_shot_001',
    sourceScriptShotIds: [],
    sourceAnchorIds: [],
    blockId: 'block_01',
    refs: { visibleCharacterRefIds: ['rin_uzuki'] },
    sceneBinding: { setId: 'set_glass_reed_flats' },
  }).sourceScriptShotIds, [])
})

test('sequence animatic UI recognizes screenplay role metadata for generated child work', () => {
  const worldGraphPageSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  assert.match(worldGraphPageSource, /function readOutputRequestScreenplayAnimaticRole\(request: OutputRequest\)/)
  assert.match(worldGraphPageSource, /readOutputRequestScreenplayAnimaticRole\(request\) === 'storyboard_block'/)
  assert.match(worldGraphPageSource, /readOutputRequestScreenplayAnimaticRole\(request\) === 'continuity_pack'/)
  assert.match(worldGraphPageSource, /role === 'shot_keyframe' \|\| role === 'shot_production'/)
  assert.match(worldGraphPageSource, /readOutputRequestScreenplayAnimaticRole\(request\) === 'coverage_anchor'/)
  assert.match(worldGraphPageSource, /role === 'continuity_asset' \|\| role === 'continuity_asset_batch'/)
  assert.doesNotMatch(worldGraphPageSource, /const plannedKeyframeRequests = input\.requests\s+\.filter\(\(request\) => readLooseRecord\(request\.metadata\)\.sequenceAnimaticRole === 'shot_keyframe'\)/)
})

test('sequence animatic UI compacts streamed state before storing it in React', () => {
  const worldGraphPageSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  assert.match(worldGraphPageSource, /function compactSequenceAnimaticStateForUi\(state: SequenceAnimaticStateResponse\)/)
  assert.match(worldGraphPageSource, /events: \[\]/)
  assert.match(worldGraphPageSource, /artifacts: \[\]/)
  assert.match(worldGraphPageSource, /outputs: compactSequenceAnimaticStepOutputsForUi\(run\.outputs\)/)
  assert.match(worldGraphPageSource, /\[masterRequestId\]: compactResult/)
  assert.match(worldGraphPageSource, /input\.sequenceState\?\.scriptShotStatus === 'ready'/)
})

test('sequence animatic finalizes completed scene children independently of master manifest', () => {
  const stateFunctionSource = readFileSync(resolve(repoRoot, 'supabase/functions/get-sequence-animatic-state/index.ts'), 'utf8')
  const repositorySource = readFileSync(resolve(repoRoot, 'src/data/graphcoreRepository.ts'), 'utf8')
  const worldGraphPageSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  assert.match(stateFunctionSource, /function readSceneChildFinalState\(input:/)
  assert.match(stateFunctionSource, /readScreenplayAnimaticRole\(asRecord\(child\.metadata\)\) === 'scene_shot_plan'/)
  assert.match(stateFunctionSource, /source: directorPlanReady \|\| manifestReady \? 'scene_child_final' : 'streamed_scene_plan'/)
  assert.match(repositorySource, /function deriveSequenceAnimaticSceneChildFinalState\(input:/)
  assert.match(repositorySource, /readOutputRequestScreenplayAnimaticRole\(request\) === 'scene_shot_plan'/)
  const sharedWorkflowSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const continuityAssetSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-continuity-asset-workflow/index.ts'), 'utf8')
  assert.match(sharedWorkflowSource, /const sceneGraphAdditions = asRecord\(planSource\.sceneGraphAdditions/)
  assert.match(sharedWorkflowSource, /readArray\(sceneGraphAdditions\[field\]\)/)
  assert.match(continuityAssetSource, /graph\.locationSets \?\? graph\.location_sets \?\? graph\.sets/)
  assert.match(worldGraphPageSource, /function sequenceAnimaticSceneIdForShot\(shot: Record<string, unknown>\)/)
  assert.match(worldGraphPageSource, /const finalizedSceneIds = new Set/)
  assert.match(worldGraphPageSource, /return !sceneId \|\| !finalizedSceneIds\.has\(sceneId\)/)
  assert.match(worldGraphPageSource, /const allowProvisional = shot\.isProvisional && sequenceAnimaticShotCanGenerateEarlyKeyframe\(shot\)/)
})

test('screenplay author uses a dedicated long timeout helper', () => {
  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  assert.match(workerSource, /DEFAULT_SCREENPLAY_AUTHOR_TIMEOUT_MS = 900_000/)
  assert.match(workerSource, /OUTPUT_WORKFLOW_SCREENPLAY_AUTHOR_TIMEOUT_MS/)
  assert.match(workerSource, /OUTPUT_WORKFLOW_CHAPTER_TIMEOUT_MS/)
  assert.match(workerSource, /function outputWorkflowScreenplayAuthorTimeoutMs\(\)/)

  const screenplayAuthorSource = workerSource.slice(
    workerSource.indexOf('async function runCinematicV2ScreenplayAuthor'),
    workerSource.indexOf('function buildFallbackCinematicV2ParsedScript'),
  )
  assert.match(screenplayAuthorSource, /timeoutMs: outputWorkflowScreenplayAuthorTimeoutMs\(\)/)
  assert.doesNotMatch(screenplayAuthorSource, /timeoutMs: 120_000/)
})

test('sequence animatic continuity sidecar has typed role, pack schema, and graph contracts', () => {
  assert.equal(sequenceAnimaticGraphRoleSchema.parse('continuity_pack'), 'continuity_pack')
  assert.deepEqual(sequenceAnimaticManifestV1Schema.parse({
    role: 'sequence_animatic_manifest',
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    screenplayAnimaticRole: 'master',
    sequenceAnimaticRole: 'master',
    workflowId: 'workflow-master',
    runId: 'run-master',
    screenplayDraft: {},
    screenplayMarkdown: '',
    shotBreakPlan: {},
    shotPlan: {},
    blocks: [],
    assetPack: { entities: [{ key: 'hero', name: 'Hero' }] },
    selectedVisualReferenceKeys: ['hero'],
    animaticReferenceCatalog: [{ key: 'hero', name: 'Hero', aliases: ['Captain Hero'] }],
    continuityAnchorPlan: {},
    characterAnchors: [],
    propAnchors: [],
    locationSpotAnchors: [],
    anchorAssets: [],
    diagnostics: [],
  }).animaticReferenceCatalog[0].key, 'hero')
  assert.equal(sequenceAnimaticContinuityWorkflowEnsureRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    masterRequestId: 'request-master',
  }).masterRequestId, 'request-master')
  assert.equal(sequenceAnimaticContinuityBlockDeriveRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    masterRequestId: 'request-master',
    continuityRequestId: 'request-continuity',
    storyboardBlockId: 'block_001',
    mode: 'derive',
  }).storyboardBlockId, 'block_001')
  assert.equal(sequenceAnimaticContinuityBlockDeriveResponseSchema.parse({
    ok: true,
    masterRequest: {
      id: 'request-master',
      projectId: 'project-1',
      draftId: 'draft-1',
      title: 'Master',
      prompt: '',
      sourceSurface: 'wiki_sequence_unit',
      outputKind: 'cinematic_episode',
      status: 'completed',
      targetFormat: 'video',
      selectedEntityKeys: [],
      selectedSequenceUnitKeys: [],
      metadata: {},
      progress: {},
      createdAt: now,
      updatedAt: now,
    },
    continuityRequest: {
      id: 'request-continuity',
      projectId: 'project-1',
      draftId: 'draft-1',
      parentRequestId: 'request-master',
      title: 'Continuity',
      prompt: '',
      sourceSurface: 'wiki_sequence_unit',
      outputKind: 'cinematic_episode',
      status: 'running',
      targetFormat: 'video',
      selectedEntityKeys: [],
      selectedSequenceUnitKeys: [],
      metadata: { sequenceAnimaticRole: 'continuity_pack' },
      progress: {},
      createdAt: now,
      updatedAt: now,
    },
    blockState: { blockId: 'block_001', status: 'deriving' },
    reused: false,
  }).blockState.status, 'deriving')
  assert.equal(sequenceAnimaticGraphRoleSchema.parse('continuity_asset'), 'continuity_asset')
  assert.equal(sequenceAnimaticGraphRoleSchema.parse('continuity_asset_batch'), 'continuity_asset_batch')
  assert.equal(sequenceAnimaticGraphRoleSchema.parse('coverage_intent_batch'), 'coverage_intent_batch')
  assert.equal(sequenceAnimaticContinuityAssetBatchSchema.parse({
    batchId: 'batch_angle_zone_console',
    batchKind: 'angle_grid',
    targetNodeIds: ['angle_console_wide', 'angle_console_insert'],
    sourceReferenceNodeIds: ['zone_console'],
    worldReferenceAssetKeys: ['asset-bridge'],
    blockIds: ['block_001'],
    layout: { rows: 1, columns: 2, cellCount: 2 },
    required: true,
  }).batchKind, 'angle_grid')
  assert.equal(sequenceAnimaticContinuityAssetBatchSchema.parse({
    batchId: 'batch_viewpoint_zone_console',
    batchKind: 'viewpoint_grid',
    targetNodeIds: ['viewpoint_console_left', 'viewpoint_console_right'],
    sourceReferenceNodeIds: ['spot_console'],
    worldReferenceAssetKeys: ['asset-bridge'],
    blockIds: ['block_001'],
    layout: { rows: 2, columns: 2, cellCount: 2 },
    required: true,
  }).batchKind, 'viewpoint_grid')
  assert.equal(sequenceAnimaticContinuityAssetWorkflowEnsureRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    masterRequestId: 'request-master',
    continuityRequestId: 'request-continuity',
    nodeId: 'zone_console',
    mode: 'generate',
  }).nodeId, 'zone_console')
  assert.deepEqual(sequenceAnimaticContinuityAssetWorkflowEnsureRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    masterRequestId: 'request-master',
    nodeId: 'spot_console_left',
    nodeIds: ['spot_console_left', 'spot_console_right'],
    mode: 'generate',
  }).nodeIds, ['spot_console_left', 'spot_console_right'])
  assert.equal(sequenceAnimaticContinuityAssetWorkflowEnsureRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    masterRequestId: 'request-master',
    nodeId: 'zone_console',
    mode: 'generate',
  }).continuityRequestId, undefined)
  assert.equal(continuityAssetStateSchema.parse({
    status: 'ready',
    inputHash: 'hash-zone-console',
    assetKey: 'asset-zone-console',
    artifactKey: 'artifact-zone-console',
    prompt: 'Generate the console zone.',
    referenceAssetKeys: ['asset-set-bridge'],
    sourceNodeId: 'zone_console',
    assetKind: 'location_zone',
    generatedAt: now,
    warnings: [],
  }).assetKind, 'location_zone')
  assert.equal(continuityVisualDependencyEdgeSchema.parse({
    sourceNodeId: 'set_bridge',
    targetNodeId: 'zone_console',
    relationship: 'contains',
    required: true,
    evidence: 'Zone belongs to the bridge set.',
  }).relationship, 'contains')
  assert.equal(sequenceAnimaticContinuityAssetWorkflowEnsureResponseSchema.parse({
    ok: true,
    masterRequest: {
      id: 'request-master',
      projectId: 'project-1',
      draftId: 'draft-1',
      title: 'Master',
      prompt: '',
      sourceSurface: 'wiki_sequence_unit',
      outputKind: 'cinematic_episode',
      status: 'completed',
      targetFormat: 'video',
      selectedEntityKeys: [],
      selectedSequenceUnitKeys: [],
      metadata: {},
      progress: {},
      createdAt: now,
      updatedAt: now,
    },
    continuityRequest: {
      id: 'request-continuity',
      projectId: 'project-1',
      draftId: 'draft-1',
      parentRequestId: 'request-master',
      title: 'Continuity',
      prompt: '',
      sourceSurface: 'wiki_sequence_unit',
      outputKind: 'cinematic_episode',
      status: 'completed',
      targetFormat: 'video',
      selectedEntityKeys: [],
      selectedSequenceUnitKeys: [],
      metadata: { sequenceAnimaticRole: 'continuity_pack' },
      progress: {},
      createdAt: now,
      updatedAt: now,
    },
    assetRequest: null,
    workflow: null,
    nodes: [],
    edges: [],
    assetState: {
      status: 'ready',
      inputHash: 'hash-zone-console',
      assetKey: 'asset-zone-console',
      artifactKey: 'artifact-zone-console',
      sourceNodeId: 'zone_console',
      assetKind: 'location_zone',
    },
    reused: true,
  }).assetState?.sourceNodeId, 'zone_console')
  assert.equal(sequenceAnimaticContinuityPackV1Schema.parse({
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    screenplayAnimaticRole: 'continuity_pack',
    sequenceAnimaticRole: 'continuity_pack',
    masterRequestId: 'request-master',
    masterManifestArtifactKey: 'manifest-artifact',
    manifestHash: 'manifest-hash',
    continuityPackHash: 'pack-hash',
    planningMode: 'block_graph_v2',
    characterAnchors: [],
    propAnchors: [],
    locationSpotAnchors: [],
    locationSets: [{ id: 'set_bridge', name: 'Bridge', shotIds: ['shot_001'] }],
    locationAngles: [{ id: 'angle_bridge_wide', setId: 'set_bridge', name: 'Bridge wide angle', shotIds: ['shot_001'] }],
    sceneGraph: { nodes: [{ id: 'set_bridge', type: 'location_set', name: 'Bridge' }], edges: [] },
    shotContinuityMap: { shot_001: [] },
    continuityGraphV2: {
      version: 'sequence_animatic_continuity_graph_v2',
      worldLocationRefs: [{ id: 'loc_bridge', key: 'bridge', name: 'Bridge', type: 'location' }],
      locationSets: [{ id: 'set_bridge', worldLocationRefId: 'bridge', name: 'Bridge', shotIds: ['shot_001'] }],
      zones: [{ id: 'zone_console', setId: 'set_bridge', name: 'Console zone', shotIds: ['shot_001'] }],
      spots: [{ id: 'spot_console', zoneId: 'zone_console', name: 'Console', shotIds: ['shot_001'] }],
      angles: [{ id: 'angle_bridge_wide', setId: 'set_bridge', zoneId: 'zone_console', name: 'Bridge wide angle', shotIds: ['shot_001'] }],
      edges: [{ sourceId: 'set_bridge', targetId: 'zone_console', type: 'contains' }],
      shotBindings: { shot_001: { shotId: 'shot_001', storyboardBlockId: 'block_001', setId: 'set_bridge', zoneId: 'zone_console', spotIds: ['spot_console'], angleId: 'angle_bridge_wide', spatialNodeIds: ['set_bridge', 'zone_console', 'spot_console', 'angle_bridge_wide'], continuityAnchorIds: [] } },
      assetAnchors: [],
      rejectedCandidates: [],
      warnings: [],
      diagnostics: [],
    },
    shotBindings: { shot_001: { shotId: 'shot_001', storyboardBlockId: 'block_001', setId: 'set_bridge', zoneId: 'zone_console', spotIds: ['spot_console'], angleId: 'angle_bridge_wide', spatialNodeIds: ['set_bridge', 'zone_console', 'spot_console', 'angle_bridge_wide'], continuityAnchorIds: [] } },
    blockStates: { block_001: { blockId: 'block_001', status: 'ready' } },
    pendingDeltas: { block_001: { blockId: 'block_001' } },
    continuityGraphStatus: 'partial',
    assetStateByNodeId: {
      zone_console: {
        status: 'ready',
        inputHash: 'hash-zone-console',
        assetKey: 'asset-zone-console',
        artifactKey: 'artifact-zone-console',
        sourceNodeId: 'zone_console',
        assetKind: 'location_zone',
      },
    },
    visualDependencyEdges: [{ sourceNodeId: 'set_bridge', targetNodeId: 'zone_console', relationship: 'contains', required: true }],
    assetGenerationStatus: 'partial',
    rejectedCandidates: [{ name: 'rain', reason: 'abstract_or_atmospheric' }],
    plannerWarnings: [],
    plannerDiagnostics: [],
    anchorAssets: [],
    warnings: ['No anchor assets were needed.'],
    diagnostics: [],
  }).sequenceAnimaticRole, 'continuity_pack')

  const continuityInputContract = getOutputWorkflowNodeContract({
    key: 'continuity_input',
    nodeType: 'utility_transform',
    config: { purpose: 'sequence_animatic_continuity_input' },
  })
  assert.ok(continuityInputContract?.producedOutputs.includes('continuityPlannerContext'))
  assert.ok(continuityInputContract?.producedOutputs.includes('continuity_planner_context'))

  const continuityPlanContract = getOutputWorkflowNodeContract({
    key: 'continuity_plan',
    nodeType: 'utility_transform',
    config: { purpose: 'sequence_animatic_continuity_anchor_plan' },
  })
  assert.equal(continuityPlanContract?.providerBacked, true)
  assert.ok(continuityPlanContract?.requiredInputs.includes('asset_pack'))
  assert.ok(!continuityPlanContract?.requiredInputs.includes('continuity_planner_context'))
  assert.ok(continuityPlanContract?.producedOutputs.includes('locationSets'))
  assert.ok(continuityPlanContract?.producedOutputs.includes('sceneGraph'))
  assert.ok(continuityPlanContract?.producedOutputs.includes('continuityGraphV2'))
  assert.ok(continuityPlanContract?.producedOutputs.includes('shotBindings'))
  assert.ok(continuityPlanContract?.producedOutputs.includes('rejectedCandidates'))
  const continuityStructureContract = getOutputWorkflowNodeContract({
    key: 'continuity_block_001_structure',
    nodeType: 'output_artifact',
    config: { purpose: 'sequence_animatic_continuity_structure_artifact' },
  })
  assert.ok(continuityStructureContract?.artifactRoles.includes('sequence_animatic_continuity_pack'))
  assert.ok(continuityStructureContract?.producedOutputs.includes('blockStates'))
  assert.ok(continuityStructureContract?.producedOutputs.includes('assetStateByNodeId'))
  assert.ok(continuityStructureContract?.producedOutputs.includes('visualDependencyEdges'))
  const continuityAssetInputContract = getOutputWorkflowNodeContract({
    key: 'continuity_asset_input',
    nodeType: 'utility_transform',
    config: { purpose: 'sequence_animatic_continuity_asset_input' },
  })
  assert.ok(continuityAssetInputContract?.producedOutputs.includes('targetNode'))
  assert.ok(continuityAssetInputContract?.producedOutputs.includes('referenceAssetKeys'))
  const continuityAssetArtifactContract = getOutputWorkflowNodeContract({
    key: 'continuity_asset_artifact',
    nodeType: 'output_artifact',
    config: { purpose: 'sequence_animatic_continuity_asset_artifact' },
  })
  assert.ok(continuityAssetArtifactContract?.artifactRoles.includes('sequence_animatic_continuity_asset'))
  assert.ok(continuityAssetArtifactContract?.producedOutputs.includes('assetStateByNodeId'))
  assert.equal(outputWorkflowRunIntentDefaults('generate_continuity_asset')?.runScope, 'upstream_to_node')
  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  assert.match(workerSource, /sequenceAnimaticReferenceAliasCandidates/)
  assert.match(workerSource, /sequenceAnimaticReferenceLookupFromPlannerContext/)
  assert.match(workerSource, /sequenceAnimaticCanonicalReferenceMatchForAnchor/)
  assert.match(workerSource, /reason: 'existing_world_entity'/)
  assert.match(workerSource, /Removed \$\{removedAnchorIds\.size\} continuity anchor/)

  const graph = buildSequenceAnimaticContinuityWorkflowGraph({
    workflowId: 'workflow-continuity',
    draftId: 'draft-1',
    commonConfig: {
      graphSpecVersion: sequenceAnimaticGraphSpecVersion,
      screenplayAnimaticRole: 'continuity_pack',
      sequenceAnimaticRole: 'continuity_pack',
      parentRequestId: 'request-master',
      manifestHash: 'manifest-hash',
      masterManifestArtifactKey: 'manifest-artifact',
    },
    manifest: {
      title: 'Opening Ash',
      shotPlan: {
        sceneId: 'scene-1',
        shots: [],
        diagnostics: [],
        performanceArc: [],
        audioPlan: { sfx: [] },
      },
      blocks: [{ id: 'block_001', index: 1, title: 'Opening block', shotIds: ['shot_001'] }],
      screenplayDraft: {},
      assetPack: { entities: [] },
    },
    assetPack: { entities: [] },
    aspectRatio: '16:9',
  })
  const purposes = graph.nodes.map((node) => readConfigPurpose({ config: node.config }))
  assert.ok(purposes.includes('sequence_animatic_continuity_input'))
  assert.ok(purposes.includes('sequence_animatic_continuity_seed_graph'))
  assert.ok(purposes.includes('sequence_animatic_continuity_global_plan'))
  assert.ok(purposes.includes('sequence_animatic_continuity_global_merge'))
  assert.ok(purposes.includes('sequence_animatic_continuity_block_plan'))
  assert.ok(purposes.includes('sequence_animatic_continuity_block_merge'))
  assert.ok(purposes.includes('sequence_animatic_continuity_structure_artifact'))
  assert.ok(purposes.includes('sequence_animatic_continuity_graph_finalize'))
  assert.ok(purposes.includes('sequence_animatic_continuity_anchor_plan'))
  assert.ok(purposes.includes('sequence_animatic_character_anchor_atlas_prompt'))
  assert.ok(purposes.includes('sequence_animatic_prop_anchor_atlas_prompt'))
  assert.ok(purposes.includes('sequence_animatic_location_anchor_extract'))
  assert.ok(purposes.includes('sequence_animatic_continuity_artifact'))
  assert.ok(graph.edges.some((edge) => edge.source_port === 'continuity_planner_context' && edge.target_port === 'continuity_planner_context'))
  assert.ok(graph.edges.some((edge) => edge.source_node_key === 'continuity_seed_graph' && edge.target_node_key === 'continuity_global_plan'))
  assert.ok(graph.edges.some((edge) => edge.source_node_key === 'continuity_global_plan' && edge.target_node_key === 'continuity_global_merge'))
  assert.ok(graph.edges.some((edge) => edge.source_node_key === 'continuity_global_merge' && edge.target_node_key === 'continuity_global_structure'))
  assert.ok(graph.edges.some((edge) => edge.source_node_key === 'continuity_global_merge' && edge.target_node_key === 'continuity_block_001_plan'))
  const blockPlanMergeEdge = graph.edges.find((edge) => edge.source_node_key === 'continuity_block_001_plan' && edge.target_node_key === 'continuity_block_001_merge')
  assert.ok(blockPlanMergeEdge)
  assert.notEqual((blockPlanMergeEdge.metadata as Record<string, unknown>).optionalDependency, true)
  assert.notEqual((blockPlanMergeEdge.metadata as Record<string, unknown>).optional, true)
  assert.ok(graph.edges.some((edge) => edge.source_node_key === 'continuity_block_001_merge' && edge.target_node_key === 'continuity_block_001_structure'))
  assert.ok(graph.edges.some((edge) => edge.source_node_key === 'continuity_block_001_merge' && edge.target_node_key === 'continuity_graph_finalize'))
  assert.ok(graph.edges.some((edge) => edge.source_node_key === 'continuity_graph_finalize' && edge.target_node_key === 'continuity_plan'))
  const validation = validateOutputWorkflowGraph({
    nodes: graph.nodes.map((node) => ({
      key: node.key,
      nodeType: node.node_type as 'utility_transform',
      config: node.config,
      inputs: node.inputs,
    })),
    edges: graph.edges.map((edge) => ({
      sourceNodeKey: edge.source_node_key,
      sourcePort: edge.source_port,
      targetNodeKey: edge.target_node_key,
      targetPort: edge.target_port,
      metadata: edge.metadata,
    })),
  })
  assert.equal(validation.ok, true, validation.diagnostics.join('\n'))

  const assetGraph = buildSequenceAnimaticContinuityAssetWorkflowGraph({
    workflowId: 'workflow-continuity-asset',
    draftId: 'draft-1',
    commonConfig: {
      graphSpecVersion: sequenceAnimaticGraphSpecVersion,
      screenplayAnimaticRole: 'continuity_asset',
      sequenceAnimaticRole: 'continuity_asset',
      masterRequestId: 'request-master',
      continuityRequestId: 'request-continuity',
      continuityWorkflowId: 'workflow-continuity',
    },
    continuityPack: {},
    targetNode: { id: 'zone_console', name: 'Console zone', assetKind: 'location_zone', shotIds: ['shot_001'] },
    targetNodeId: 'zone_console',
    assetKind: 'location_zone',
    relevantShots: [{ id: 'shot_001', action: 'The mechanic crosses the console zone.' }],
    shotBindings: { shot_001: { zoneId: 'zone_console' } },
    assetPack: { entities: [] },
    referenceAssetKeys: ['asset-set-bridge'],
    visualDependencyEdges: [{ sourceNodeId: 'set_bridge', targetNodeId: 'zone_console', relationship: 'contains', required: true }],
    aspectRatio: '16:9',
  })
  const assetPurposes = assetGraph.nodes.map((node) => readConfigPurpose({ config: node.config }))
  assert.deepEqual(assetPurposes, [
    'sequence_animatic_continuity_asset_input',
    'sequence_animatic_continuity_asset_prompt',
    'sequence_animatic_continuity_asset_image',
    'sequence_animatic_continuity_asset_artifact',
  ])
  assert.ok(assetGraph.edges.some((edge) => edge.source_node_key === 'continuity_asset_prompt' && edge.target_node_key === 'continuity_asset_image'))
  const assetValidation = validateOutputWorkflowGraph({
    nodes: assetGraph.nodes.map((node) => ({
      key: node.key,
      nodeType: node.node_type as never,
      config: node.config,
      inputs: node.inputs,
    })),
    edges: assetGraph.edges.map((edge) => ({
      sourceNodeKey: edge.source_node_key,
      sourcePort: edge.source_port,
      targetNodeKey: edge.target_node_key,
      targetPort: edge.target_port,
      metadata: edge.metadata,
    })),
  })
  assert.equal(assetValidation.ok, true, assetValidation.diagnostics.join('\n'))

  const batchGraph = buildSequenceAnimaticContinuityBatchWorkflowGraph({
    workflowId: 'workflow-continuity-batch',
    draftId: 'draft-1',
    commonConfig: {
      graphSpecVersion: sequenceAnimaticGraphSpecVersion,
      screenplayAnimaticRole: 'continuity_asset_batch',
      sequenceAnimaticRole: 'continuity_asset_batch',
      masterRequestId: 'request-master',
      continuityBatchId: 'batch_angle_zone_console',
    },
    batch: {
      batchId: 'batch_angle_zone_console',
      batchKind: 'angle_grid',
      targetNodeIds: ['angle_console_wide', 'angle_console_insert'],
      sourceReferenceNodeIds: ['zone_console'],
      worldReferenceAssetKeys: ['asset-bridge'],
      blockIds: ['block_001'],
      layout: { rows: 1, columns: 2, cellCount: 2 },
      required: true,
    },
    targetNodes: [
      { id: 'angle_console_wide', name: 'Console wide angle', assetKind: 'location_angle' },
      { id: 'angle_console_insert', name: 'Console insert angle', assetKind: 'location_angle' },
    ],
    continuityGraphV2: {},
    relevantShots: [{ id: 'shot_001', storyboardBlockId: 'block_001' }],
    shotBindings: { shot_001: { angleId: 'angle_console_wide' } },
    assetPack: { entities: [] },
    referenceAssetKeys: ['asset-bridge'],
    visualDependencyEdges: [{ sourceNodeId: 'zone_console', targetNodeId: 'angle_console_wide', relationship: 'zone_to_angle', required: true }],
    aspectRatio: '16:9',
  })
  const batchPurposes = batchGraph.nodes.map((node) => readConfigPurpose({ config: node.config }))
  assert.deepEqual(batchPurposes, [
    'sequence_animatic_continuity_batch_input',
    'sequence_animatic_continuity_batch_prompt',
    'sequence_animatic_continuity_batch_image',
    'sequence_animatic_continuity_batch_extract',
    'sequence_animatic_continuity_batch_artifact',
  ])
  assert.ok(batchGraph.edges.some((edge) => edge.source_node_key === 'continuity_batch_image' && edge.target_node_key === 'continuity_batch_extract'))
  const batchImageNode = batchGraph.nodes.find((node) => node.key === 'continuity_batch_image')
  assert.deepEqual(batchImageNode?.config.imageSize, { width: 2048, height: 2048 })
  const batchValidation = validateOutputWorkflowGraph({
    nodes: batchGraph.nodes.map((node) => ({
      key: node.key,
      nodeType: node.node_type as never,
      config: node.config,
      inputs: node.inputs,
    })),
    edges: batchGraph.edges.map((edge) => ({
      sourceNodeKey: edge.source_node_key,
      sourcePort: edge.source_port,
      targetNodeKey: edge.target_node_key,
      targetPort: edge.target_port,
      metadata: edge.metadata,
    })),
  })
  assert.equal(batchValidation.ok, true, batchValidation.diagnostics.join('\n'))

  assert.match(workerSource, /sequenceAnimaticContinuityAssetBatches/)
  assert.match(workerSource, /angle_grid/)
  assert.match(workerSource, /spot_grid/)
  assert.match(workerSource, /parent_child_scaffold_grid/)
  assert.match(workerSource, /Cell 1 is the parent set\/zone\/spot environment reference/)
  assert.match(workerSource, /sanitizeSequenceAnimaticSpatialNodeFields/)
  assert.match(workerSource, /Location evidence/)
  assert.match(workerSource, /promptDiagnostics/)
  assert.match(workerSource, /physical staging position or architectural sub-location/)
  assert.doesNotMatch(workerSource, /action spot inside the same zone/)
  const keyframeEnsureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-keyframe-workflows/index.ts'), 'utf8')
  assert.match(keyframeEnsureSource, /parent_child_scaffold_grid/)
  assert.match(keyframeEnsureSource, /cellRoles: \['parent', \.\.\.orderedChildren\.map\(\(\) => 'child'\)\]/)
  assert.match(keyframeEnsureSource, /continuityBatchLayoutForTargetCount\(targetNodeIds\.length\)/)
  const continuityAssetEnsureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-continuity-asset-workflow/index.ts'), 'utf8')
  assert.match(continuityAssetEnsureSource, /parent_child_scaffold_grid/)
  assert.match(continuityAssetEnsureSource, /cellRoles = isParentChildScaffold \? \['parent', \.\.\.batchTargetIds\.slice\(1\)\.map\(\(\) => 'child'\)\]/)
  assert.match(continuityAssetEnsureSource, /parentReferenceAssetKeys/)
  assert.match(continuityAssetEnsureSource, /spatialPromptPolicyVersion/)
  assert.match(continuityAssetEnsureSource, /Generate parent continuity asset first/)
  assert.doesNotMatch(continuityAssetEnsureSource, /if \(missingParent\) \{\s*throw new HttpError\(409, `Generate parent continuity asset first/)
  assert.match(workerSource, /temp_character_grid/)
  assert.match(workerSource, /prop_grid/)
  assert.match(workerSource, /augmentStoryboardBlockWorkflowAssetPackWithContinuityAssets/)
  assert.match(workerSource, /scopeAssetPackToReferenceAssetKeys/)
  assert.match(workerSource, /referenceScope: 'sequence_animatic_shot_keyframe'/)
  assert.match(workerSource, /referenceScope: 'sequence_animatic_coverage_anchor'/)
  assert.match(workerSource, /requiresContinuityPrompt/)
  assert.match(workerSource, /continuityFallbackPrompt/)
  assert.match(workerSource, /\|\| \(requiresContinuityPrompt \? '' : input\.run\.prompt\)/)
  assert.match(workerSource, /config\.pageAssetPack \?\? config\.page_asset_pack \?\? config\.assetPack \?\? config\.asset_pack/)
  assert.doesNotMatch(workerSource, /Use coverage anchor asset:/)
  assert.doesNotMatch(workerSource, /Use previous keyframe continuity asset:/)
})

test('sequence animatic keyframe UI routes prereqs through keyframe orchestrator', () => {
  const pageSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  const handlerMatch = pageSource.match(/const handleRunSequenceAnimaticShotKeyframe = useCallback\(async[\s\S]*?\n  \}, \[loadAndStoreSequenceAnimaticState/)
  assert.ok(handlerMatch, 'shot keyframe handler should be discoverable')
  const handlerSource = handlerMatch[0]
  assert.match(handlerSource, /onEnsureSequenceAnimaticKeyframeWorkflows/)
  assert.doesNotMatch(handlerSource, /onEnsureSequenceAnimaticContinuityAssetWorkflow/)
  assert.match(pageSource, /function sequenceAnimaticShotProgressPreview/)
  assert.match(pageSource, /Coverage anchor ready/)
  assert.doesNotMatch(pageSource, /shotCoverageAnchor\?\.characterRefIds/)
  assert.match(pageSource, /scaffoldGroups\.push\(\{ targets: groupTargets, isBatch: true \}\)/)
})

test('sequence animatic shot production graph resolves shared refs before keyframe and video', () => {
  assert.equal(sequenceAnimaticGraphRoleSchema.parse('shot_production'), 'shot_production')
  const graph = buildSequenceAnimaticShotProductionWorkflowGraph({
    workflowId: 'workflow-shot-production',
    draftId: 'draft-1',
    commonConfig: {
      masterRequestId: 'request-master',
      parentRequestId: 'request-master',
      storyboardBlockId: 'block_001',
      shotId: 'shot_001',
      coverageSetupId: 'setup_a',
      coverageAnchorScopeKey: 'setup_a_spot_lab_ava',
      coverageAnchorScope: 'shot_scoped',
      manifestHash: 'manifest-hash',
      directorPlanHash: 'director-hash',
      masterManifestArtifactKey: 'artifact-manifest',
    },
    block: { id: 'block_001', title: 'Block' },
    shot: {
      id: 'shot_001',
      index: 1,
      title: 'Reveal',
      action: 'Ava enters the room.',
      dialogue: [],
      visibleCharacterRefIds: ['ava'],
      speakerRefIds: [],
      propRefIds: [],
      locationRefId: 'spot_lab',
      editorialDurationSeconds: 4,
    },
    panel: { assetKey: 'panel_asset', role: 'sequence_animatic_block_panel' },
    assetPack: { entities: [{ key: 'ava', name: 'Ava', primaryAssetKey: 'ava_sheet', assetKeys: ['ava_sheet'] }] },
    coverageAnchor: { assetKey: 'coverage_asset' },
    previousKeyframe: {},
    requiredReferenceAssetKeys: ['coverage_asset', 'ava_sheet', 'spot_sheet'],
    omittedReferenceAssetKeys: ['extra_sheet'],
    selectedReferences: [{ assetKey: 'coverage_asset', role: 'coverage_anchor', reason: 'Coverage.' }],
    omittedReferences: [{ assetKey: 'extra_sheet', role: 'continuity_asset', reason: 'Budget.' }],
    sharedDependencyRequests: [{ role: 'coverage_anchor', identityKey: 'coverageSetupId', identityValue: 'setup_a', status: 'ready' }],
    continuityDependencies: [
      {
        targetNodeId: 'set_lab',
        targetNode: { id: 'set_lab', name: 'Lab Set', nodeKind: 'location_set', summary: 'A clean research lab.' },
        assetKind: 'location_set',
        referenceAssetKeys: [],
        parentNodeIds: [],
      },
      {
        targetNodeId: 'spot_lab',
        targetNode: { id: 'spot_lab', name: 'Lab Door', nodeKind: 'location_spot', zoneId: 'set_lab', summary: 'The entry point into the lab.' },
        assetKind: 'location_spot',
        referenceAssetKeys: ['spot_sheet'],
        parentNodeIds: ['set_lab'],
      },
      {
        targetNodeId: 'temp_character_monastery_attendants',
        targetNode: { id: 'temp_character_monastery_attendants', name: 'Monastery attendants', nodeKind: 'temporary_character', summary: 'Visible attendants in this shot.' },
        assetKind: 'temporary_character',
        referenceAssetKeys: [],
        parentNodeIds: [],
      },
    ],
    coverageSetup: { id: 'setup_a', title: 'Wide reveal', stagingBrief: 'Ava enters through the lab door.' },
    coverageShots: [{ id: 'shot_001', title: 'Reveal' }],
    coverageReferenceAssetKeys: ['ava_sheet', 'spot_sheet'],
    dependencyMode: 'single_node_chain',
    editorialDurationSeconds: 4,
    providerDurationSeconds: 5,
    aspectRatio: '16:9',
  })
  const nodeKeys = graph.nodes.map((node) => node.key)
  assert.ok(nodeKeys.includes('coverage_anchor_input'))
  assert.ok(nodeKeys.includes('coverage_anchor_artifact'))
  assert.ok(nodeKeys.includes('continuity_set_lab_image'))
  assert.ok(nodeKeys.includes('continuity_spot_lab_artifact'))
  assert.ok(nodeKeys.includes('continuity_temp_character_monastery_attendants_artifact'))
  assert.ok(!nodeKeys.includes('continuity_ref_1'))
  assert.ok(nodeKeys.includes('shot_reference_pack'))
  assert.ok(nodeKeys.includes('world_ref_ava'))
  assert.ok(nodeKeys.includes('planned_keyframe_artifact'))
  assert.ok(nodeKeys.includes('shot_video_artifact'))
  const coverageAnchorInput = graph.nodes.find((node) => node.key === 'coverage_anchor_input')
  assert.deepEqual((coverageAnchorInput?.config as { referenceAssetKeys?: string[] } | undefined)?.referenceAssetKeys, ['ava_sheet', 'spot_sheet'])
  assert.equal((coverageAnchorInput?.config as { globalAssetIdentityKey?: string } | undefined)?.globalAssetIdentityKey, 'coverageAnchorScopeKey')
  assert.equal((coverageAnchorInput?.config as { globalAssetIdentityValue?: string } | undefined)?.globalAssetIdentityValue, 'setup_a_spot_lab_ava')
  const continuitySetInput = graph.nodes.find((node) => node.key === 'continuity_set_lab_input')
  const continuitySpotInput = graph.nodes.find((node) => node.key === 'continuity_spot_lab_input')
  assert.deepEqual((continuitySetInput?.config.assetPack as { entities?: unknown[] } | undefined)?.entities, [])
  assert.deepEqual((continuitySpotInput?.config.assetPack as { entities?: unknown[] } | undefined)?.entities, [])
  assert.deepEqual((continuitySetInput?.config as { selectedReferences?: unknown[] } | undefined)?.selectedReferences, [])
  assert.ok(graph.edges.some((edge) => edge.source_node_key === 'coverage_anchor_artifact' && edge.target_node_key === 'shot_reference_pack'))
  assert.ok(graph.edges.some((edge) => edge.source_node_key === 'world_ref_ava' && edge.target_node_key === 'shot_reference_pack'))
  assert.ok(graph.edges.some((edge) => edge.source_node_key === 'continuity_set_lab_image' && edge.target_node_key === 'continuity_spot_lab_image'))
  assert.ok(graph.edges.some((edge) => edge.source_node_key === 'continuity_spot_lab_artifact' && edge.target_node_key === 'coverage_anchor_image'))
  assert.ok(!graph.edges.some((edge) => edge.source_node_key === 'continuity_set_lab_artifact' && edge.target_node_key === 'coverage_anchor_image'))
  assert.ok(!graph.edges.some((edge) => edge.source_node_key === 'continuity_set_lab_artifact' && edge.target_node_key === 'shot_reference_pack'))
  assert.ok(!graph.edges.some((edge) => edge.source_node_key === 'continuity_spot_lab_artifact' && edge.target_node_key === 'shot_reference_pack'))
  assert.ok(graph.edges.some((edge) => edge.source_node_key === 'continuity_temp_character_monastery_attendants_artifact' && edge.target_node_key === 'shot_reference_pack'))
  assert.ok(graph.edges.some((edge) => edge.source_node_key === 'planned_keyframe_artifact' && edge.target_node_key === 'shot_video_prompt'))
  assert.ok(graph.edges.some((edge) => edge.source_node_key === 'shot_video' && edge.target_node_key === 'shot_video_artifact'))
  const validation = validateOutputWorkflowGraph({
    nodes: graph.nodes.map((node) => ({
      key: node.key,
      nodeType: node.node_type as never,
      config: node.config,
      inputs: node.inputs,
    })),
    edges: graph.edges.map((edge) => ({
      sourceNodeKey: edge.source_node_key,
      sourcePort: edge.source_port,
      targetNodeKey: edge.target_node_key,
      targetPort: edge.target_port,
      metadata: edge.metadata,
    })),
  })
  assert.equal(validation.ok, true, validation.diagnostics.join('\n'))

  const keyframeEnsureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-keyframe-workflows/index.ts'), 'utf8')
  const shotGraphEnsureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-shot-production-graph/index.ts'), 'utf8')
  const workflowFactorySource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/sequence-animatic-workflow-factory.ts'), 'utf8')
  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const pageSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  const sceneBoardCanvasSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/scene-board/SceneBoardCanvas.tsx'), 'utf8')
  const sceneBoardProjectionSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/scene-board/sceneBoardProjection.ts'), 'utf8')
  const repositorySource = readFileSync(resolve(repoRoot, 'src/data/graphcoreRepository.ts'), 'utf8')
  const pruneMigrationSource = readFileSync(resolve(repoRoot, 'supabase/migrations/20260613224408_prune_obsolete_child_workflow_graph_nodes.sql'), 'utf8')
  assert.match(keyframeEnsureSource, /buildSequenceAnimaticShotProductionWorkflowGraph/)
  assert.match(shotGraphEnsureSource, /buildSequenceAnimaticShotProductionWorkflowGraph/)
  assert.match(shotGraphEnsureSource, /SHOT_GRAPH_POLICY_VERSION = 'primary_chain_v7'/)
  assert.match(shotGraphEnsureSource, /SHOT_GRAPH_DEPENDENCY_MODE = 'single_node_chain'/)
  assert.match(shotGraphEnsureSource, /primaryShotSpatialNodeIds/)
  assert.match(shotGraphEnsureSource, /const primarySpotId = readText\(binding\.primarySpotId/)
  assert.match(shotGraphEnsureSource, /coverageSetupEntityRefIds/)
  assert.match(shotGraphEnsureSource, /scopedCoverageShotsForShot/)
  assert.match(shotGraphEnsureSource, /shotSpatialFingerprint/)
  assert.match(shotGraphEnsureSource, /coverageAnchorScopeKey/)
  assert.match(shotGraphEnsureSource, /Selected from shot-visible refs/)
  assert.match(shotGraphEnsureSource, /referencedAnimaticAssetNodeIds/)
  assert.match(shotGraphEnsureSource, /incidentalCharacterNodesForShot/)
  assert.match(shotGraphEnsureSource, /temp_character_monastery_attendants/)
  assert.match(keyframeEnsureSource, /incidentalCharacterNodesForShot/)
  assert.match(keyframeEnsureSource, /temp_character_monastery_attendants/)
  assert.match(shotGraphEnsureSource, /sequenceAnimaticCoverageRegistry/)
  assert.match(shotGraphEnsureSource, /coverageDecision/)
  assert.match(shotGraphEnsureSource, /coverageSetupSource/)
  assert.match(shotGraphEnsureSource, /graphNodeMapForShot/)
  assert.match(shotGraphEnsureSource, /nodeShotIds\.includes\(shotId\)/)
  assert.match(shotGraphEnsureSource, /genericScene !== 'sequence_animatic_master'/)
  assert.match(shotGraphEnsureSource, /spotIds: uniqueTexts\(\[primarySpotId\]\)/)
  assert.match(shotGraphEnsureSource, /coverageSetupScopeIssues/)
  assert.match(shotGraphEnsureSource, /stale_master_scoped_setup_id/)
  assert.match(shotGraphEnsureSource, /spot_scope_not_primary_only/)
  assert.match(shotGraphEnsureSource, /semanticCoverageSetupTitle/)
  assert.match(shotGraphEnsureSource, /coverageReuseSignature/)
  assert.match(shotGraphEnsureSource, /coverageReuseSignaturesMatch/)
  assert.match(shotGraphEnsureSource, /createdFromShotId/)
  assert.match(shotGraphEnsureSource, /isShotCoverageTitle/)
  assert.doesNotMatch(shotGraphEnsureSource, /Shot \\$\\{shotId\\} coverage/)
  assert.match(shotGraphEnsureSource, /shotScopedContinuityNode/)
  assert.match(shotGraphEnsureSource, /currentShot \? \[currentShot\] : \[shot\]/)
  assert.match(keyframeEnsureSource, /sequenceAnimaticCoverageRegistry/)
  assert.match(keyframeEnsureSource, /coverageDecision/)
  assert.match(keyframeEnsureSource, /coverageSetupSource/)
  assert.match(keyframeEnsureSource, /graphNodeMapForShot/)
  assert.match(keyframeEnsureSource, /spotIds: uniqueTexts\(\[primarySpotId\]\)/)
  assert.match(keyframeEnsureSource, /coverageSetupScopeIssues/)
  assert.match(keyframeEnsureSource, /stale_master_scoped_setup_id/)
  assert.match(keyframeEnsureSource, /spot_scope_not_primary_only/)
  assert.match(keyframeEnsureSource, /semanticCoverageSetupTitle/)
  assert.match(keyframeEnsureSource, /coverageReuseSignature/)
  assert.match(keyframeEnsureSource, /coverageReuseSignaturesMatch/)
  assert.match(keyframeEnsureSource, /createdFromShotId/)
  assert.match(keyframeEnsureSource, /isShotCoverageTitle/)
  assert.doesNotMatch(keyframeEnsureSource, /Shot \\$\\{shotId\\} coverage/)
  assert.match(keyframeEnsureSource, /shotScopedContinuityNode/)
  assert.match(keyframeEnsureSource, /currentShot \? \[currentShot\] : \[shot\]/)
  assert.match(pageSource, /sequenceAnimaticCoverageUsageLabel/)
  assert.match(pageSource, /sequenceAnimaticCoverageUsageDetailLabel/)
  assert.match(pageSource, /displayTitle/)
  assert.match(pageSource, /createdFromShotId/)
  assert.match(pageSource, /reuseReason/)
  assert.doesNotMatch(shotGraphEnsureSource, /continuity_asset_batch/)
  assert.match(keyframeEnsureSource, /p_role: 'shot_production'/)
  assert.match(keyframeEnsureSource, /shotContinuityDependenciesForGraph/)
  assert.match(keyframeEnsureSource, /coverageSetupEntityKeys/)
  assert.match(keyframeEnsureSource, /dependencyMode: shotGraphDependencyMode/)
  assert.match(keyframeEnsureSource, /currentShotProductionRequest/)
  assert.match(keyframeEnsureSource, /scopedExistingShotRequest/)
  assert.match(keyframeEnsureSource, /shotKeyframeRequests = isShotScopedEnsure && shotGraphDependencyMode === 'single_node_chain'/)
  assert.match(keyframeEnsureSource, /responseWorkflowIds/)
  assert.match(shotGraphEnsureSource, /function prioritizedEntityAssetKeys/)
  assert.match(shotGraphEnsureSource, /const primaryKeys = uniqueTexts\(entities\.map\(preferredEntityAssetKey\)\)/)
  assert.match(shotGraphEnsureSource, /coverageReferenceAssetKeys: scopedRefs\.requiredReferenceAssetKeys/)
  assert.match(keyframeEnsureSource, /function prioritizedEntityAssetKeys/)
  assert.match(keyframeEnsureSource, /graphLocalReferenceKeysForShotProduction/)
  assert.match(keyframeEnsureSource, /\['entity_reference', 'continuity_asset'\]\.includes\(readText\(entry\.role\)\)/)
  assert.match(keyframeEnsureSource, /coverageReferenceAssetKeys: requiredReferenceAssetKeys/)
  assert.match(workerSource, /sequence_animatic_shared_asset_ref/)
  assert.match(workflowFactorySource, /world_context_ref/)
  assert.match(workflowFactorySource, /sequence_animatic_continuity_asset_spatial/)
  assert.match(workflowFactorySource, /coverageSourceContinuityDependencies/)
  assert.doesNotMatch(workflowFactorySource, /sequence_animatic_coverage_plan/)
  assert.match(workflowFactorySource, /coverage_anchor_brief/)
  assert.match(workflowFactorySource, /feedsShotReferencePack/)
  assert.doesNotMatch(shotGraphEnsureSource, /Coverage plan is not ready for this shot yet/)
  assert.doesNotMatch(keyframeEnsureSource, /coverage_plan_not_ready/)
  assert.match(workerSource, /sequence-animatic-global-asset-reuse-v1/)
  assert.match(workerSource, /sequence_animatic_shot_reference_pack/)
  assert.match(workerSource, /const scopedReferenceAssetKeys = \[\.\.\.new Set\(\[/)
  assert.match(workerSource, /\.\.\.readStringArray\(config\.requiredReferenceAssetKeys\)/)
  assert.match(workerSource, /\.\.\.referenceAssetKeys/)
  assert.match(workerSource, /SEQUENCE_ANIMATIC_COVERAGE_ANCHOR_MODE = 'labeled_blockout_v1'/)
  assert.match(workerSource, /function sequenceAnimaticReferenceManifestEntries/)
  assert.match(workerSource, /@Image\$\{index \+ 1\} = \$\{label\}: \$\{guidance\}/)
  assert.match(workerSource, /Reference map/)
  assert.match(workerSource, /Visible subjects/)
  assert.match(workerSource, /Action\/blocking/)
  assert.match(workerSource, /Camera\/framing/)
  assert.match(workerSource, /Lighting\/environment/)
  assert.match(workerSource, /Negative rules/)
  assert.match(workerSource, /Attached image reference order/)
  assert.match(workerSource, /Composition lock: @Image1 is the coverage anchor/)
  assert.match(workerSource, /framing\/background\/blocking source of truth/)
  assert.match(workerSource, /Do not change the coverage-anchor camera angle/)
  assert.match(workerSource, /Create one labeled coverage blockout plate/)
  assert.match(workerSource, /sequence_animatic_coverage_anchor_brief/)
  assert.match(workerSource, /Create a visual staging brief for one coverage anchor blockout plate/)
  assert.match(workerSource, /Scope: current shot only; ignore unrelated linked setup shots/)
  assert.match(workerSource, /Sparse placement labels and arrows are allowed and required/)
  assert.match(workerSource, /Use named character\/item reference images only to know which placeholders to place/)
  assert.match(workerSource, /No captions, labels, arrows, UI, watermarks, borders, split panels, speech bubbles, or visible text/)
  assert.match(workerSource, /orderSequenceAnimaticAssetPackReferences\(scopeAssetPackToReferenceAssetKeys/)
  assert.match(workerSource, /sequenceAnimaticReferenceManifestTextFromRecords\(referenceImageRecords\)/)
  assert.match(workerSource, /sequence_animatic_shot_video_artifact/)
  assert.match(workerSource, /config\.skipImageGeneration === true/)
  assert.doesNotMatch(workerSource, /Object\.values\(input\.upstream\)\.some\(\(record\) => asRecord\(record\)\.skipImageGeneration/)
  assert.match(workerSource, /function outputWorkflowNodeOutputsReusableForCache/)
  assert.match(workerSource, /node\.nodeType === 'image_generation'/)
  assert.match(workerSource, /outputWorkflowImageOutputHasAssetRef/)
  assert.match(workerSource, /record\.skipImageGeneration === true/)
  assert.match(workerSource, /outputWorkflowNodeOutputsReusableForCache\(node, node\.outputs\)/)
  assert.match(workerSource, /outputWorkflowNodeOutputsReusableForCache\(node, priorStep\?\.outputs\)/)
  assert.match(workerSource, /Continuity asset image did not produce an asset key/)
  assert.match(workerSource, /Coverage anchor image did not produce an asset key/)
  assert.match(workerSource, /Shot keyframe image did not produce an asset key/)
  assert.match(workerSource, /function readPreferredUpstreamImage/)
  assert.match(workerSource, /preferredNodeKeys: \['planned_keyframe_image', 'shot_keyframe_image'\]/)
  assert.match(workerSource, /role: 'sequence_animatic_shot_keyframe'/)
  assert.match(workflowFactorySource, /sequence_animatic_coverage_anchor_spatial/)
  const graphOverlayHostSource = readFileSync(resolve(repoRoot, 'src/features/outputs/OutputGraphOverlayHost.tsx'), 'utf8')
  assert.match(graphOverlayHostSource, /sequenceAnimaticCoverageAnchorOnwardForceNodeKeys/)
  assert.match(graphOverlayHostSource, /coverageAnchorOnwardRun/)
  assert.match(graphOverlayHostSource, /targetNodeKeys = coverageAnchorOnwardRun[\s\S]*\['planned_keyframe_artifact'\]/)
  assert.match(graphOverlayHostSource, /forceNodeKeys = coverageAnchorOnwardRun[\s\S]*sequenceAnimaticCoverageAnchorOnwardForceNodeKeys/)
  assert.match(graphOverlayHostSource, /runScope: effectiveRunScope/)
  assert.match(pageSource, /role === 'shot_keyframe' \|\| role === 'shot_production'/)
  assert.match(pageSource, /sequenceAnimaticShotProductionKeyframeTargetNodeKeys/)
  assert.match(pageSource, /sequenceAnimaticShotKeyframeProgressLabel/)
  assert.match(pageSource, /sequenceAnimaticShotKeyframeBusyLabel/)
  assert.match(pageSource, /keyframeProgressLabel: plannedKeyframeProgressLabel/)
  assert.match(pageSource, /Writing keyframe prompt/)
  assert.match(pageSource, /Preparing shot references/)
  assert.match(pageSource, /Generating coverage anchor/)
  assert.match(pageSource, /plannedKeyframeProgressLabel \|\| 'Generating keyframe'/)
  assert.match(pageSource, /shotKeyframeBusy \? shotKeyframeBusyLabel : shot\.shotVideoProgressLabel/)
  assert.doesNotMatch(pageSource, /shot\.keyframeDependencyRunning \? 'Generating refs'/)
  assert.match(pageSource, /onEnsureSequenceAnimaticShotProductionGraph/)
  assert.match(pageSource, /forceRefresh: refresh/)
  assert.match(pageSource, /handleRegenerateSequenceAnimaticSceneCoverageAnchors/)
  assert.match(pageSource, /Regenerate scene coverage/)
  assert.match(pageSource, /SequenceAnimaticSceneBoardCanvas/)
  assert.match(pageSource, /buildSequenceAnimaticSceneBoardView/)
  assert.match(sceneBoardCanvasSource, /function SequenceAnimaticSceneBoardCanvas/)
  assert.match(sceneBoardProjectionSource, /buildSequenceAnimaticSceneBoardView/)
  assert.match(sceneBoardCanvasSource, /const estimateGroupHeight = \(group: SequenceAnimaticSceneBoardGroup\)/)
  assert.match(sceneBoardCanvasSource, /const rowHeights = groupMetrics\.reduce<number\[\]>/)
  assert.match(sceneBoardCanvasSource, /const y = rowOffsets\[row\] \?\? 42/)
  assert.match(sceneBoardCanvasSource, /minHeight: height/)
  assert.match(pageSource, /sequenceAnimaticSceneBoardZoneScopeForNode/)
  assert.match(pageSource, /handlePrepareSequenceAnimaticSceneBoardContinuity/)
  assert.match(sceneBoardCanvasSource, /Prepare Selected Board/)
  assert.match(sceneBoardCanvasSource, /Continuity Prep/)
  assert.match(sceneBoardCanvasSource, /prepUnits/)
  assert.match(pageSource, /SequenceAnimaticSceneBoardPrepUnit/)
  assert.match(sceneBoardProjectionSource, /sequenceAnimaticSceneBoardScaffoldGroupsForUnit/)
  assert.match(pageSource, /startSequenceAnimaticContinuityAssetRunGroups/)
  assert.match(pageSource, /startSequenceAnimaticZoneCoverageBoardRuns/)
  assert.match(pageSource, /scaffoldGroups\.length/)
  assert.match(sceneBoardProjectionSource, /index < targets\.length; index \+= 9/)
  assert.match(pageSource, /index < group\.length; index \+= 9/)
  assert.match(sceneBoardProjectionSource, /Math\.ceil\(coverageShots\.length \/ 9\)/)
  assert.match(pageSource, /Scene Board/)
  assert.match(pageSource, /Open Scene Board/)
  assert.match(repositorySource, /setId: request\.setId \?\? null/)
  assert.match(repositorySource, /zoneId: request\.zoneId \?\? null/)
  assert.match(pageSource, /forceRefresh: true/)
  assert.match(pageSource, /runIntent: 'generate_keyframes'/)
  assert.doesNotMatch(pageSource, /runIntent: 'regenerate_scene_coverage_anchors'/)
  assert.match(pageSource, /onEnsureSequenceAnimaticZoneCoverageBoards/)
  assert.match(pageSource, /runMode: 'sequence_animatic_zone_coverage_board'/)
  assert.match(pageSource, /targetNodeKeys: \[\.\.\.sequenceAnimaticZoneCoverageBoardTargetNodeKeys\]/)
  assert.match(pageSource, /forceNodeKeys: \[\.\.\.sequenceAnimaticZoneCoverageBoardForceNodeKeys\]/)
  assert.doesNotMatch(pageSource, /const preparedShotRuns/)
  assert.doesNotMatch(pageSource, /representativeByCoverageSetupId/)
  assert.match(pageSource, /shotProductionCoverageRunBySetupId/)
  assert.match(pageSource, /shotProductionCoverageRunByShotId/)
  assert.match(pageSource, /coverageAnchorArtifactByShotId/)
  assert.match(pageSource, /plannedKeyframeRequests\.flatMap\(\(request\) => input\.artifacts\.filter\(\(artifact\) => artifactBelongsToRequest\(artifact, request\)\)\)/)
  assert.match(pageSource, /cachedShotGraphIsCurrent/)
  assert.match(pageSource, /shot\.keyframeDependencyMode === 'single_node_chain'/)
  assert.match(pageSource, /shot\.keyframeGraphPolicyVersion === 'primary_chain_v7'/)
  assert.match(pageSource, /filterSequenceAnimaticShotReferencesForShot/)
  assert.match(pageSource, /anchor\?\.shotIds\.includes\(shotId\)/)
  assert.match(pageSource, /openSequenceAnimaticOutputGraph\(model, shotRequest\.id, 'planned_keyframe_artifact'\)/)
  assert.match(pruneMigrationSource, /delete from public\.output_workflow_edges/)
  assert.match(pruneMigrationSource, /delete from public\.output_workflow_nodes/)
})

test('sequence animatic spatial prompt sanitizer removes character action while preserving location evidence', () => {
  const shots = [{
    id: 'scene_003_shot_001',
    action: 'Rain threads through open screens as Miyo sings and Kaji steps away from the door near copper rails.',
    lighting: 'cold rainlight from the doorway and copper rail reflections',
    camera: { framing: 'wide ritual chamber angle' },
    visibleCharacterNames: ['Miyo', 'Kaji', 'Akane'],
    dialogue: [{ speakerName: 'Akane', text: 'Confess.' }],
  }]
  const forbiddenNames = sequenceAnimaticSpatialForbiddenNamesFromShots(shots)
  assert.deepEqual(forbiddenNames.sort(), ['Akane', 'Kaji', 'Miyo'])

  const node = sanitizeSequenceAnimaticSpatialNodeFields({
    id: 'spot_kaji_close_in_position',
    name: 'Kaji Close-In Position',
    nodeKind: 'location_spot',
    visualBrief: 'A step inside the ritual ring where Kaji unconsciously closes toward Miyo and the disc after the activation.',
  }, { forbiddenNames })
  assert.equal(node.name, 'inner approach point')
  assert.doesNotMatch(node.brief, /Kaji|Miyo|unconsciously|activation/i)
  assert.match(node.brief, /ritual ring|disc/i)

  const evidence = buildSequenceAnimaticLocationEvidenceLines(shots, { forbiddenNames, limit: 1 })[0]
  assert.match(evidence, /Rain|open screens|door|copper rail/i)
  assert.doesNotMatch(evidence, /Miyo|Kaji|Akane|sings|steps/i)

  const text = sanitizeSequenceAnimaticSpatialPromptText('Akane Opposite Position [ref:actor_akane]', { forbiddenNames, maxLength: 120 }).text
  assert.doesNotMatch(text, /Akane|actor_akane/)
})

test('sequence animatic state polling avoids full workflow run-step payloads', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/get-sequence-animatic-state/index.ts'), 'utf8')
  const repositorySource = readFileSync(resolve(repoRoot, 'src/data/graphcoreRepository.ts'), 'utf8')

  assert.match(source, /outputWorkflowRunStatusSelect/)
  assert.match(source, /outputWorkflowRunStepStatusSelect/)
  assert.doesNotMatch(source, /outputWorkflowRunSelect/)
  assert.doesNotMatch(source, /outputWorkflowRunStepSelect/)
  assert.doesNotMatch(source, /addAssetKey\(asRecord\(\(row as Record<string, unknown>\)\.outputs\)/)
  assert.doesNotMatch(source, /addAssetKey\(step\.outputs/)
  assert.match(repositorySource, /const OUTPUT_WORKFLOW_RUN_STATUS_SELECT =/)
  assert.match(repositorySource, /loadSequenceAnimaticStateDirect[\s\S]*select\(OUTPUT_WORKFLOW_RUN_STATUS_SELECT\)/)
  assert.match(repositorySource, /loadSequenceAnimaticStateDirect[\s\S]*select\(OUTPUT_WORKFLOW_RUN_STEP_STATUS_SELECT\)/)
  assert.doesNotMatch(repositorySource, /loadSequenceAnimaticStateDirect[\s\S]*select\(OUTPUT_WORKFLOW_RUN_SELECT\)[\s\S]*select\(OUTPUT_WORKFLOW_RUN_STEP_SELECT\)/)
})

test('sequence animatic keyframe ensure supports shot-scoped next actions', () => {
  const parsed = sequenceAnimaticKeyframeWorkflowEnsureResponseSchema.parse({
    ok: true,
    masterRequest: {
      id: 'request-master',
      projectId: 'project-1',
      draftId: 'draft-1',
      parentRequestId: null,
      workflowId: 'workflow-master',
      latestRunId: null,
      requestedBy: null,
      sourceSurface: 'wiki_sequence_unit',
      prompt: '',
      title: 'Master',
      intent: 'output_generation',
      outputKind: 'cinematic_episode',
      status: 'awaiting_confirmation',
      selectedEntityKeys: [],
      selectedSequenceUnitKeys: [],
      pageCount: null,
      targetFormat: 'video',
      plannerNotes: '',
      errorMessage: null,
      metadata: { screenplayAnimaticRole: 'master' },
      createdAt: '',
      updatedAt: '',
    },
    nextAction: {
      kind: 'run_continuity_asset',
      requestId: 'request-continuity',
      workflowId: 'workflow-continuity',
      role: 'continuity_asset_batch',
      reason: 'Generating next continuity reference wave 1.',
      shotId: 'shot_001',
      coverageSetupId: 'setup_a',
      dependencyNodeIds: ['set_a', 'zone_a'],
    },
    shotReadiness: {
      shotId: 'shot_001',
      status: 'waiting_for_continuity_asset',
      missingContinuityNodeIds: ['set_a'],
      coverageSetupReady: false,
      previousKeyframeReady: true,
      keyframeReady: false,
    },
  })
  assert.equal(parsed.nextAction?.kind, 'run_continuity_asset')
  assert.equal(parsed.shotReadiness?.status, 'waiting_for_continuity_asset')
  const shotGraphParsed = sequenceAnimaticShotProductionGraphEnsureResponseSchema.parse({
    ok: true,
    masterRequest: parsed.masterRequest,
    shotRequest: {
      ...parsed.masterRequest,
      id: 'request-shot-production',
      parentRequestId: 'request-master',
      workflowId: 'workflow-shot-production',
      metadata: {
        screenplayAnimaticRole: 'shot_production',
        sequenceAnimaticRole: 'shot_production',
        shotId: 'shot_001',
        dependencyMode: 'single_node_chain',
        shotGraphPolicyVersion: 'primary_chain_v7',
      },
    },
    workflow: null,
    nodes: [],
    edges: [],
    cacheStatus: 'reused',
    shotId: 'shot_001',
    coverageSetupId: 'setup_a',
    dependencyNodeIds: ['set_a', 'zone_a'],
    graphPolicyVersion: 'primary_chain_v7',
  })
  assert.equal(shotGraphParsed.cacheStatus, 'reused')
  assert.deepEqual(shotGraphParsed.dependencyNodeIds, ['set_a', 'zone_a'])

  const keyframeEnsureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-keyframe-workflows/index.ts'), 'utf8')
  const pageSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  const migrationSource = readFileSync(resolve(repoRoot, 'supabase/migrations/20260613110000_sequence_animatic_keyframe_child_lookup_indexes.sql'), 'utf8')

  assert.match(keyframeEnsureSource, /isShotScopedEnsure/)
  assert.match(keyframeEnsureSource, /childNextAction\('run_continuity_asset'/)
  assert.match(keyframeEnsureSource, /childNextAction\('run_coverage_anchor'/)
  assert.match(keyframeEnsureSource, /childNextAction\('run_shot_production_keyframe'/)
  assert.match(keyframeEnsureSource, /Expected active \$\{shotGraphPolicyVersion\} \$\{shotGraphDependencyMode\} graph with workflowId/)
  assert.match(pageSource, /const nextAction = readLooseRecord\(ensureResult\.nextAction\)/)
  assert.match(pageSource, /shotIds: \[shot\.id\]/)
  assert.match(pageSource, /outputRequests\.find\(\(request\) => request\.id === shot\.keyframeRequestId/)
  assert.doesNotMatch(pageSource, /onEnsureSequenceAnimaticKeyframeWorkflows\(\{\s*[\r\n]+\s*masterRequestId: model\.request\.id,\s*[\r\n]+\s*mode,\s*[\r\n]+\s*\}\)/)
  assert.match(migrationSource, /output_requests_seq_anim_coverage_anchor_lookup_idx/)
  assert.match(migrationSource, /output_requests_seq_anim_shot_production_lookup_idx/)
  assert.match(migrationSource, /output_requests_seq_anim_continuity_asset_lookup_idx/)
  assert.match(migrationSource, /output_requests_seq_anim_continuity_batch_lookup_idx/)
})

test('sequence animatic zone coverage boards generate 3x3 reusable coverage cells', () => {
  const scopedRequest = sequenceAnimaticZoneCoverageBoardEnsureRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    masterRequestId: 'request-master',
    sceneId: 'scene_001',
    setId: 'set_marsh',
    zoneId: 'zone_path',
    forceRefresh: true,
  })
  assert.equal(scopedRequest.zoneId, 'zone_path')

  const graph = buildSequenceAnimaticZoneCoverageBoardWorkflowGraph({
    workflowId: 'workflow-zone-board',
    draftId: 'draft-1',
    commonConfig: {
      masterRequestId: 'request-master',
      sceneId: 'scene_001',
      setId: 'set_marsh',
      zoneId: 'zone_path',
      chunkIndex: 0,
      sourceHash: 'hash-zone-board',
    },
    board: {
      id: 'board-1',
      sceneId: 'scene_001',
      setId: 'set_marsh',
      zoneId: 'zone_path',
      chunkIndex: 0,
      shotIds: ['shot_001', 'shot_002'],
    },
    shots: [
      { id: 'shot_001', title: 'Shot 1', action: 'Kaji crosses the reeds.', camera: { framing: 'wide' } },
      { id: 'shot_002', title: 'Shot 2', action: 'Rin turns toward bells.', camera: { framing: 'medium' } },
    ],
    coverageCells: [
      { shotId: 'shot_001', coverageSetupId: 'setup-1', coverageAnchorScopeKey: 'scope-1' },
      { shotId: 'shot_002', coverageSetupId: 'setup-2', coverageAnchorScopeKey: 'scope-2' },
    ],
    assetPack: { entities: [] },
    referenceAssetKeys: [],
  })

  const nodeKeys = new Set(graph.nodes.map((node) => node.key))
  assert.ok(nodeKeys.has('zone_coverage_board_input'))
  assert.ok(nodeKeys.has('zone_coverage_board_brief'))
  assert.ok(nodeKeys.has('zone_coverage_board_prompt'))
  assert.ok(nodeKeys.has('zone_coverage_board_image'))
  assert.ok(nodeKeys.has('zone_coverage_board_extract'))
  assert.ok(nodeKeys.has('zone_coverage_board_artifact'))
  const imageNode = graph.nodes.find((node) => node.key === 'zone_coverage_board_image')
  assert.equal(imageNode?.config.quality, 'medium')
  assert.deepEqual(imageNode?.config.imageSize, { width: 3072, height: 1728 })
  assert.equal(imageNode?.config.planningOnly, true)
  assert.deepEqual(imageNode?.config.gridLayout, { rows: 3, columns: 3, cellCount: 2 })
  assert.match(JSON.stringify(graph.edges), /zone_coverage_board_prompt/)

  const parsed = sequenceAnimaticZoneCoverageBoardEnsureResponseSchema.parse({
    ok: true,
    masterRequest: {
      id: 'request-master',
      projectId: 'project-1',
      draftId: 'draft-1',
      parentRequestId: null,
      workflowId: 'workflow-master',
      latestRunId: null,
      requestedBy: null,
      sourceSurface: 'wiki_sequence_unit',
      prompt: '',
      title: 'Master',
      intent: 'output_generation',
      outputKind: 'cinematic_episode',
      status: 'awaiting_confirmation',
      selectedEntityKeys: [],
      selectedSequenceUnitKeys: [],
      pageCount: null,
      targetFormat: 'video',
      plannerNotes: '',
      errorMessage: null,
      metadata: { screenplayAnimaticRole: 'master' },
      createdAt: '',
      updatedAt: '',
    },
    boardRequests: [],
    workflows: [],
    nodes: [],
    edges: [],
    zoneCoverageBoards: [{ id: 'board-1' }],
    coverageCellByShotId: { shot_001: { boardId: 'board-1' } },
    cacheStatus: 'created',
    sceneId: 'scene_001',
  })
  assert.equal(parsed.sceneId, 'scene_001')

  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const ensureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-zone-coverage-boards/index.ts'), 'utf8')
  const plannerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/sequence-animatic-scene-board-child-planners.ts'), 'utf8')
  const pageSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')

  assert.match(workerSource, /sequence_animatic_zone_coverage_board_brief/)
  assert.match(workerSource, /sequence_animatic_zone_coverage_board_prompt/)
  assert.match(workerSource, /sequence_animatic_zone_coverage_board_extract/)
  assert.match(workerSource, /extractedCellSet/)
  assert.match(workerSource, /entry\.key\.includes\('extract'\)/)
  assert.match(workerSource, /sourceArtifactRole: 'sequence_animatic_zone_coverage_cell'/)
  assert.match(workerSource, /role: 'sequence_animatic_coverage_anchor'/)
  assert.match(workerSource, /zone_camera_grid_cell/)
  assert.match(workerSource, /location_camera_plate_v2/)
  assert.match(workerSource, /Project art style lock/)
  assert.match(workerSource, /User-edited scene graph direction/)
  assert.match(workerSource, /sanitizeSequenceAnimaticCameraPlateText/)
  assert.match(workerSource, /sanitizeSequenceAnimaticSpatialPromptText/)
  assert.match(workerSource, /sequenceAnimaticVisualOnlyCameraFamily/)
  assert.match(workerSource, /sequenceAnimaticZoneGridPromptDiagnostics/)
  assert.match(workerSource, /Visual-only production plate grid/)
  assert.match(workerSource, /sceneGraphOverrides/)
  assert.match(workerSource, /No people, no characters, no silhouettes/)
  assert.match(workerSource, /Do not use a cartoony\/sketch\/comic\/storyboard style/)
  assert.doesNotMatch(workerSource, /actionForCameraExtractionOnly/)
  assert.doesNotMatch(workerSource, /Shot coverage direction:/)
  assert.doesNotMatch(workerSource, /wide storyboard-style labeled blockout plate/)
  assert.doesNotMatch(workerSource, /Labels\/placeholders/)
  assert.match(workerSource, /sequenceAnimaticZoneCoverageRegistry/)
  assert.match(ensureSource, /planSceneBoardZoneCoverageGridChildren/)
  assert.match(ensureSource, /ensureChildWorkflow/)
  assert.doesNotMatch(ensureSource, /chunk\(entries, 9\)/)
  assert.match(plannerSource, /chunk\(entries, 9\)/)
  assert.match(plannerSource, /scopeSetId/)
  assert.match(plannerSource, /scopeZoneId/)
  assert.match(plannerSource, /entry\.spatial\.sceneId, entry\.spatial\.setId \|\| 'set', entry\.spatial\.zoneId/)
  assert.match(plannerSource, /resolveSceneBoardCombinedManifest/)
  assert.match(plannerSource, /readySceneIds/)
  assert.match(plannerSource, /requestedShotIds = uniqueTexts\(input\.shotIds/)
  assert.match(plannerSource, /shotIds: requestedShotIds/)
  assert.match(plannerSource, /shotBindings = asRecord\(input\.directorPlan\.shotBindings/)
  assert.match(plannerSource, /rawShotBinding = asRecord\(shotBindings\[shotId\]\)/)
  assert.match(plannerSource, /applyContinuityAssetStatesToNodes/)
  assert.match(plannerSource, /continuityAssetArtifactsResponse/)
  assert.match(plannerSource, /locationReferenceAssetKeys: readStringArray\(entry\.assetPack\.scopedReferenceAssetKeys\)/)
  assert.match(plannerSource, /matchingChildrenToStale/)
  assert.match(ensureSource, /ZoneCoverageHttpError/)
  assert.match(plannerSource, /availableZoneIds/)
  assert.match(plannerSource, /zone_camera_coverage_grid_v7/)
  assert.match(plannerSource, /effectiveSceneId/)
  assert.match(plannerSource, /sceneIdFromShotId/)
  assert.match(plannerSource, /requestedSceneId === 'sequence_animatic_master'/)
  assert.match(plannerSource, /bindingScene && bindingScene !== 'sequence_animatic_master'/)
  assert.match(plannerSource, /missing_spatial_reference_assets/)
  assert.match(plannerSource, /missingSpatialReferencesForEntry/)
  assert.match(plannerSource, /coverageCellScopeKey/)
  assert.match(plannerSource, /sceneGraphOverridesForSpatialScope/)
  assert.match(plannerSource, /sceneGraphOverrides/)
  assert.match(plannerSource, /locationAssetPackForShot/)
  assert.doesNotMatch(ensureSource, /subjectLabelsForShot/)
  assert.match(plannerSource, /buildSequenceAnimaticZoneCoverageBoardWorkflowGraph/)
  assert.doesNotMatch(ensureSource, /Prepare the shot graphs for this scene before generating zone coverage boards/)
  assert.doesNotMatch(pageSource, /preparedShotGraphCount/)
  assert.match(pageSource, /runMode: 'sequence_animatic_zone_coverage_board'/)
  assert.match(pageSource, /zoneCoverageCellByShotId/)
  assert.match(pageSource, /zoneCoverageActiveShotIds/)
  assert.match(pageSource, /zoneCoverageActiveStageByShotId/)
  assert.match(pageSource, /zoneCoverageCellRunning/)
  assert.match(pageSource, /zone_coverage_board_extract/)
  assert.match(pageSource, /activeReferenceNodeIds/)
  assert.match(pageSource, /const zoneCoverageCellReady = Boolean\(zoneCoverageCell\?\.assetKey\)/)
  assert.match(pageSource, /const zoneCoverageCellRunning = !zoneCoverageCellReady && Boolean\(zoneCoverageCellActiveStage\)/)
  assert.match(pageSource, /const zoneCoverageCellFailed = !zoneCoverageCellReady && zoneCoverageFailedShotIds\.has\(shotId\)/)
  assert.match(pageSource, /const coveragePanelAssetKey = zoneCoverageCell\?\.assetKey \?\? shotCoverageAnchor\?\.assetKey \?\? null/)
  assert.match(pageSource, /const coveragePanelUrl = zoneCoverageCell\?\.assetUrl \?\? shotCoverageAnchor\?\.assetUrl \?\? null/)
  assert.match(pageSource, /sequenceAnimaticShotPreviewEyebrow/)
  assert.match(pageSource, /Coverage grid cell/)
  assert.match(pageSource, /role === 'continuity_asset' \|\| role === 'continuity_asset_batch'/)
  assert.match(pageSource, /Coverage grid cell ready/)
  assert.match(pageSource, /options: \{ forceRefresh\?: boolean \} = \{\}/)
  assert.match(pageSource, /forceRefresh: options\.forceRefresh \?\? false/)
  assert.match(pageSource, /candidate\.shots\.filter\(\(tile\) => !tile\.shot\.isProvisional\)\.every\(\(tile\) => tile\.coverageReady\)/)
  assert.match(pageSource, /sequenceAnimaticRequestIsActive\(request, existingRun\)/)
  assert.doesNotMatch(pageSource, /candidate\.missingCoverageCount === 0 \|\| candidate\.shots\.some\(\(tile\) => tile\.coverageReady\)/)
  assert.match(pageSource, /slice\(0, 8\)/)
  assert.match(pageSource, /index \+= 9/)
  assert.doesNotMatch(pageSource, /runMode: 'sequence_animatic_shot_production_coverage_anchor'[\s\S]*handleRegenerateSequenceAnimaticSceneCoverageAnchors/)
})

test('sequence animatic scene board prep state persists responsive progress metadata', () => {
  const request = sequenceAnimaticSceneBoardPrepRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    masterRequestId: 'request-master',
    sceneId: 'scene_001',
    setId: 'set_1',
    zoneId: 'zone_1',
    scopeNodeId: 'zone_1',
    shotIds: ['shot_001', 'shot_002'],
    stage: 'coverage_grids',
    status: 'running',
    activeUnitId: 'unit-zone-1',
    activeUnitLabel: 'Zone 1',
    stageLabel: 'Generating coverage grid 1/1',
    activeReferenceNodeIds: ['zone_1'],
    activeCoverageShotIds: ['shot_001', 'shot_002'],
    activeRunStepKey: 'zone_coverage_board_image',
  })
  assert.equal(request.stage, 'coverage_grids')
  assert.deepEqual(request.activeCoverageShotIds, ['shot_001', 'shot_002'])

  const response = sequenceAnimaticSceneBoardPrepResponseSchema.parse({
    ok: true,
    masterRequest: {
      id: 'request-master',
      projectId: 'project-1',
      draftId: 'draft-1',
      parentRequestId: null,
      workflowId: 'workflow-master',
      latestRunId: null,
      requestedBy: null,
      sourceSurface: 'wiki_sequence_unit',
      prompt: '',
      title: 'Master',
      intent: 'output_generation',
      outputKind: 'cinematic_episode',
      status: 'completed',
      selectedEntityKeys: [],
      selectedSequenceUnitKeys: [],
      pageCount: null,
      targetFormat: 'video',
      plannerNotes: '',
      errorMessage: null,
      metadata: { screenplayAnimaticRole: 'master' },
      createdAt: '',
      updatedAt: '',
    },
    prepRun: {
      runId: 'prep-1',
      runKey: 'request-master:scene_001:zone_1:',
      sceneId: 'scene_001',
      setId: 'set_1',
      zoneId: 'zone_1',
      scopeNodeId: 'zone_1',
      shotIds: ['shot_001', 'shot_002'],
      stage: 'coverage_grids',
      status: 'running',
      stageLabel: 'Generating coverage grid 1/1',
      activeCoverageShotIds: ['shot_001', 'shot_002'],
      activeRunStepKey: 'zone_coverage_board_image',
    },
    prepRuns: {
      'prep-1': {
        runId: 'prep-1',
        runKey: 'request-master:scene_001:zone_1:',
        sceneId: 'scene_001',
        stage: 'coverage_grids',
        status: 'running',
      },
    },
  })
  assert.equal(response.prepRun.status, 'running')
  assert.equal(response.prepRuns['prep-1'].stage, 'coverage_grids')

  const pageSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  const sceneBoardProjectionSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/scene-board/sceneBoardProjection.ts'), 'utf8')
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')
  const repoSource = readFileSync(resolve(repoRoot, 'src/data/graphcoreRepository.ts'), 'utf8')
  const functionSource = readFileSync(resolve(repoRoot, 'supabase/functions/prepare-sequence-animatic-scene-board/index.ts'), 'utf8')

  assert.match(pageSource, /sequenceAnimaticSceneBoardPrepRunForScope/)
  assert.match(pageSource, /sceneBoardPrepRequestMatchesScope/)
  assert.match(pageSource, /sequenceAnimaticSceneBoardWorkflowProgress/)
  assert.match(pageSource, /workflowProgressForRequest\(\s*sequenceAnimaticSceneBoardPrepRequestId/)
  assert.match(pageSource, /workflowProgress={sequenceAnimaticSceneBoardWorkflowProgress}/)
  assert.match(pageSource, /onPrepareSequenceAnimaticSceneBoard/)
  assert.doesNotMatch(pageSource, /Failed to persist Scene Board prep state/)
  assert.match(pageSource, /Still waiting for required set, zone map, and spot atlas references before coverage grids/)
  assert.match(pageSource, /Prepare Selected Board first\. Missing required continuity refs/)
  assert.match(sceneBoardProjectionSource, /sequenceAnimaticSceneBoardReferenceHasAsset/)
  assert.match(sceneBoardProjectionSource, /tile\.target\?\.assetKey/)
  assert.match(sceneBoardProjectionSource, /allCoverageUnitReferencesReady/)
  assert.match(pageSource, /onCancelPrep/)
  assert.match(appSource, /prepareSequenceAnimaticSceneBoard/)
  assert.match(repoSource, /prepare-sequence-animatic-scene-board/)
  assert.match(functionSource, /sequenceAnimaticSceneBoardPrepRuns/)
  assert.match(functionSource, /action === 'cancel'/)
  const sceneBoardCanvasSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/scene-board/SceneBoardCanvas.tsx'), 'utf8')
  assert.match(sceneBoardCanvasSource, /workflowPrepStage/)
  assert.match(sceneBoardCanvasSource, /workflowPrepRun/)
  assert.match(sceneBoardCanvasSource, /const run = graphRun \?\? localRun \?\? persistedRun/)
  assert.match(sceneBoardCanvasSource, /\|\| \(continuityPrepRunActive && !continuityPrepRunFailed\)/)
})

test('sequence animatic coverage intent batches support fresh scene board coverage grids', () => {
  const request = sequenceAnimaticShotCoverageIntentEnsureRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    masterRequestId: 'request-master',
    sceneId: 'scene_001',
    setId: 'set_marsh',
    zoneId: 'zone_path',
    shotIds: ['shot_001', 'shot_002'],
  })
  assert.deepEqual(request.shotIds, ['shot_001', 'shot_002'])

  const graph = buildSequenceAnimaticShotCoverageIntentWorkflowGraph({
    workflowId: 'workflow-coverage-intent',
    draftId: 'draft-1',
    commonConfig: {
      masterRequestId: 'request-master',
      sceneId: 'scene_001',
      setId: 'set_marsh',
      zoneId: 'zone_path',
      coverageIntentBatchId: 'batch-1',
      sourceHash: 'hash-intent',
    },
    intentBatch: {
      id: 'batch-1',
      sceneId: 'scene_001',
      setId: 'set_marsh',
      zoneId: 'zone_path',
      shotIds: ['shot_001', 'shot_002'],
      sourceHash: 'hash-intent',
    },
    shots: [
      { id: 'shot_001', title: 'Shot 1', action: 'Kaji crosses the reeds.', camera: { framing: 'wide' } },
      { id: 'shot_002', title: 'Shot 2', action: 'Rin turns toward bells.', camera: { framing: 'medium' } },
    ],
    assetPack: { entities: [] },
  })
  const nodeKeys = new Set(graph.nodes.map((node) => node.key))
  assert.ok(nodeKeys.has('coverage_intent_input'))
  assert.ok(nodeKeys.has('coverage_intent_plan'))
  assert.ok(nodeKeys.has('coverage_intent_artifact'))
  assert.match(JSON.stringify(graph.edges), /coverage_intent_plan/)

  const parsed = sequenceAnimaticShotCoverageIntentEnsureResponseSchema.parse({
    ok: true,
    masterRequest: {
      id: 'request-master',
      projectId: 'project-1',
      draftId: 'draft-1',
      parentRequestId: null,
      workflowId: 'workflow-master',
      latestRunId: null,
      requestedBy: null,
      sourceSurface: 'wiki_sequence_unit',
      prompt: '',
      title: 'Master',
      intent: 'output_generation',
      outputKind: 'cinematic_episode',
      status: 'awaiting_confirmation',
      selectedEntityKeys: [],
      selectedSequenceUnitKeys: [],
      pageCount: null,
      targetFormat: 'video',
      plannerNotes: '',
      errorMessage: null,
      metadata: { screenplayAnimaticRole: 'master' },
      createdAt: '',
      updatedAt: '',
    },
    intentRequest: {
      id: 'request-intent',
      projectId: 'project-1',
      draftId: 'draft-1',
      parentRequestId: 'request-master',
      workflowId: 'workflow-coverage-intent',
      latestRunId: null,
      requestedBy: null,
      sourceSurface: 'wiki_sequence_unit',
      prompt: '',
      title: 'Coverage Directions',
      intent: 'output_generation',
      outputKind: 'cinematic_episode',
      status: 'awaiting_confirmation',
      selectedEntityKeys: [],
      selectedSequenceUnitKeys: [],
      pageCount: null,
      targetFormat: 'markdown',
      plannerNotes: '',
      errorMessage: null,
      metadata: { screenplayAnimaticRole: 'coverage_intent_batch' },
      createdAt: '',
      updatedAt: '',
    },
    workflow: null,
    nodes: [],
    edges: [],
    coverageIntentByShotId: {
      shot_001: {
        shotId: 'shot_001',
        sceneId: 'scene_001',
        setId: 'set_marsh',
        zoneId: 'zone_path',
        coverageIntent: 'Wide establishing coverage.',
      },
    },
    cacheStatus: 'created',
    sceneId: 'scene_001',
    shotIds: ['shot_001', 'shot_002'],
  })
  assert.equal(parsed.coverageIntentByShotId.shot_001.coverageIntent, 'Wide establishing coverage.')

  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const workflowFactorySource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/sequence-animatic-workflow-factory.ts'), 'utf8')
  const sceneBoardWorkflowSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/sequence-animatic-scene-board-workflows.ts'), 'utf8')
  const plannerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/sequence-animatic-scene-board-child-planners.ts'), 'utf8')
  const ensureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-shot-coverage-intents/index.ts'), 'utf8')
  const zoneEnsureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-zone-coverage-boards/index.ts'), 'utf8')
  const pageSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')

  assert.doesNotMatch(workflowFactorySource, /llm_structured/)
  assert.doesNotMatch(workflowFactorySource, /resourceClass:\s*['"]text['"]/)
  assert.match(sceneBoardWorkflowSource, /resourceClass:\s*['"]llm['"], groupKey: ['"]sequence_animatic_zone_coverage_board_brief/)
  assert.match(sceneBoardWorkflowSource, /resourceClass:\s*['"]llm['"], groupKey: ['"]sequence_animatic_coverage_intent_plan/)
  assert.match(workerSource, /sequence_animatic_coverage_intent_plan/)
  assert.match(workerSource, /coverageIntentByShotId/)
  assert.match(workerSource, /sequenceAnimaticZoneCoverageRegistry/)
  assert.match(ensureSource, /planSceneBoardCoverageIntentChildren/)
  assert.match(ensureSource, /ensureChildWorkflow/)
  assert.match(plannerSource, /coverageIntentBatchId/)
  assert.doesNotMatch(ensureSource, /buildSequenceAnimaticShotCoverageIntentWorkflowGraph/)
  assert.doesNotMatch(ensureSource, /sequenceAnimaticStableHash/)
  assert.match(zoneEnsureSource, /coverageCellByShotId/)
  assert.match(zoneEnsureSource, /planSceneBoardZoneCoverageGridChildren/)
  assert.match(zoneEnsureSource, /ensureChildWorkflow/)
  assert.doesNotMatch(zoneEnsureSource, /buildSequenceAnimaticZoneCoverageBoardWorkflowGraph/)
  assert.doesNotMatch(zoneEnsureSource, /coverageIntent: asRecord/)
  assert.match(pageSource, /coverage_directions/)
  assert.match(pageSource, /startSequenceAnimaticCoverageIntentRuns/)
  assert.match(pageSource, /Planning coverage/)
  assert.match(pageSource, /Coverage direction ready/)
})

test('prompt-created cinematics can use screenplay animatic master mode', () => {
  const plan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic where Ava argues with Bram in the observatory.',
    targetFormat: 'video',
    selectedEntityKeys: ['hero'],
    cinematicPipelineVersion: 'v3_script_storyboards',
    cinematicAnimaticMode: 'prompt_cinematic_master',
    snapshot,
  }, 'cinematic_episode')

  const screenplayNode = plan.nodes.find((node) => readConfigPurpose(node) === 'cinematic_v3_screenplay_author')
  const fanoutNode = plan.nodes.find((node) => readConfigPurpose(node) === 'cinematic_v3_dynamic_shot_parse_fanout')
  const scenePackageNode = plan.nodes.find((node) => readConfigPurpose(node) === 'sequence_animatic_scene_graph_assignment')
  const sceneRegisterNode = plan.nodes.find((node) => readConfigPurpose(node) === 'sequence_animatic_scene_register')
  const directorNode = plan.nodes.find((node) => readConfigPurpose(node) === 'sequence_animatic_director_plan')
  const manifestNode = plan.nodes.find((node) => readConfigPurpose(node) === 'sequence_animatic_manifest')
  const orchestratorNode = plan.nodes.find((node) => readConfigPurpose(node) === 'sequence_animatic_orchestrator')

  assert.equal(screenplayNode?.config.cinematicAnimaticMode, 'prompt_cinematic_master')
  assert.equal(screenplayNode?.config.maxShotCount, 150)
  assert.equal(fanoutNode, undefined)
  assert.equal(scenePackageNode?.config.cinematicAnimaticMode, 'prompt_cinematic_master')
  assert.equal(scenePackageNode?.config.maxShotCount, 150)
  assert.equal(sceneRegisterNode?.config.autoStartFirstScene, true)
  assert.equal(directorNode, undefined)
  assert.equal(manifestNode, undefined)
  assert.equal(orchestratorNode, undefined)
  assert.ok(plan.diagnostics.some((line) => line.includes('Prompt cinematic screenplay animatic mode')))
  assert.ok(plan.diagnostics.some((line) => line.includes('scene-graph assignment mode')))

  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const startOutputRequestSource = readFileSync(resolve(repoRoot, 'supabase/functions/start-output-request/index.ts'), 'utf8')
  const ensureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-block-workflows/index.ts'), 'utf8')
  const outputsSource = readFileSync(resolve(repoRoot, 'src/features/outputs/OutputsWorkspace.tsx'), 'utf8')

  assert.match(workerSource, /cinematicAnimaticMode === 'prompt_cinematic_master'/)
  assert.match(workerSource, /screenplayAnimaticRole: screenplayAnimaticMasterMode \? 'master'/)
  assert.match(startOutputRequestSource, /promptCinematicAnimaticMasterRequest/)
  assert.match(startOutputRequestSource, /screenplayAnimaticSource/)
  assert.match(ensureSource, /readScreenplayAnimaticRole/)
  assert.match(ensureSource, /screenplayAnimaticSource/)
  assert.match(outputsSource, /cinematicAnimaticMode: 'prompt_cinematic_master'/)
  assert.match(outputsSource, /is-animatic-timeline/)
  assert.match(outputsSource, /isScreenplayAnimaticMasterRequest\(request\)/)
})

test('sequence animatic continuity anchors are planned, extracted, and passed to child workflows', () => {
  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const ensureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-block-workflows/index.ts'), 'utf8')
  const deriveSource = readFileSync(resolve(repoRoot, 'supabase/functions/derive-sequence-animatic-continuity-block/index.ts'), 'utf8')
  const deriveStructureSource = readFileSync(resolve(repoRoot, 'supabase/functions/derive-sequence-animatic-continuity-structure/index.ts'), 'utf8')
  const worldGraphSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  const agentsSource = readFileSync(resolve(repoRoot, 'AGENTS.md'), 'utf8')

  assert.match(workerSource, /collectSequenceAnimaticContinuityAnchors/)
  assert.match(workerSource, /function readArray\(value: unknown\): unknown\[\]/)
  assert.doesNotMatch(workerSource, /readArray\(fallbackPlan\.anchors\)/)
  assert.match(workerSource, /buildSequenceAnimaticContinuityPlannerContext/)
  assert.match(workerSource, /sequenceAnimaticContinuityPlannerSpatialRecord/)
  assert.match(workerSource, /const shotDescription = compactSequenceAnimaticText\(shot\.description \?\? shot\.action \?\? shot\.caption, 1200\)/)
  assert.match(workerSource, /sequenceAnimaticContinuityPropHasInteractionEvidence/)
  assert.match(workerSource, /without multi-shot action or character-interaction evidence/)
  assert.match(workerSource, /function buildSequenceAnimaticReferenceCatalog/)
  assert.match(workerSource, /animaticReferenceCatalog/)
  assert.match(workerSource, /selectedVisualReferenceKeys/)
  assert.match(workerSource, /context__sequence_manifest/)
  assert.match(workerSource, /continuityPlannerContext/)
  assert.match(workerSource, /continuity_planner_context/)
  assert.match(workerSource, /Use the compact planner context as the truth source/)
  assert.match(workerSource, /Treat existingWorldReferences and every shot\.resolvedRefs entry as canonical/)
  assert.match(workerSource, /specific visible one-shot incidental characters/)
  assert.match(workerSource, /Accept a prop only when it appears in at least two shots/)
  assert.match(workerSource, /Every named object, mechanism, door\/hatch, gauge, clock part, tube, valve, lever, clamp, tool, panel, note, map, or set-piece that appears in two or more shots must appear either in assetAnchors or rejectedCandidates/)
  assert.match(workerSource, /sequenceAnimaticContinuityAnchorFromRejectedCandidate/)
  assert.match(workerSource, /sequenceAnimaticShouldKeepSingleUseTemporaryCharacter/)
  assert.match(workerSource, /Recovered \$\{acceptedRejectedCandidateKeys\.size\} visible one-shot incidental character/)
  assert.match(workerSource, /sequenceAnimaticContinuityLocationNodeLooksCharacterDerived/)
  assert.match(workerSource, /sequenceAnimaticContinuityLocationNodeLooksShotTitleDerived/)
  assert.match(workerSource, /sanitizeSequenceAnimaticContinuityBlockDeltaSpatialNodes/)
  assert.match(workerSource, /looked like character\/action labels instead of physical locations/)
  assert.match(workerSource, /Never put setId, zoneId, primarySpotId, spotIds, viewpointId, or angleId into continuityAnchorIds/)
  assert.match(workerSource, /sequenceAnimaticContinuitySafePhysicalLabel/)
  assert.match(workerSource, /sequenceAnimaticGraphZoneSeed/)
  assert.match(workerSource, /resolvedRefs/)
  assert.match(workerSource, /unresolvedShotRefs/)
  const continuityPromptSource = workerSource.slice(
    workerSource.indexOf('const continuityPrompt = ['),
    workerSource.indexOf('let result: Awaited<ReturnType<typeof runCinematicV2StructuredNodeBackground'),
  )
  assert.doesNotMatch(continuityPromptSource, /screenplayMarkdown/)
  assert.match(continuityPromptSource, /compactForPrompt\(\{ continuityPlannerContext \}, 16_000\)/)
  assert.match(workerSource, /runCinematicV2StructuredNode/)
  assert.match(workerSource, /planningMode: 'llm_structured_v2'/)
  assert.match(workerSource, /deterministic fallback is disabled/)
  assert.match(workerSource, /sequenceAnimaticAbstractContinuityTerms/)
  assert.match(workerSource, /'rain'/)
  assert.match(workerSource, /existing_world_entity/)
  assert.match(workerSource, /shotContinuityMap/)
  assert.match(workerSource, /sequence_animatic_continuity_graph_v2/)
  assert.match(workerSource, /sequence_animatic_continuity_global_plan/)
  assert.match(workerSource, /sequence_animatic_continuity_global_merge/)
  assert.match(workerSource, /sequenceAnimaticContinuityCoverage/)
  assert.match(workerSource, /sequenceAnimaticSeededBlockStatesFromCoverage/)
  assert.match(workerSource, /sequence_animatic_continuity_block_plan/)
  assert.match(workerSource, /sequence_animatic_continuity_block_merge/)
  assert.match(workerSource, /sequence_animatic_continuity_structure_artifact/)
  assert.match(workerSource, /sequenceAnimaticContinuityBlockStatesFromGraph/)
  assert.match(workerSource, /worldLocationRefId/)
  assert.match(workerSource, /continuitySetId/)
  assert.match(workerSource, /continuityZoneId/)
  assert.match(workerSource, /continuityAngleId/)
  assert.match(workerSource, /spatialContinuity/)
  assert.match(workerSource, /shotBindings/)
  assert.match(workerSource, /locationSets/)
  assert.match(workerSource, /locationAngles/)
  assert.match(workerSource, /sceneGraph/)
  assert.match(workerSource, /sequence_animatic_character_anchor_atlas/)
  assert.match(workerSource, /sequence_animatic_prop_anchor_atlas/)
  assert.match(workerSource, /sequence_animatic_location_anchor_atlas/)
  assert.match(workerSource, /sequence_animatic_character_anchor_extract/)
  assert.match(workerSource, /sequence_animatic_prop_anchor_extract/)
  assert.match(workerSource, /sequence_animatic_location_anchor_extract/)
  assert.match(workerSource, /verifySequenceAnimaticAnchorCrop/)
  assert.match(workerSource, /extraction count mismatch/)
  assert.match(workerSource, /sequenceAnimaticArtifactRole: anchorType === 'character' \? 'sequence_animatic_character_anchor'/)
  assert.match(workerSource, /characterAnchors/)
  assert.match(workerSource, /temporaryCharacterShotIds/)
  assert.match(workerSource, /continuityAnchorIds: anchorIds/)
  assert.match(workerSource, /readStringArray\(rawShot\.continuityAnchorIds\)\.forEach\(addKey\)/)
  assert.match(ensureSource, /assetPackWithContinuityAnchors/)
  assert.match(ensureSource, /shotBindings/)
  assert.match(ensureSource, /readStringArray\(block\.continuityAnchorIds\)/)
  assert.match(ensureSource, /readStringArray\(shot\.continuityAnchorIds\)/)
  assert.doesNotMatch(ensureSource, /readText\(asRecord\(shotBindings\[scopeId\]\)\.zoneId\)/)
  assert.doesNotMatch(ensureSource, /readStringArray\(asRecord\(shotBindings\[scopeId\]\)\.spotIds\)/)
  assert.doesNotMatch(ensureSource, /readText\(asRecord\(shotBindings\[scopeId\]\)\.angleId\)/)
  assert.match(worldGraphSource, /manifestContinuityAnchors/)
  assert.match(worldGraphSource, /continuityAnchors\.characters/)
  assert.match(worldGraphSource, /shot\.continuityAnchorIds/)
  assert.match(worldGraphSource, /continuityAnchorById\.has\(value\)/)
  assert.match(worldGraphSource, /spatialContinuityLabel/)
  assert.match(worldGraphSource, /Spatial binding needs review/)
  assert.ok(worldGraphSource.indexOf('const entity = animaticRefLookupAliases(cleanRefId)') < worldGraphSource.indexOf('const anchor = animaticRefLookupAliases(cleanRefId)'))
  assert.match(worldGraphSource, /continuityGraphV2/)
  assert.match(worldGraphSource, /onDeriveSequenceAnimaticContinuityBlock/)
  assert.match(worldGraphSource, /onDeriveSequenceAnimaticContinuityStructure/)
  assert.match(worldGraphSource, /Generate continuity structure/)
  assert.match(worldGraphSource, /Fill continuity gaps/)
  assert.match(worldGraphSource, /Continuity seeded/)
  assert.match(worldGraphSource, /continuityBlockStatusLabel/)
  assert.match(worldGraphSource, /Derive continuity/)
  assert.match(deriveSource, /derive_continuity_block/)
  assert.match(deriveSource, /sequence_animatic_continuity_structure_artifact/)
  assert.match(deriveSource, /targetNodeKeys/)
  assert.match(deriveSource, /forceNodeKeys: \['continuity_input', planNodeKey, mergeNodeKey, structureNodeKey\]\.filter\(Boolean\)/)
  assert.match(deriveStructureSource, /derive_continuity_structure/)
  assert.match(deriveStructureSource, /continuity_global_structure/)
  assert.match(deriveStructureSource, /forceNodeKeys: \['continuity_input', 'continuity_seed_graph', 'continuity_global_plan', 'continuity_global_merge', 'continuity_global_structure'\]/)
  assert.deepEqual(sequenceAnimaticContinuityStructureDeriveRequestSchema.parse({
    projectId: 'project',
    draftId: 'draft',
    masterRequestId: 'master',
  }).mode, 'generate')
  assert.equal(sequenceAnimaticContinuityStructureDeriveResponseSchema.parse({
    ok: true,
    masterRequest: {
      id: 'master',
      projectId: 'project',
      draftId: 'draft',
      prompt: '',
      sourceSurface: 'wiki',
      targetFormat: 'video',
      status: 'completed',
      workflowId: null,
      latestRunId: null,
      selectedEntityKeys: [],
      selectedSequenceUnitKeys: [],
      metadata: {},
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      errorMessage: null,
    },
    continuityRequest: {
      id: 'continuity',
      projectId: 'project',
      draftId: 'draft',
      prompt: '',
      sourceSurface: 'wiki',
      targetFormat: 'video',
      status: 'running',
      workflowId: 'workflow',
      latestRunId: null,
      selectedEntityKeys: [],
      selectedSequenceUnitKeys: [],
      metadata: {},
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      errorMessage: null,
    },
    run: null,
    globalStructureState: { status: 'deriving' },
    coverage: { totalShots: 2, boundShots: 1 },
  }).coverage.boundShots, 1)
  assert.match(agentsSource, /Sequence animatic continuity anchors are output-local references/)
  assert.match(agentsSource, /animaticReferenceCatalog/)
})

test('sequence animatic production hardening uses atomic ensures, signal refresh, and background continuity planning', () => {
  const migrationSource = readFileSync(resolve(repoRoot, 'supabase/migrations/20260518181946_sequence_animatic_atomic_child_ensure.sql'), 'utf8')
  const blockEnsureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-block-workflows/index.ts'), 'utf8')
  const continuityEnsureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-continuity-workflow/index.ts'), 'utf8')
  const repositorySource = readFileSync(resolve(repoRoot, 'src/data/graphcoreRepository.ts'), 'utf8')
  const worldGraphSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const graphSource = readFileSync(resolve(repoRoot, 'supabase/functions/get-output-workflow-graph/index.ts'), 'utf8')
  const nodeOutputSource = readFileSync(resolve(repoRoot, 'supabase/functions/get-output-workflow-node-output/index.ts'), 'utf8')

  assert.match(migrationSource, /create or replace function public\.ensure_sequence_animatic_child_workflow/)
  assert.match(migrationSource, /on conflict \(draft_id, key\) do update/)
  assert.match(migrationSource, /on conflict \(workflow_id, key\) do update/)
  assert.match(migrationSource, /exception when unique_violation/)
  assert.match(migrationSource, /refresh_output_request_status_projection\(ensured_request\.id\)/)
  assert.match(migrationSource, /grant execute on function public\.ensure_sequence_animatic_child_workflow/)

  assert.match(blockEnsureSource, /ensure_sequence_animatic_child_workflow/)
  assert.match(blockEnsureSource, /p_role: 'storyboard_block'/)
  assert.match(blockEnsureSource, /p_role: 'shot_video'/)
  assert.match(blockEnsureSource, /sequence animatic storyboard block ensure rpc completed/)
  assert.match(blockEnsureSource, /sequence animatic shot ensure rpc completed/)
  assert.match(continuityEnsureSource, /ensure_sequence_animatic_child_workflow/)
  assert.match(continuityEnsureSource, /p_role: 'continuity_pack'/)
  assert.match(continuityEnsureSource, /sequence animatic continuity ensure rpc completed/)

  assert.match(repositorySource, /subscribeSequenceAnimaticStateSignals/)
  assert.match(repositorySource, /output_workflow_run_steps/)
  assert.match(repositorySource, /output_request_status_projections/)
  assert.match(worldGraphSource, /onSubscribeSequenceAnimaticStateSignals/)
  assert.match(worldGraphSource, /eventType === 'shot_streamed'/)
  assert.match(worldGraphSource, /scheduleRefresh\(2200\)/)
  assert.match(worldGraphSource, /scheduleRefresh\(appliedLive \? 900 : 400\)/)
  assert.match(worldGraphSource, /window\.setInterval\(\(\) =>/)
  assert.doesNotMatch(worldGraphSource, /setInterval\(refresh, 2500\)/)

  assert.match(workerSource, /runCinematicV2StructuredNodeBackground\({[\s\S]*schemaName: 'sequence_animatic_continuity_plan_v2'/)
  assert.match(workerSource, /const directShotPlan = readFirstUpstreamRecord\(input\.upstream, \['shotPlan', 'shot_plan'\]\)/)
  assert.match(workerSource, /Array\.isArray\(directShotPlan\.shots\) && directShotPlan\.shots\.length > 0/)
  assert.match(workerSource, /priorProviderRequestId: readText\(input\.priorStep\?\.providerRequestId\)/)
  assert.match(workerSource, /plannerFallbackReason/)
  assert.match(workerSource, /continuityPlanner: true/)
  assert.match(graphSource, /output workflow graph unchanged/)
  assert.match(graphSource, /output workflow graph hydrated/)
  assert.match(nodeOutputSource, /selected node output hydrated/)
})

test('cinematic V3 dynamically materialized storyboard nodes resolve strict guidance skills', () => {
  const nodes = [
    {
      nodeType: 'image_generation',
      purpose: 'cinematic_v3_storyboard_sheet',
      skillKeys: [
        'cinematic_beat_sheet_planning',
        'storyboard_panel_accuracy',
        'image_prompt_visual_only',
        'entity_reference_fidelity',
        'character_reference_continuity',
        'provider_prompt_hygiene',
      ],
    },
    {
      nodeType: 'video_generation',
      purpose: 'cinematic_v3_storyboard_group_video',
      skillKeys: [
        'seedance_reference_video_prompting',
        'seedance_truth_source_modes',
        'cinematic_shot_direction',
        'provider_prompt_hygiene',
      ],
    },
  ] as const

  for (const node of nodes) {
    const bundle = buildOutputGuidanceBundleForNode({
      node: {
        nodeType: node.nodeType,
        config: {
          purpose: node.purpose,
          skillKeys: [...node.skillKeys],
          guidanceMode: 'strict',
        },
        inputs: {},
      },
    })

    assert.deepEqual(bundle.diagnostics, [], `${node.purpose} should accept all configured V3 dynamic skills`)
    assert.ok(bundle.skills.length >= node.skillKeys.length)
  }
})

test('cinematic V3 authoring uses creative screenplay with shot markers', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')

  assert.match(source, /Write the cinematic source screenplay before technical parsing happens/)
  assert.match(source, /#shot short visual beat title \| ~3s/)
  assert.match(source, /Do not number shot anchors/)
  assert.match(source, /system assigns stable shot_001, shot_002/)
  assert.match(source, /#shot\b/)
  assert.match(source, /Shot markers are structural anchors only/)
  assert.match(source, /Do not turn the script into JSON/)
  assert.match(source, /scriptContract: 'screenplay_with_shot_markers_v1'/)
  assert.doesNotMatch(source, /Create a lightweight visual shot script/)
})

test('cinematic V3 shot parse fanout uses screenplay groups and background OpenAI', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const skillsSource = readFileSync(resolve(repoRoot, 'src/domain/outputSkills.ts'), 'utf8')
  const breakBlock = source.slice(source.indexOf("if (purpose === 'cinematic_v3_shot_break_plan')"), source.indexOf("if (purpose === 'cinematic_v2_storyboard_group_plan'"))
  const parseBlock = source.slice(source.indexOf("if (purpose === 'cinematic_v3_shot_parse_group')"), source.indexOf("if (purpose === 'cinematic_v3_shot_parse')"))

  assert.match(source, /function buildCinematicV3ShotBreakPlan/)
  assert.match(source, /function materializeDynamicCinematicV3ShotParseFanout/)
  assert.match(breakBlock, /maxDurationPerGroupSeconds/)
  const materializerBlock = source.slice(
    source.indexOf('async function materializeDynamicCinematicV3ShotParseFanout'),
    source.indexOf('async function materializeDynamicCinematicV2ShotFanout'),
  )
  assert.match(materializerBlock, /cinematic_v3_storyboard_prompt/)
  assert.match(materializerBlock, /cinematic_v3_storyboard_sheet/)
  assert.match(materializerBlock, /cinematic_v3_panel_extract/)
  assert.doesNotMatch(materializerBlock, /cinematic_v3_shot_plan_merge/)
  assert.doesNotMatch(materializerBlock, /purpose: 'cinematic_v3_dynamic_storyboard_fanout'/)
  assert.match(parseBlock, /runCinematicV2StructuredNodeBackground/)
  assert.doesNotMatch(parseBlock, /runCinematicV2StructuredNode\(\{/)
  assert.match(parseBlock, /Screenplay excerpt for this block/)
  assert.match(parseBlock, /Preferred shot IDs in order/)
  assert.match(skillsSource, /cinematic_directorial_language[\s\S]*cinematic_v3_shot_parse_group/)
  assert.match(skillsSource, /cinematic_shot_direction[\s\S]*cinematic_v3_shot_parse_group/)
  assert.match(skillsSource, /provider_prompt_hygiene[\s\S]*cinematic_v3_shot_parse_group/)
})

test('cinematic V3 background repair reuses provider request ids instead of duplicate foreground calls', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')

  assert.match(source, /function runCinematicV2StructuredNodeBackground/)
  assert.match(source, /createOpenAiBackgroundResponse/)
  assert.match(source, /retrieveOpenAiResponse\(input\.priorProviderRequestId/)
  assert.match(source, /graphcore_provider_mode: 'background'/)
  assert.match(source, /providerMode: 'background'/)
  assert.match(source, /cancelOpenAiResponse/)
  assert.match(source, /isTransientOpenAiResponseStatus/)
  assert.match(source, /poll_retry_\$\{result\.response\.status\}/)
  assert.match(source, /openAiResponseRetryDelayMs/)
})

test('cinematic V2 shot asset packs narrow references to visible shot refs', async (t) => {
  const imported = await importSharedOutputWorkflow<{
    buildCinematicV2ShotAssetPack: (input: {
      assetPack: Record<string, unknown>
      referencePlan: Record<string, unknown>
      shot: Record<string, unknown>
      maxEntityCount?: number
      maxAssetKeysPerEntity?: number
    }) => { entities: Array<Record<string, unknown>>, shotReferenceKeys: string[] }
  }>(t)
  if (!imported) return
  const { buildCinematicV2ShotAssetPack } = imported

  const shotPack = buildCinematicV2ShotAssetPack({
    assetPack: {
      entities: [
        { key: 'ilya', name: 'Ilya Sorin', type: 'actor', assetKeys: ['ilya-sheet', 'ilya-icon'] },
        { key: 'anya', name: 'Anya Sorin', type: 'actor', assetKeys: ['anya-sheet'] },
        { key: 'checkpoint', name: 'Compliance Checkpoint', type: 'place', assetKeys: ['checkpoint-sheet'] },
        { key: 'aster', name: 'Aster Hologram', type: 'concept', assetKeys: ['aster-sheet'] },
      ],
      missingReferenceEntityKeys: [],
    },
    referencePlan: {
      primaryCastRefIds: ['ilya', 'anya'],
      supportingCastRefIds: [],
      locationRefIds: ['checkpoint'],
      propRefIds: [],
      conceptRefIds: [],
      continuityAnchorRefIds: ['aster'],
      rejectedRefs: [],
      rationale: 'Test',
      confidence: 0.9,
    },
    shot: {
      id: 'shot_1',
      sceneId: 'scene_1',
      index: 1,
      title: 'Ilya at the checkpoint',
      purpose: 'reaction',
      editorialDurationSeconds: 2,
      providerDurationSeconds: 4,
      description: 'Ilya freezes at the compliance checkpoint.',
      action: 'Ilya looks across the checkpoint barrier.',
      dialogue: [],
      speakerRefIds: [],
      visibleCharacterRefIds: ['ilya'],
      locationRefId: 'checkpoint',
      propRefIds: [],
      continuityInputs: [],
      camera: { framing: 'medium close', angle: 'eye level', lens: '50mm', movement: 'locked', screenDirectionRule: 'Ilya looks screen-right.' },
      requiresLipSync: false,
      status: 'planned',
    },
    maxEntityCount: 6,
  })

  const keys = shotPack.entities.map((entity) => String(entity.key))
  assert.deepEqual(keys, ['ilya', 'checkpoint'])
  assert.ok(!keys.includes('anya'))
  assert.ok(!keys.includes('aster'))
})

test('cinematic V3 shot parse repairs missing visual refs before validation and manifest assembly', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const mentionBlock = source.slice(source.indexOf('function entityMentionedInShotText'), source.indexOf('export function buildCinematicV2ShotAssetPack'))
  const parseGroupBlock = source.slice(source.indexOf("if (purpose === 'cinematic_v3_shot_parse_group')"), source.indexOf("if (purpose === 'cinematic_v3_shot_parse')"))
  const parseBlock = source.slice(source.indexOf("if (purpose === 'cinematic_v3_shot_parse')"), source.indexOf("if (purpose === 'cinematic_v2_parsed_script')"))
  const manifestBlock = source.slice(source.indexOf("if (purpose === 'sequence_animatic_manifest')"), source.indexOf("if (purpose === 'sequence_animatic_block_input')"))

  assert.match(source, /export function repairCinematicV2ShotPlanVisualReferences/)
  assert.match(mentionBlock, /selectedReferenceVariantLabel/)
  assert.match(mentionBlock, /storyboardPanelPrompt/)
  assert.match(mentionBlock, /videoDirection/)
  assert.match(mentionBlock, /Repaired prop reference/)
  assert.match(mentionBlock, /Repaired location reference/)
  assert.match(parseGroupBlock, /repairCinematicV2ShotPlanVisualReferences[\s\S]*validateCinematicV2ShotPlanReferences/)
  assert.match(parseBlock, /repairCinematicV2ShotPlanVisualReferences[\s\S]*validateCinematicV2ShotPlanReferences/)
  assert.match(manifestBlock, /directorPlan[\s\S]*deterministic-sequence-animatic-director-manifest-v1/)
  assert.match(manifestBlock, /mergeCinematicV3ShotPlansForTimeline[\s\S]*buildSequenceAnimaticShotPlanFromBreaks[\s\S]*repairCinematicV2ShotPlanVisualReferences/)
})

test('sequence animatic shot videos use cropped panel keyframe mini graphs', () => {
  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const ensureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-block-workflows/index.ts'), 'utf8')
  const factorySource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/sequence-animatic-workflow-factory.ts'), 'utf8')
  const skillsSource = readFileSync(resolve(repoRoot, 'src/domain/outputSkills.ts'), 'utf8')
  const worldGraphSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  const graphHostSource = readFileSync(resolve(repoRoot, 'src/features/outputs/OutputGraphOverlayHost.tsx'), 'utf8')
  const flyWorkerSource = readFileSync(resolve(repoRoot, 'workers/world-generation/main.ts'), 'utf8')

  assert.match(ensureSource, /sequenceAnimaticMode === 'shot_video'/)
  assert.match(factorySource, /shot_input[\s\S]*shot_video_prompt[\s\S]*shot_video/)
  assert.match(ensureSource, /role: 'cinematic_v2_shot_keyframe'/)
  assert.match(workerSource, /purpose === 'sequence_animatic_shot_input'/)
  assert.match(workerSource, /purpose === 'sequence_animatic_shot_video_prompt'/)
  assert.match(workerSource, /sequence_animatic_shot_video/)
  assert.match(workerSource, /const isSequenceAnimaticShotVideo = readText\(config\.purpose\) === 'sequence_animatic_shot_video'/)
  assert.doesNotMatch(workerSource, /isSequenceAnimaticShotVideoConfig/)
  assert.match(workerSource, /const requestedDurationSeconds = Math\.max\(4, Math\.min\(15, rawRequestedDurationSeconds\)\)/)
  assert.match(workerSource, /Treat @Image1 as the cropped shot keyframe reference/)
  assert.match(workerSource, /shot video generation requires the cropped shot panel as @Image1/)
  assert.match(workerSource, /includeSpeakerRefs: false/)
  assert.match(workerSource, /offscreenSpeakerVisualReferencesExcluded: true/)
  assert.match(workerSource, /visualReferencePolicy: 'visible_characters_location_props_only'/)
  assert.match(workerSource, /seedanceDirectedControlsSchema/)
  assert.match(workerSource, /buildCompactSeedanceVideoPrompt/)
  assert.match(workerSource, /\[DIRECTED CONTROLS\]/)
  assert.match(workerSource, /directedControls: timing\.directedControls/)
  assert.match(workerSource, /No music, score, audio bed, room tone, crowd wash, or background ambience/)
  assert.match(workerSource, /audioPolicy: 'dialogue_and_direct_diegetic_sfx_only'/)
  assert.match(workerSource, /Voice:/)
  assert.match(workerSource, /Performance:/)
  assert.match(workerSource, /sequenceAnimaticShotVideoTimingSchema/)
  assert.match(workerSource, /Ignore any screenplay marker or existing tagged duration/)
  assert.match(workerSource, /ignoredTaggedShotTiming: true/)
  assert.match(workerSource, /MUAPI_VIDEO_PROMPT_MAX_CHARS = 4000/)
  assert.match(workerSource, /compactSeedancePromptForProvider/)
  assert.doesNotMatch(workerSource, /purpose === 'sequence_animatic_shot_video_prompt'[\s\S]{0,5000}storyboard group/)
  assert.match(worldGraphSource, /run\?\.status === 'failed' \|\| run\?\.status === 'cancelled'/)
  assert.doesNotMatch(worldGraphSource, /function sequenceAnimaticRequestIsActive[\s\S]{0,220}outputWorkflowRunHasFailedExecution\(run\)/)
  assert.match(worldGraphSource, /ACTIVE_SEQUENCE_ANIMATIC_STATUSES = new Set\(\['queued', 'planning', 'running'\]\)/)
  assert.doesNotMatch(worldGraphSource, /ACTIVE_SEQUENCE_ANIMATIC_STATUSES = new Set\(\[[^\]]*'awaiting_confirmation'/)
  assert.match(worldGraphSource, /!run && \(effectiveStatus === 'queued' \|\| effectiveStatus === 'awaiting_confirmation'\)/)
  assert.match(worldGraphSource, /readLooseArray\(metadata\.targetNodeIds\)/)
  assert.match(worldGraphSource, /sequence_animatic_continuity_asset_batch[\s\S]{0,260}assetStateByNodeId/)
  assert.match(worldGraphSource, /status === 'generating' && \(requestTerminal \|\| TERMINAL_SEQUENCE_ANIMATIC_RUN_STATUSES\.has/)
  assert.match(graphHostSource, /previousDisplayRunRef/)
  assert.match(graphHostSource, /lastGoodGraphStateRef/)
  assert.match(graphHostSource, /outputWorkflowStepHasActiveProvider/)
  assert.match(graphHostSource, /step\.status === 'failed' && runIsActive/)
  assert.match(graphHostSource, /workflowRuns = useMemo/)
  assert.match(graphHostSource, /lastGoodGraphStateRef\.current = \{ request, workflow, nodes, edges, displayRun \}/)
  assert.match(graphHostSource, /const targetWorkflowId = targetWorkflow\?\.id \?\? request\?\.workflowId \?\? null/)
  assert.match(graphHostSource, /const shouldUseKnownRevision = loadedGraphNodeCount > 0/)
  assert.match(graphHostSource, /knownGraphRevision: shouldUseKnownRevision \? knownGraphRevision : null/)
  const graphOverlaySource = readFileSync(resolve(repoRoot, 'src/features/outputs/OutputWorkflowGraphOverlay.tsx'), 'utf8')
  assert.match(graphOverlaySource, /sameGraphNodesForReactFlow/)
  assert.match(graphOverlaySource, /sameGraphEdgesForReactFlow/)
  assert.match(graphOverlaySource, /sameGraphNodesForReactFlow\(current, nextNodes\) \? current : nextNodes/)
  assert.match(worldGraphSource, /providerStatus = trimOptionalString\(metadata\.providerStatus\)\.toUpperCase\(\)/)
  assert.match(worldGraphSource, /Submitting shot video request/)
  assert.match(flyWorkerSource, /workerCodeVersion/)
  assert.match(workerSource, /workerBuildVersion/)
  assert.match(skillsSource, /sequence_animatic_shot_video_prompt/)
  assert.match(skillsSource, /sequence_animatic_shot_video/)
})

test('sequence animatic shot revisions have output-local graph contracts and artifacts', () => {
  assert.equal(sequenceAnimaticGraphRoleSchema.parse('shot_revision'), 'shot_revision')
  assert.equal(sequenceAnimaticShotRevisionWorkflowEnsureRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    masterRequestId: 'request-master',
    storyboardBlockId: 'block-1',
    shotId: 'shot_001',
    prompt: 'Change to a low-angle close shot.',
  }).shotId, 'shot_001')
  assert.equal(sequenceAnimaticShotRevisionArtifactV1Schema.parse({
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    screenplayAnimaticRole: 'shot_revision',
    sequenceAnimaticRole: 'shot_revision',
    masterRequestId: 'request-master',
    storyboardBlockId: 'block-1',
    shotId: 'shot_001',
    revisionId: 'revision-1',
    sourceManifestHash: 'manifest-hash',
    basePanelAssetKey: 'panel-asset',
    revisedShot: { id: 'shot_001', action: 'A revised action.' },
    keyframeAssetKey: 'keyframe-asset',
    prompt: 'Change the angle.',
    diagnostics: [],
  }).keyframeAssetKey, 'keyframe-asset')

  const graph = buildSequenceAnimaticShotRevisionWorkflowGraph({
    workflowId: 'workflow-revision',
    draftId: 'draft-1',
    commonConfig: {
      graphSpecVersion: sequenceAnimaticGraphSpecVersion,
      screenplayAnimaticRole: 'shot_revision',
      sequenceAnimaticRole: 'shot_revision',
      masterRequestId: 'request-master',
      parentRequestId: 'request-block',
      storyboardBlockId: 'block-1',
      shotId: 'shot_001',
      manifestHash: 'manifest-hash',
      blockHash: 'block-hash',
      masterManifestArtifactKey: 'manifest-artifact',
    },
    block: { id: 'block-1', shots: [{ id: 'shot_001' }] },
    shot: {
      id: 'shot_001',
      index: 1,
      title: 'First shot',
      action: 'Hero looks up.',
      dialogue: [],
      visibleCharacterRefIds: [],
      speakerRefIds: [],
      propRefIds: [],
      editorialDurationSeconds: 3,
      providerDurationSeconds: 5,
    },
    panel: { assetKey: 'panel-asset', shotId: 'shot_001' },
    assetPack: { entities: [] },
    revisionPrompt: 'Change the camera angle.',
    revisionId: 'revision-1',
    aspectRatio: '16:9',
  })
  const purposes = graph.nodes.map((node) => readConfigPurpose({ config: node.config }))
  assert.deepEqual(purposes, [
    'sequence_animatic_shot_revision_input',
    'sequence_animatic_shot_revision_plan',
    'sequence_animatic_shot_keyframe_prompt',
    'sequence_animatic_shot_keyframe_image',
    'sequence_animatic_shot_revision_artifact',
  ])
  assert.ok(graph.edges.some((edge) => edge.source_node_key === 'shot_revision_plan' && edge.source_port === 'revised_shot' && edge.target_node_key === 'shot_keyframe_prompt'))
  assert.ok(graph.edges.some((edge) => edge.source_node_key === 'shot_revision_input' && edge.source_port === 'base_keyframe' && edge.target_node_key === 'shot_keyframe_image'))
  const revisionPlanContract = getOutputWorkflowNodeContract({ key: 'shot_revision_plan', nodeType: 'utility_transform', config: { purpose: 'sequence_animatic_shot_revision_plan' } })
  assert.equal(revisionPlanContract?.providerBacked, true)
  assert.ok(revisionPlanContract?.producedOutputs.includes('revisedShot'))
  const artifactContract = getOutputWorkflowNodeContract({ key: 'shot_revision_artifact', nodeType: 'output_artifact', config: { purpose: 'sequence_animatic_shot_revision_artifact' } })
  assert.ok(artifactContract?.artifactRoles.includes('sequence_animatic_shot_revision'))

  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const ensureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-shot-revision-workflow/index.ts'), 'utf8')
  const wikiSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  assert.match(workerSource, /sequenceAnimaticShotRevisionPlanSchema/)
  assert.match(workerSource, /Return a complete revised shot object/)
  assert.match(workerSource, /sequence_animatic_shot_keyframe_image/)
  assert.match(workerSource, /sequence_animatic_shot_revision_artifact/)
  assert.match(ensureSource, /sequence_animatic_shot_revision/)
  assert.match(ensureSource, /basePanelAssetKey/)
  assert.match(wikiSource, /wikiAnimatic/)
  assert.match(wikiSource, /Prompt this/)
})

test('explicit retired v1 cinematic pipeline is rejected for new workflow planning', () => {
  assert.throws(() => planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic sequence from Chapter 1 with a shot-by-shot storyboard.',
    targetFormat: 'video',
    selectedSequenceUnitKeys: ['chapter-1'],
    videoBlockCount: 3,
    durationPerBlockSeconds: 8,
    cinematicPipelineVersion: 'v1_take_blocks',
    snapshot,
  }, 'cinematic_episode'), /Legacy cinematic pipelines/)

  const startOutputRequestSource = readFileSync(resolve(repoRoot, 'supabase/functions/start-output-request/index.ts'), 'utf8')
  assert.match(startOutputRequestSource, /Legacy cinematic pipelines v1_take_blocks and v2_shot_orchestration are retired/)
})

test('cinematic authoring uses lean director script and internal execution script', () => {
  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  assert.match(workerSource, /cinematicScriptAuthoringJsonSchemaForPreset/)
  assert.match(workerSource, /directorScriptDoc/)
  assert.match(workerSource, /executionScriptDoc: cinematicScriptDoc/)
  assert.match(workerSource, /cumulativeStart/)
  assert.match(workerSource, /canonicalCinematicEntityKey/)
  assert.match(workerSource, /sanitizeCinematicScriptText/)
  assert.match(workerSource, /Do not include provider refs or execution details/)
  assert.match(workerSource, /no @Image\/@Video\/@Audio labels/)

  const schemaStart = workerSource.indexOf('function cinematicScriptAuthoringJsonSchemaForPreset')
  const schemaEnd = workerSource.indexOf('function normalizeMaybeNullString')
  const schemaSource = workerSource.slice(schemaStart, schemaEnd)
  assert.match(schemaSource, /continuityLock/)
  assert.match(schemaSource, /visualAction/)
  assert.match(schemaSource, /composition/)
  assert.match(schemaSource, /actions/)
  assert.doesNotMatch(schemaSource, /participantRefIds/)
  assert.doesNotMatch(schemaSource, /visualPrompt/)
  assert.doesNotMatch(schemaSource, /compositionGuide/)
  assert.doesNotMatch(schemaSource, /providerRequestId/)
  assert.match(schemaSource, /ugcDirectives/)
})

test('cinematic beat-sheet prompts use distinct clean micro-beat captions', async (t) => {
  const imported = await importSharedOutputWorkflow<{
    buildCinematicBeatSheetPrompt: (input: {
      blockScript: Record<string, unknown>
      assetPack: Record<string, unknown>
      aspectRatio: string
      prompt: string
      guidance: null
    }) => { prompt: string; beatSheetPlan: Record<string, unknown> }
  }>(t)
  if (!imported) return
  const { buildCinematicBeatSheetPrompt } = imported
  const beatSheet = buildCinematicBeatSheetPrompt({
    aspectRatio: '16:9',
    prompt: 'create a cinematic of Ilya running from the civic harmony unit in the underrail warrens',
    guidance: null,
    assetPack: {
      entities: [
        {
          key: 'ilya_sorin',
          name: 'Ilya Sorin',
          summary: 'A gifted maintenance worker forced into rebellion.',
          visualDescription: 'lean young man in worn utility jacket with grease-stained hands',
          visualTraits: ['shaved dark hair', 'tired eyes'],
        },
        {
          key: 'underrail_warrens',
          name: 'Underrail Warrens',
          summary: 'An abandoned transit maze below the city.',
          visualDescription: 'flooded subway tunnels, rusted platforms, hanging work lamps',
          visualTraits: [],
        },
        {
          key: 'underrail_warrens',
          name: 'Underrail Warrens',
          summary: 'Duplicate place anchor that should collapse.',
          visualDescription: 'duplicate visual text',
          visualTraits: [],
        },
      ],
    },
    blockScript: {
      title: 'Take 1',
      durationSeconds: 13,
      shots: [
        {
          id: 'shot_01',
          title: 'Boot splash hook',
          startSeconds: 0,
          endSeconds: 4,
          subject: 'Ilya Sorin, Civic Harmony Bureau, Underrail Warrens',
          beat: 'Ilya slams into frame already running through shin-deep water as red pursuit light sweeps the tunnel behind him.',
          visualAction: 'Ilya charges through a narrow concrete service tunnel, boots exploding water across rusted rails while a rotating red warning glow pulses over wet walls behind him.',
          composition: 'Ilya centered and advancing hard toward camera, tunnel lines compressing behind him, distant pursuit silhouettes briefly visible through spray.',
          actions: [
            { actor: 'Ilya Sorin', verb: 'sprints through', target: 'service tunnel', stagingNotes: 'High-kneed sprint through ankle-deep water.', startSeconds: 0, endSeconds: 4 },
          ],
          audioCues: ['boots slamming through water'],
        },
        {
          id: 'shot_02',
          title: 'The turn through steam',
          startSeconds: 4,
          endSeconds: 9,
          beat: 'He cuts through a side corridor as the unit gains visual contact.',
          visualAction: 'Ilya grabs a pipe brace, whips around a blind corner into a steam-blown maintenance passage, and nearly slips before catching himself on the wall.',
          composition: 'Ilya off-center left entering the turn, steam cloud swallowing mid-frame, red visor lights and a search beam flare into the background corner.',
          actions: [
            { actor: 'Ilya Sorin', verb: 'whips around', target: 'blind corner', stagingNotes: 'He catches himself on the wet concrete wall.', startSeconds: 0, endSeconds: 5 },
          ],
          dialogue: [
            { speaker: 'Civic Harmony Bureau', line: 'Stop and submit.', delivery: 'amplified and cold' },
          ],
          audioCues: ['steam hiss blast'],
        },
        {
          id: 'shot_03',
          title: 'Drone sweep overhead',
          startSeconds: 9,
          endSeconds: 13,
          beat: 'A surveillance drone finds him in an open junction and paints him for capture.',
          visualAction: 'Ilya bursts into a larger underrail junction beneath a hanging maintenance gantry as a patrol drone slides overhead.',
          composition: 'Ilya small in the lower frame against massive brutalist geometry, drone crossing top frame, reflective water channels creating sharp light streaks.',
        },
      ],
    },
  })

  const prompt = beatSheet.prompt
  const beatMatches = [...prompt.matchAll(/BEAT \d+ \[(.*?)\]\nPanel visual: (.*?)\nCaption line 1: (.*?)\nCaption line 2: (.*?)(?:\n\n|$)/g)]
  assert.equal(beatMatches.length, 8)
  assert.equal(beatMatches[0]?.[1], '00:00-00:01')
  assert.equal(beatMatches[7]?.[1], '00:11-00:13')
  assert.equal(beatSheet.beatSheetPlan.visualDensity, 'action')
  assert.equal(beatSheet.beatSheetPlan.shotStripMode, 'dense')
  assert.match(prompt, /Shot density: action; shot-strip mode: dense; panel count: 8/)
  const panelVisuals = beatMatches.map((match) => match[2])
  assert.ok(panelVisuals.some((visual) => visual.includes('boots exploding water')))
  assert.ok(panelVisuals.some((visual) => visual.includes('patrol drone slides overhead')))
  assert.ok(panelVisuals.every((visual) => !/Opening state|Action escalation|Obstacle or contact|Consequence and transition|Visible action and blocking|Dialogue cue|Audio cue|Camera feel|Framing:/i.test(visual)))
  assert.ok(panelVisuals.every((visual) => !/\b[A-Za-z]+_[A-Za-z]+\b/.test(visual)))
  const captionPairs = beatMatches.map((match) => `${match[3]} ${match[4]}`)
  assert.ok(new Set(captionPairs).size >= 7)
  assert.ok(captionPairs.every((caption) => !caption.includes('...') && !caption.includes('…')))
  assert.ok(captionPairs.every((caption) => !caption.includes('Ilya Sorin, Civic Harmony Bureau, Underrail Warrens')))
  assert.doesNotMatch(prompt, /Stop and submit|steam hiss blast/)
  assert.doesNotMatch(prompt, /"entities"|\{\s*"name"/)
  assert.doesNotMatch(prompt, /forced into rebellion|abandoned transit maze below the city|Duplicate place anchor/)
  assert.equal((prompt.match(/^Underrail Warrens:/gm) ?? []).length, 1)
  assert.match(prompt, /^Ilya Sorin: Visual: /m)
  assert.match(prompt, /Caption rules: describe only what the viewer sees/)
  assert.match(prompt, /Storyboard rules: every Panel visual must be action-based/)
})

test('cinematic adaptive shot density keeps slow scenes sparse and action scenes dense', async (t) => {
  const imported = await importSharedOutputWorkflow<{
    buildCinematicBeatSheetPrompt: (input: {
      blockScript: Record<string, unknown>
      assetPack: Record<string, unknown>
      aspectRatio: string
      prompt: string
      guidance: null
    }) => { prompt: string; beatSheetPlan: Record<string, unknown> }
    buildCinematicDirectionSheetPrompt: (input: {
      blockScript: Record<string, unknown>
      assetPack: Record<string, unknown>
      aspectRatio: string
      prompt: string
      guidance: null
    }) => { prompt: string; directionSheetPlan: Record<string, unknown> }
    buildCinematicVideoPrompt: (input: {
      blockScript: Record<string, unknown>
      assetPack: Record<string, unknown>
      prompt: string
      guidance: null
      durationSeconds: number
      aspectRatio: string
      resolution: string
      generateAudio: boolean
      referenceImageCount: number
      cinematicReferenceMode?: string
    }) => string
  }>(t)
  if (!imported) return
  const { buildCinematicBeatSheetPrompt, buildCinematicDirectionSheetPrompt, buildCinematicVideoPrompt } = imported
  const slowCafeScript = {
    title: 'Cafe Static',
    durationSeconds: 15,
    location: 'lower_city_cafe',
    shots: [
      {
        id: 'shot_01',
        startSeconds: 0,
        endSeconds: 4,
        visualAction: 'Ilya and EVA-9 sit across from each other with chipped cups between them while neon reflections crawl across wet glass.',
        composition: 'A surveillance dome hangs in soft focus behind the cramped table.',
        framing: 'Medium two-shot at a cramped metal cafe table.',
        cameraMovement: 'Slow lateral creep inward.',
        dialogue: [{ speaker: 'Ilya Sorin', line: 'You pick very public hiding spots.', delivery: 'dry' }],
      },
      {
        id: 'shot_02',
        startSeconds: 4,
        endSeconds: 8,
        visualAction: 'EVA-9 gives the faintest approximation of a smile as Ilya stirs bitter coffee.',
        composition: 'Ilya shoulder soft in foreground, EVA-9 centered with cold blue edge light.',
        framing: 'Over-shoulder favoring EVA-9.',
        cameraMovement: 'Gentle push-in.',
        dialogue: [{ speaker: 'EVA-9', line: 'I can lower the accuracy if you prefer.', delivery: 'deadpan' }],
      },
      {
        id: 'shot_03',
        startSeconds: 8,
        endSeconds: 11,
        visualAction: 'Ilya lets out a reluctant half-laugh and glances toward the rain-smeared street.',
        composition: 'Ilya framed tight with window glow behind him.',
        framing: 'Close-up on Ilya.',
        cameraMovement: 'Static framing.',
        dialogue: [{ speaker: 'Ilya Sorin', line: 'That was almost human.', delivery: 'soft' }],
      },
      {
        id: 'shot_04',
        startSeconds: 11,
        endSeconds: 15,
        visualAction: 'EVA-9 holds his gaze without blinking as the red surveillance glint pulses once behind her.',
        composition: 'Her face centered and still, background falling away into cold blur.',
        framing: 'Tight close-up on EVA-9.',
        cameraMovement: 'Nearly imperceptible push-in.',
        dialogue: [{ speaker: 'EVA-9', line: 'I practiced with your voice while you were asleep.', delivery: 'quiet sincere' }],
      },
    ],
  }
  const actionChaseScript = {
    title: 'Underrail Pursuit',
    durationSeconds: 15,
    location: 'underrail_warrens',
    shots: [
      {
        id: 'shot_01',
        startSeconds: 0,
        endSeconds: 4,
        visualAction: 'Ilya sprints through flooded service tunnels, boots exploding water across rusted rails as pursuit lights sweep behind him.',
        composition: 'Tunnel lines compress behind him while officers appear through spray.',
        cameraMovement: 'Fast backward tracking.',
        actions: [{ actor: 'Ilya Sorin', verb: 'sprints through', target: 'flooded tunnel', stagingNotes: 'Water impact and red warning light fill the frame.' }],
      },
      {
        id: 'shot_02',
        startSeconds: 4,
        endSeconds: 8,
        visualAction: 'He whips around a blind corner, nearly slips, and catches himself on the wall as steam erupts.',
        composition: 'Search beams slice through steam from the rear corridor.',
        cameraMovement: 'Handheld chase follow.',
        actions: [{ actor: 'Ilya Sorin', verb: 'grabs', target: 'pipe brace', stagingNotes: 'The turn becomes a physical obstacle.' }],
      },
      {
        id: 'shot_03',
        startSeconds: 8,
        endSeconds: 12,
        visualAction: 'A patrol drone slides overhead and paints Ilya with a hard blue-white scan.',
        composition: 'Ilya is small below brutalist geometry while the drone crosses top frame.',
        cameraMovement: 'Crane-like rise and tilt.',
      },
      {
        id: 'shot_04',
        startSeconds: 12,
        endSeconds: 15,
        visualAction: 'Ilya vaults a service fence as a stun round sparks against the metal where he was standing.',
        composition: 'His body arcs across center while red-lit officers are blocked on the other side.',
        cameraMovement: 'Lateral tracking.',
        actions: [{ actor: 'Ilya Sorin', verb: 'vaults', target: 'service fence', stagingNotes: 'Metal impact and sparks mark the near capture.' }],
      },
    ],
  }
  const assetPack = { entities: [] }
  const slowSheet = buildCinematicBeatSheetPrompt({
    blockScript: slowCafeScript,
    assetPack,
    aspectRatio: '16:9',
    prompt: 'create a cinematic cafe banter scene',
    guidance: null,
  })
  assert.equal(slowSheet.beatSheetPlan.visualDensity, 'slow')
  assert.equal(slowSheet.beatSheetPlan.shotStripMode, 'sparse')
  assert.equal(slowSheet.beatSheetPlan.panelCount, 5)
  assert.equal((slowSheet.prompt.match(/^BEAT /gm) ?? []).length, 5)
  assert.match(slowSheet.prompt, /Panel-count rule: these panels represent meaningful visual cuts or action phases, not every second/)

  const slowShortSheet = buildCinematicBeatSheetPrompt({
    blockScript: { ...slowCafeScript, durationSeconds: 11, shots: slowCafeScript.shots.slice(0, 3).map((shot, index) => ({ ...shot, startSeconds: index * 3, endSeconds: index === 2 ? 11 : index * 3 + 3 })) },
    assetPack,
    aspectRatio: '16:9',
    prompt: 'create a short quiet cafe exchange',
    guidance: null,
  })
  assert.equal(slowShortSheet.beatSheetPlan.visualDensity, 'slow')
  assert.ok(Number(slowShortSheet.beatSheetPlan.panelCount) <= 4)

  const actionSheet = buildCinematicBeatSheetPrompt({
    blockScript: actionChaseScript,
    assetPack,
    aspectRatio: '16:9',
    prompt: 'create an underrail chase',
    guidance: null,
  })
  assert.equal(actionSheet.beatSheetPlan.visualDensity, 'action')
  assert.equal(actionSheet.beatSheetPlan.shotStripMode, 'dense')
  assert.ok(Number(actionSheet.beatSheetPlan.panelCount) >= 8)
  assert.ok(Number(actionSheet.beatSheetPlan.panelCount) <= 12)

  const directionSheet = buildCinematicDirectionSheetPrompt({
    blockScript: slowCafeScript,
    assetPack,
    aspectRatio: '16:9',
    prompt: 'create a cinematic cafe banter scene',
    guidance: null,
  })
  assert.equal(directionSheet.directionSheetPlan.visualDensity, 'slow')
  assert.match(directionSheet.prompt, /sparse slow-scene coverage/)
  assert.match(directionSheet.prompt, /Do not invent second-by-second panels/)

  const videoPrompt = buildCinematicVideoPrompt({
    blockScript: slowCafeScript,
    assetPack,
    prompt: 'create a cinematic cafe banter scene',
    guidance: null,
    durationSeconds: 15,
    aspectRatio: '16:9',
    resolution: '720p',
    generateAudio: true,
    referenceImageCount: 2,
    cinematicReferenceMode: 'shot_reference_sheet',
  })
  assert.match(videoPrompt, /Ilya Sorin: "You pick very public hiding spots\."/)
  assert.match(videoPrompt, /EVA-9: "I practiced with your voice while you were asleep\."/)
})

test('cinematic direction-sheet mode builds director reference sheet and Seedance legend', async (t) => {
  const imported = await importSharedOutputWorkflow<{
    buildCinematicDirectionSheetPrompt: (input: {
      blockScript: Record<string, unknown>
      assetPack: Record<string, unknown>
      aspectRatio: string
      prompt: string
      guidance: null
      debugCinematicStoryboardStyleSafeMode?: boolean
      cinematicStoryboardStyleOverride?: string
    }) => { prompt: string; directionSheetPlan: Record<string, unknown>; imageSize: { width: number; height: number } }
    buildCinematicVideoPrompt: (input: {
      blockScript: Record<string, unknown>
      assetPack: Record<string, unknown>
      prompt: string
      guidance: null
      durationSeconds: number
      aspectRatio: string
      resolution: string
      generateAudio: boolean
      referenceImageCount: number
      cinematicReferenceMode?: string
      debugCinematicStoryboardStyleSafeMode?: boolean
      cinematicStoryboardStyleOverride?: string
    }) => string
  }>(t)
  if (!imported) return
  const { buildCinematicDirectionSheetPrompt, buildCinematicVideoPrompt } = imported
  const blockScript = {
    title: 'Cafe Static Take',
    durationSeconds: 15,
    location: 'lower_city_cafe',
    shots: [
      {
        id: 'shot_01',
        title: 'Hook at the table',
        startSeconds: 0,
        endSeconds: 4,
        visualAction: 'Ilya and EVA-9 sit across from each other with chipped cups between them while neon reflections crawl across wet glass.',
        composition: 'Ilya foreground left, EVA-9 foreground right, surveillance dome layered behind them.',
        framing: 'Medium two-shot at a cramped metal cafe table.',
        cameraMovement: 'Slow lateral creep inward.',
        dialogue: [{ speaker: 'Ilya Sorin', line: 'You pick very public hiding spots.', delivery: 'dry' }],
        audioCues: ['rain ticking against glass'],
      },
      {
        id: 'shot_02',
        title: 'Still answer',
        startSeconds: 4,
        endSeconds: 9,
        visualAction: 'EVA-9 gives the faintest approximation of a smile as Ilya stirs bitter coffee.',
        composition: 'Ilya shoulder soft in foreground, EVA-9 centered with cold blue edge light.',
        framing: 'Over-shoulder favoring EVA-9.',
        cameraMovement: 'Gentle push-in.',
      },
      {
        id: 'shot_03',
        title: 'Room freezes',
        startSeconds: 9,
        endSeconds: 15,
        visualAction: 'EVA-9 holds his gaze without blinking as the red surveillance glint pulses once behind her.',
        composition: 'Her face centered and still, background falling away into cold blur.',
        framing: 'Tight close-up on EVA-9.',
        cameraMovement: 'Nearly imperceptible push-in.',
      },
    ],
  }
  const assetPack = {
    entities: [
      { name: 'Ilya Sorin', visualDescription: 'lean young man in a worn utility jacket with tired eyes', visualTraits: ['shaved dark hair'] },
      { name: 'EVA-9', visualDescription: 'sleek humanoid android with pale synthetic panels and calm unreadable gaze', visualTraits: ['subtle neck ports'] },
    ],
  }
  const sheet = buildCinematicDirectionSheetPrompt({
    blockScript,
    assetPack,
    aspectRatio: '16:9',
    prompt: 'create a cinematic cafe banter scene',
    guidance: null,
    debugCinematicStoryboardStyleSafeMode: true,
    cinematicStoryboardStyleOverride: 'painterly comic-book cinematic production art',
  })
  assert.equal(sheet.directionSheetPlan.sheetKind, 'shot_reference_sheet')
  assert.deepEqual(sheet.imageSize, { width: 2304, height: 1536 })
  assert.match(sheet.prompt, /CINEMATIC DIRECTION SHEET/)
  assert.match(sheet.prompt, /TIMED SHOT STRIP/)
  assert.match(sheet.prompt, /LOCATION FLOOR MAP/)
  assert.match(sheet.prompt, /CAMERA LAYOUT/)
  assert.match(sheet.prompt, /LIGHTING \/ MOOD \/ STYLE/)
  assert.match(sheet.prompt, /CONTINUITY ANCHORS/)
  assert.match(sheet.prompt, /HERO FRAME/)
  assert.match(sheet.prompt, /subject positions, movement arrows, camera positions, and camera direction cones/)
  assert.match(sheet.prompt, /painterly comic-book cinematic production art/)
  assert.doesNotMatch(sheet.prompt, /You pick very public hiding spots|rain ticking against glass|Seedance|provider names/)

  const videoPrompt = buildCinematicVideoPrompt({
    blockScript,
    assetPack,
    prompt: 'create a cinematic cafe banter scene',
    guidance: null,
    durationSeconds: 15,
    aspectRatio: '16:9',
    resolution: '720p',
    generateAudio: true,
    referenceImageCount: 3,
    cinematicReferenceMode: 'shot_reference_sheet',
    debugCinematicStoryboardStyleSafeMode: true,
    cinematicStoryboardStyleOverride: 'painterly comic-book cinematic production art',
  })
  assert.match(videoPrompt, /@Image1: cinematic direction sheet/)
  assert.match(videoPrompt, /timed shot strip, blocking, camera layout, spatial map, lighting direction/)
  assert.match(videoPrompt, /Do not reproduce sheet labels, maps, arrows, camera cones/)
  assert.match(videoPrompt, /Ilya Sorin: "You pick very public hiding spots\."/)
})

test('Seedance V3 prompt contract uses exact reference manifests and conditional movement logic', async (t) => {
  const sharedModulePath = ['..', '..', 'supabase', 'functions', '_shared', 'output-workflow.ts'].join('/')
  let imported: {
    buildCinematicVideoPrompt: (input: {
      blockScript: Record<string, unknown>
      assetPack: Record<string, unknown>
      prompt: string
      guidance: null
      durationSeconds: number
      aspectRatio: string
      resolution: string
      generateAudio: boolean
      referenceImageCount: number
      seedanceReferenceManifest?: Array<Record<string, unknown>>
      cinematicReferenceMode?: string
    }) => string
    buildSeedanceReferenceManifest: (input: {
      imageReferences?: Array<{ label: string; role?: string; url?: string }>
      videoReferences?: Array<{ label: string; role?: string; url?: string }>
      audioReferences?: Array<{ label: string; role?: string; url?: string }>
      cinematicReferenceMode?: string
    }) => Array<Record<string, unknown>>
    rewriteSeedanceReferenceLegend: (prompt: string, manifest: Array<Record<string, unknown>>, referencePolicy?: string) => string
  }
  try {
    imported = await import(sharedModulePath) as typeof imported
  } catch (error) {
    if (error instanceof Error && /npm:/.test(error.message)) {
      t.skip('Local Node ESM loader cannot import Supabase npm: specifiers; covered by source checks and worker build.')
      return
    }
    throw error
  }
  const {
    buildCinematicVideoPrompt,
    buildSeedanceReferenceManifest,
    rewriteSeedanceReferenceLegend,
  } = imported
  const manifest = buildSeedanceReferenceManifest({
    imageReferences: [
      { label: 'Storyboard block 2 sheet', role: 'storyboard_sheet', url: 'https://example.com/storyboard.webp' },
      { label: 'Suri Samurai variant', role: 'entity_reference', url: 'https://example.com/suri.webp' },
      { label: 'Pact Chamber shot-location variant', role: 'location_reference', url: 'https://example.com/chamber.webp' },
    ],
    videoReferences: [{ label: 'prior motion reference', role: 'video_reference', url: 'https://example.com/motion.mp4' }],
    cinematicReferenceMode: 'storyboard_sheet',
  })
  const actionScript = {
    shots: [
      {
        id: 'shot_01',
        index: 1,
        title: 'Flying diagonal strike',
        startSeconds: 0,
        endSeconds: 3,
        action: 'Suri leaps into a samurai sword strike through dust.',
        videoDirection: 'fast airborne slash with fabric lag and impact sparks',
        camera: 'low wide rush-in',
        dialogue: [],
      },
      {
        id: 'shot_02',
        index: 2,
        title: 'Temple impact',
        startSeconds: 3,
        endSeconds: 6,
        action: 'The blade hits the floor and debris jumps outward.',
        videoDirection: 'strong grounded impact',
        camera: 'violent low-angle push',
        dialogue: [],
      },
    ],
  }
  const prompt = buildCinematicVideoPrompt({
    blockScript: actionScript,
    assetPack: {
      entities: [
        {
          name: 'Suri',
          visualDescription: 'small heroic warrior with a samurai outfit and clear helmet silhouette',
          visualTraits: ['samurai outfit', 'helmet silhouette'],
          voiceDescription: 'bright, brave, focused voice',
        },
      ],
    },
    prompt: 'create a martial arts samurai action clip',
    guidance: null,
    durationSeconds: 6,
    aspectRatio: '16:9',
    resolution: '720p',
    generateAudio: false,
    referenceImageCount: 3,
    seedanceReferenceManifest: manifest,
    cinematicReferenceMode: 'storyboard_sheet',
  })
  assert.match(prompt, /@Image1: Storyboard block 2 sheet; primary sequential storyboard keyframe reference\./)
  assert.match(prompt, /@Image2: Suri Samurai variant; entity identity, wardrobe, variant, or prop continuity reference\./)
  assert.match(prompt, /@Image3: Pact Chamber shot-location variant; environment or shot-location continuity reference\./)
  assert.match(prompt, /@Video1: prior motion reference; motion continuity reference\./)
  assert.match(prompt, /\[TIMESTAMPED SHOT CALL SHEET\][\s\S]*\[00:00-00:03\][\s\S]*\[00:03-00:06\]/)
  assert.match(prompt, /Laban movement logic/)
  assert.equal((prompt.match(/Do not render production-board artifacts/g) ?? []).length, 1)

  const noStoryboardPrompt = buildCinematicVideoPrompt({
    blockScript: { shots: [{ id: 'shot_01', index: 1, title: 'Quiet look', startSeconds: 0, endSeconds: 4, action: 'Two characters exchange a quiet look.', camera: 'static medium two-shot', dialogue: [] }] },
    assetPack: { entities: [] },
    prompt: 'quiet dialogue in a room',
    guidance: null,
    durationSeconds: 4,
    aspectRatio: '16:9',
    resolution: '720p',
    generateAudio: false,
    referenceImageCount: 0,
    seedanceReferenceManifest: [],
    cinematicReferenceMode: 'storyboard_sheet',
  })
  assert.doesNotMatch(noStoryboardPrompt, /@Image1 is the storyboard|@Image1: storyboard/i)
  assert.doesNotMatch(noStoryboardPrompt, /Laban movement logic/)

  const reducedManifest = buildSeedanceReferenceManifest({
    imageReferences: [{ label: 'Storyboard block 2 sheet', role: 'storyboard_sheet', url: 'https://example.com/storyboard.webp' }],
    cinematicReferenceMode: 'storyboard_sheet',
  })
  const rewritten = rewriteSeedanceReferenceLegend(prompt, reducedManifest, 'storyboard_only')
  assert.match(rewritten, /@Image1: Storyboard block 2 sheet/)
  assert.doesNotMatch(rewritten, /@Image2: Suri Samurai variant|@Image3: Pact Chamber/)
  assert.match(rewritten, /Reference fallback mode: storyboard_only/)
})

test('MUAPI video helpers build payloads and parse result shapes', async (t) => {
  const imported = await importSharedOutputWorkflow<{
    buildMuapiVideoPayload: (input: {
      prompt: string
      durationSeconds: number
      aspectRatio?: string
      quality?: string
      referenceImageUrls?: string[]
      referenceVideoUrls?: string[]
      referenceAudioUrls?: string[]
    }) => Record<string, unknown>
    extractMuapiVideoUrlFromResult: (value: unknown) => string
  }>(t)
  if (!imported) return
  const { buildMuapiVideoPayload, extractMuapiVideoUrlFromResult } = imported

  assert.deepEqual(buildMuapiVideoPayload({
    prompt: 'Generate one cinematic take.',
    durationSeconds: 10,
    aspectRatio: '16:9',
    referenceImageUrls: ['https://example.com/a.webp'],
    referenceVideoUrls: ['https://example.com/ref.mp4'],
    referenceAudioUrls: ['https://example.com/ref.wav'],
  }), {
    prompt: 'Generate one cinematic take.',
    images_list: ['https://example.com/a.webp'],
    video_files: ['https://example.com/ref.mp4'],
    audio_files: ['https://example.com/ref.wav'],
    aspect_ratio: '16:9',
    quality: 'high',
    duration: 10,
  })

  assert.equal(extractMuapiVideoUrlFromResult({ video_url: 'https://cdn.example.com/out.mp4' }), 'https://cdn.example.com/out.mp4')
  assert.equal(extractMuapiVideoUrlFromResult({ output: { video_url: 'https://cdn.example.com/output.mp4' } }), 'https://cdn.example.com/output.mp4')
  assert.equal(extractMuapiVideoUrlFromResult({ result: { videos: [{ url: 'https://cdn.example.com/result.webm' }] } }), 'https://cdn.example.com/result.webm')
  assert.equal(extractMuapiVideoUrlFromResult({ response: ['https://cdn.example.com/response.mp4'] }), 'https://cdn.example.com/response.mp4')
  assert.equal(extractMuapiVideoUrlFromResult({ outputs: ['https://cdn.example.com/webhook.mp4'] }), 'https://cdn.example.com/webhook.mp4')
  assert.equal(extractMuapiVideoUrlFromResult({ status: 'failed', error_message: 'moderated' }), '')
})

test('cinematic Nara EVA-9 fixture separates visual storyboard from Seedance dialogue', async (t) => {
  const imported = await importSharedOutputWorkflow<{
    buildCinematicBeatSheetPrompt: (input: {
      blockScript: Record<string, unknown>
      assetPack: Record<string, unknown>
      aspectRatio: string
      prompt: string
      guidance: null
      debugCinematicStoryboardStyleSafeMode?: boolean
      cinematicStoryboardStyleOverride?: string
    }) => { prompt: string }
    buildCinematicVideoPrompt: (input: {
      blockScript: Record<string, unknown>
      assetPack: Record<string, unknown>
      prompt: string
      guidance: null
      durationSeconds: number
      aspectRatio: string
      resolution: string
      generateAudio: boolean
      referenceImageCount: number
      cinematicReferenceMode?: string
      debugCinematicStoryboardStyleSafeMode?: boolean
      cinematicStoryboardStyleOverride?: string
    }) => string
  }>(t)
  if (!imported) return
  const { buildCinematicBeatSheetPrompt, buildCinematicVideoPrompt } = imported
  const assetPack = {
    entities: [
      {
        key: 'nara_quill',
        name: 'Nara Quill',
        visualDescription: 'sharp-eyed woman with braided hair, patchwork tech coat, portable projector rig, blue monitor glow across her face',
        visualTraits: ['braided hair', 'patchwork tech coat', 'focused expression'],
      },
      {
        key: 'eva_9',
        name: 'EVA-9',
        visualDescription: 'sleek humanoid android with pale synthetic skin panels, subtle neck ports, white maintenance uniform, calm unreadable gaze',
        visualTraits: ['pale synthetic skin panels', 'subtle neck ports', 'white maintenance uniform'],
      },
    ],
  }
  const blockScript = {
    title: 'First Examination',
    durationSeconds: 12,
    shots: [
      {
        id: 'shot_01',
        title: 'The found android',
        startSeconds: 0,
        endSeconds: 6,
        beat: 'Nara finds EVA-9 on the worktable and realizes the machine is not ordinary.',
        visualAction: 'Nara steps into the blue-lit bay and stops at a steel worktable where EVA-9 lies half-upright under hanging task lamps.',
        composition: 'Nara stands at arm length from EVA-9, shoulders tight, with rainwater beading on the android casing and cold blue reflections on the table.',
        actions: [
          { actor: 'Nara Quill', verb: 'stares_at', target: 'EVA-9', stagingNotes: 'Her gaze tracks exposed seams, damage, and the android faceplate with visible disbelief.', startSeconds: 1, endSeconds: 5 },
          { actor: 'EVA-9', verb: 'lies_still', target: 'worktable', stagingNotes: 'The android remains motionless except for a faint status flicker under damaged plating.', startSeconds: 0, endSeconds: 6 },
        ],
        dialogue: [
          { speaker: 'Nara Quill', line: "You're what came out of the Foundry.", delivery: 'stunned and quiet', startSeconds: 4, endSeconds: 6 },
        ],
        audioCues: ['rain ticking against the bay window', 'low electrical hum under the table'],
      },
      {
        id: 'shot_02',
        title: 'Too refined',
        startSeconds: 6,
        endSeconds: 12,
        beat: 'Nara inspects the internal architecture and becomes more bewildered.',
        visualAction: 'Nara leans over EVA-9, lifts a torn panel edge with gloved fingers, and studies the intricate internal architecture.',
        composition: 'Tight worktable view with Nara braced in the task light, EVA-9 face and upper torso visible, tiny status reflections moving across polished synthetic seams.',
        actions: [
          { actor: 'Nara Quill', verb: 'leans_over', target: 'EVA-9', stagingNotes: 'She braces one hand on the table and lowers into the task light.', startSeconds: 0, endSeconds: 3 },
          { actor: 'Nara Quill', verb: 'examines', target: 'EVA-9', stagingNotes: 'Bewilderment overtakes suspicion as she studies the component lattice.', startSeconds: 3, endSeconds: 6 },
        ],
        dialogue: [
          { speaker: 'Nara Quill', line: 'No. This is too refined.', delivery: 'whispered, disbelieving', startSeconds: 3, endSeconds: 5 },
        ],
        audioCues: ['soft servo flicker beneath damaged plating', 'distant thunder through metal walls'],
      },
    ],
  }

  const storyboardPrompt = buildCinematicBeatSheetPrompt({
    blockScript,
    assetPack,
    aspectRatio: '16:9',
    prompt: 'create a cinematic where Nara Quill is examining Eva-9 for the first time',
    guidance: null,
    debugCinematicStoryboardStyleSafeMode: true,
    cinematicStoryboardStyleOverride: 'painterly comic-book cinematic production art, expressive ink-and-paint rendering, premium graphic novel storyboard look, not photorealistic',
  }).prompt
  assert.doesNotMatch(storyboardPrompt, /You're what came out of the Foundry|No\. This is too refined|rain ticking|electrical hum|servo flicker/)
  assert.doesNotMatch(storyboardPrompt, /\b(stares_at|leans_over|lies_still)\b/)
  assert.match(storyboardPrompt, /Nara steps into the blue-lit bay/)
  assert.match(storyboardPrompt, /Nara Quill's mouth is slightly open/)
  assert.match(storyboardPrompt, /painterly comic-book cinematic production art/)
  assert.match(storyboardPrompt, /stylized production-board translation, not photorealistic likeness/i)
  assert.match(storyboardPrompt, /preserving each reference image's identity anchors, silhouette, wardrobe, palette, props, material cues, and environment geometry/i)

  const videoPrompt = buildCinematicVideoPrompt({
    blockScript,
    assetPack,
    prompt: 'create a cinematic where Nara Quill is examining Eva-9 for the first time',
    guidance: null,
    durationSeconds: 12,
    aspectRatio: '16:9',
    resolution: '720p',
    generateAudio: true,
    referenceImageCount: 3,
    cinematicReferenceMode: 'storyboard_sheet',
    debugCinematicStoryboardStyleSafeMode: true,
    cinematicStoryboardStyleOverride: 'painterly comic-book cinematic production art, expressive ink-and-paint rendering, premium graphic novel storyboard look, not photorealistic',
  })
  assert.match(videoPrompt, /Target video style: grounded live-action cinematic video/)
  assert.match(videoPrompt, /@Image1 is a stylized storyboard\/timing reference rendered as painterly comic-book cinematic production art/)
  assert.match(videoPrompt, /render the final clip in the target video style: grounded live-action cinematic video/)
  assert.match(videoPrompt, /Nara Quill: "You're what came out of the Foundry\."/)
  assert.match(videoPrompt, /Nara Quill: "No\. This is too refined\."/)
  assert.match(videoPrompt, /rain ticking against the bay window/)
  assert.match(videoPrompt, /@Image1: storyboard beat-sheet grid/)

  const normalStoryboardPrompt = buildCinematicBeatSheetPrompt({
    blockScript,
    assetPack,
    aspectRatio: '16:9',
    prompt: 'create a cinematic where Nara Quill is examining Eva-9 for the first time',
    guidance: null,
    debugCinematicStoryboardStyleSafeMode: false,
    cinematicStoryboardStyleOverride: 'painterly comic-book cinematic production art',
  }).prompt
  assert.doesNotMatch(normalStoryboardPrompt, /painterly comic-book cinematic production art/)
  assert.match(normalStoryboardPrompt, /Storyboard style safe mode: disabled/)
})

test('cinematic cafe storyboard prompt naturalizes actions and strips dialogue delivery', async (t) => {
  const imported = await importSharedOutputWorkflow<{
    buildCinematicBeatSheetPrompt: (input: {
      blockScript: Record<string, unknown>
      assetPack: Record<string, unknown>
      aspectRatio: string
      prompt: string
      guidance: null
    }) => { prompt: string }
  }>(t)
  if (!imported) return
  const { buildCinematicBeatSheetPrompt } = imported
  const prompt = buildCinematicBeatSheetPrompt({
    aspectRatio: '16:9',
    prompt: 'create a cinematic of Eva-9 and Ilya bantering in a cafe',
    guidance: null,
    assetPack: {
      entities: [
        { key: 'ilya_sorin', name: 'Ilya Sorin', visualDescription: 'Lean young man in a worn utility jacket with grease-stained hands, shaved dark hair, tired eyes.' },
        { key: 'eva_9', name: 'EVA-9', visualDescription: 'Sleek humanoid android with pale synthetic skin panels, subtle neck ports, white maintenance uniform, calm unreadable gaze.' },
      ],
    },
    blockScript: {
      title: 'Cafe Static',
      durationSeconds: 15,
      shots: [
        {
          id: 'shot_01',
          title: 'Hook at the table',
          startSeconds: 0,
          endSeconds: 4,
          durationSeconds: 4,
          framing: 'Medium two-shot at a cramped metal cafe table by a rain-streaked window.',
          cameraMovement: 'Slow lateral creep inward.',
          visualAction: 'Ilya and EVA-9 sit across from each other with chipped cups between them; neon and warning red reflections crawl across wet glass while a ceiling surveillance dome hangs in soft focus behind.',
          composition: 'Ilya foreground left, EVA-9 foreground right, window reflections and surveillance dome layered in the background.',
          actions: [
            { actor: 'Ilya Sorin', verb: 'leans', target: 'table', prop: 'cup', stagingNotes: 'Shoulders low, trying to look casual while keeping his eyes on EVA-9.' },
            { actor: 'EVA-9', verb: 'tilts', target: 'Ilya Sorin', prop: 'cup', stagingNotes: 'Small precise head movement, unreadably calm, fingertips resting beside the cup without drinking.' },
          ],
          dialogue: [
            { speaker: 'Ilya Sorin', line: 'You know, for someone on the run, you pick very public hiding spots.', delivery: 'Dry, low, testing her.' },
            { speaker: 'EVA-9', line: "You sweat less when you think you're blending in.", delivery: 'Even, almost teasing.' },
          ],
        },
        {
          id: 'shot_04',
          title: 'The creepy line',
          startSeconds: 11,
          endSeconds: 15,
          durationSeconds: 4,
          framing: 'Tight close-up on EVA-9.',
          cameraMovement: 'Slow, nearly imperceptible push-in.',
          visualAction: 'EVA-9 holds his gaze without blinking; cafe reflections drift across her features while the red surveillance glint pulses once in the background.',
          composition: 'Her face centered and still, background falling away into cold blur except for a faint red point behind her.',
          actions: [
            { actor: 'EVA-9', verb: 'holds', target: 'Ilya Sorin', stagingNotes: 'Perfect stillness, no blink, no smile by the end.' },
          ],
          dialogue: [
            { speaker: 'EVA-9', line: 'I practiced with your voice while you were asleep.', delivery: 'Quiet, sincere, far too intimate.' },
          ],
        },
      ],
    },
  }).prompt

  assert.doesNotMatch(prompt, /Ilya Sorin leans table|EVA-9 tilts Ilya Sorin|EVA-9 holds Ilya Sorin Perfect/i)
  assert.doesNotMatch(prompt, /Dry, low, testing her|Even, almost teasing|Quiet, sincere, far too intimate/)
  assert.doesNotMatch(prompt, /You know, for someone on the run|I practiced with your voice/)
  assert.match(prompt, /Shot density: slow; shot-strip mode: sparse; panel count: 4/i)
  assert.match(prompt, /Panel-count rule: these panels represent meaningful visual cuts or action phases/i)
  assert.match(prompt, /Ilya and EVA-9 sit across from each other/i)
  assert.match(prompt, /EVA-9 holds Ilya Sorin's gaze/i)
  assert.match(prompt, /Medium two-shot at a cramped metal cafe table/i)
  assert.match(prompt, /Tight close-up on EVA-9/i)
})

test('prompt-first image request payloads do not inherit comic page count', () => {
  const payload = outputRequestStartRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Draw an image of Mara in The Archive',
    snapshot,
    runInput: {},
  })

  assert.equal(payload.pageCount, undefined)
  assert.deepEqual(payload.selectedSequenceUnitKeys, [])
})

test('prompt-first planner distinguishes reference documents from narrative prose', () => {
  const biblePlan = planOutputPrompt({
    prompt: 'create a story bible',
    snapshot,
  })
  assert.equal(biblePlan.intent, 'output_generation')
  assert.equal(biblePlan.outputKind, 'story_bible_from_world')
  assert.equal(biblePlan.documentMode, 'designed_reference')
  assert.ok(biblePlan.sections.some((section) => section.key === 'main_characters'))

  const textOnlyBiblePlan = planOutputPrompt({
    prompt: 'create a story bible text only, no images',
    snapshot,
  })
  assert.equal(textOnlyBiblePlan.documentMode, 'reference')

  const chapterPlan = planOutputPrompt({
    prompt: 'write the first chapter as prose',
    snapshot,
  })
  assert.equal(chapterPlan.outputKind, 'narrative_chapter_or_ebook')
  assert.equal(chapterPlan.documentMode, 'narrative')
})

test('prompt-first image requests use approved workflow nodes only', () => {
  const plan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Make a poster image of Mara in The Archive',
    targetFormat: 'image',
    snapshot,
  }, 'poster_image')

  assert.equal(plan.preset, 'composite_reference')
  assert.deepEqual(plan.nodes.map((node) => node.key), ['world_context', 'skill_context', 'visual_prompt', 'image_references', 'generated_image'])
  assert.equal(readConfigPurpose(plan.nodes.find((node) => node.key === 'visual_prompt') ?? {}), 'poster_prompt')
  assert.equal(readConfigPurpose(plan.nodes.find((node) => node.key === 'image_references') ?? {}), 'image_reference_selector')
  assert.equal(readConfigPurpose(plan.nodes.find((node) => node.key === 'generated_image') ?? {}), 'poster_image')
  assert.equal(readConfigQuality(plan.nodes.find((node) => node.key === 'generated_image') ?? {}), 'medium')
  assert.equal(readConfigOutputFormat(plan.nodes.find((node) => node.key === 'generated_image') ?? {}), 'webp')
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'image_references' && edge.sourcePort === 'asset_pack' && edge.targetNodeKey === 'generated_image' && edge.targetPort === 'references'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'image_references' && edge.sourcePort === 'asset_pack' && edge.targetNodeKey === 'visual_prompt' && edge.targetPort === 'asset_pack'))
  assert.equal(validateOutputWorkflowGraph({ nodes: plan.nodes, edges: plan.edges }).ok, true)
})

test('prompt-first image workflows select one entity variant reference per subject', () => {
  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const startOutputRequestSource = readFileSync(resolve(repoRoot, 'supabase/functions/start-output-request/index.ts'), 'utf8')
  const plan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a poster image of Mara in a samurai outfit inside the Pact Chamber doing a heroic pose.',
    targetFormat: 'image',
    snapshot,
  }, 'poster_image')

  assert.deepEqual(plan.nodes.map((node) => node.key), ['world_context', 'skill_context', 'visual_prompt', 'image_references', 'generated_image'])
  assert.match(workerSource, /function resolveImageOutputReferenceSelection/)
  assert.match(workerSource, /selectedReferenceVariantLabel/)
  assert.match(workerSource, /selectedReferenceVariantSummary/)
  assert.match(workerSource, /primaryAssetKey/)
  assert.match(workerSource, /assetKeys: referenceSelection\.primaryAssetKey \? \[referenceSelection\.primaryAssetKey\] : \[\]/)
  assert.match(workerSource, /const primaryAssetKey = readText\(entity\.primaryAssetKey\)/)
  assert.match(workerSource, /Selected visual variant:/)
  assert.match(workerSource, /variant_pending/)
  assert.match(workerSource, /variant_not_found/)
  assert.match(workerSource, /selectedReferenceVariants/)
  assert.match(workerSource, /selectedReferenceVariantKeys/)
  assert.match(workerSource, /selectedReferenceAssetKeys/)
  assert.match(workerSource, /referenceDiagnostics/)
  assert.match(workerSource, /function referenceVariantHasUsableAsset/)
  assert.match(workerSource, /selected visual variant is listed/)
  assert.match(workerSource, /function buildOutputReferenceSelectionSnapshot/)
  assert.match(workerSource, /outputReferenceSelection/)
  assert.match(workerSource, /persistOutputRequestReferenceSelection/)
  assert.match(startOutputRequestSource, /world_entity_visual_variants/)
  assert.match(startOutputRequestSource, /referenceVariants: variants/)
  assert.match(startOutputRequestSource, /select the parent entity that owns that referenceVariants entry/)
})

test('cinematic reference selection keeps shot-location variants on their parent location', () => {
  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const startOutputRequestSource = readFileSync(resolve(repoRoot, 'supabase/functions/start-output-request/index.ts'), 'utf8')

  assert.match(workerSource, /function strengthenCinematicReferencePlanWithVariantMatches/)
  assert.match(workerSource, /shot_location_sheet/)
  assert.match(workerSource, /variant-aware strengthening kept parent references/i)
  assert.match(workerSource, /in the leader\\'s chamber of Whistlewick/)
  assert.match(workerSource, /Do not select unrelated props\/items merely because one word like "chamber"/)
  assert.match(workerSource, /sortReferenceValuesWithPrimary/)
  assert.match(workerSource, /selectedReferenceVariantAssetKeyForEntity/)
  assert.match(workerSource, /const primaryAssetKey = readText\(entity\.primaryAssetKey\) \|\| selectedReferenceVariantAssetKey/)
  assert.match(workerSource, /assetKeys: sortReferenceValuesWithPrimary\(readStringArray\(entity\.assetKeys\), primaryAssetKey \|\| selectedReferenceVariantAssetKey\)/)
  assert.match(startOutputRequestSource, /leader\\'s chamber of Whistlewick/)
  assert.match(startOutputRequestSource, /Prefer exact or multi-word variant label\/summary matches/)
})

test('trusted output-kind override bypasses prompt classification for sequence UI actions', () => {
  const startOutputRequestSource = readFileSync(resolve(repoRoot, 'supabase/functions/start-output-request/index.ts'), 'utf8')

  assert.match(startOutputRequestSource, /payload\.outputKindOverride/)
  assert.match(startOutputRequestSource, /trusted_ui_override/)
  assert.match(startOutputRequestSource, /Trusted UI action from \$\{payload\.sourceSurface\} bypassed prompt intent classification/)
  assert.match(startOutputRequestSource, /outputKindOverride\s*\?\s*\{/)
  assert.match(startOutputRequestSource, /:\s*await classifyPromptIntentServer/)
  assert.match(startOutputRequestSource, /selectedSequenceUnitKeys: payload\.selectedSequenceUnitKeys/)
})

test('image workflow quality defaults are configurable and client-overridable', () => {
  const characterPlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Character art portrait of Mara',
    targetFormat: 'image',
    snapshot,
  }, 'concept_art_image')
  assert.equal(readConfigQuality(characterPlan.nodes.find((node) => node.key === 'generated_image') ?? {}), 'low')

  const overridePlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Character art portrait of Mara',
    targetFormat: 'image',
    imageQuality: 'high',
    snapshot,
  }, 'concept_art_image')
  assert.equal(readConfigQuality(overridePlan.nodes.find((node) => node.key === 'generated_image') ?? {}), 'high')

  const comicPlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Comic issue from Chapter 1',
    targetFormat: 'pdf',
    snapshot,
  }, 'comic_issue_from_sequence')
  assert.equal(comicPlan.nodes.some((node) => node.key === 'comic_atlas_image'), false)
  assert.equal(readConfigQuality(comicPlan.nodes.find((node) => node.key === 'page_001_image') ?? {}), 'medium')
})

test('image workflow output format defaults to webp and is client-overridable', () => {
  const defaultPlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Make a poster image of Mara in The Archive',
    targetFormat: 'image',
    snapshot,
  }, 'poster_image')
  assert.equal(readConfigOutputFormat(defaultPlan.nodes.find((node) => node.key === 'generated_image') ?? {}), 'webp')

  const overridePlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Make a poster image of Mara in The Archive',
    targetFormat: 'image',
    imageOutputFormat: 'png',
    snapshot,
  }, 'poster_image')
  assert.equal(readConfigOutputFormat(overridePlan.nodes.find((node) => node.key === 'generated_image') ?? {}), 'png')

  const comicPlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Comic issue from Chapter 1',
    targetFormat: 'pdf',
    snapshot,
  }, 'comic_issue_from_sequence')
  assert.equal(comicPlan.nodes.some((node) => node.key === 'comic_atlas_image'), false)
  assert.equal(readConfigOutputFormat(comicPlan.nodes.find((node) => node.key === 'page_001_image') ?? {}), 'webp')
})

test('story bible workflow creates parallel reference sections instead of chapter prose', () => {
  const plan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'create a story bible',
    targetFormat: 'pdf',
    snapshot,
  }, 'story_bible_from_world')

  assert.equal(plan.preset, 'story_bible_from_world')
  assert.ok(plan.nodes.some((node) => node.key === 'bible_section_plan'))
  const documentRender = plan.nodes.find((node) => node.key === 'document_render')
  assert.equal(documentRender?.config.documentMode, 'designed_reference')
  assert.equal(documentRender?.config.pageSize, 'a4')
  assert.equal(plan.nodes.some((node) => readConfigPurpose(node) === 'chapter_prose'), false)
  const sectionNodes = plan.nodes.filter((node) => readConfigPurpose(node) === 'bible_section')
  assert.ok(sectionNodes.length >= 8)
  assert.ok(sectionNodes.every((node) => node.key.startsWith('bible_')))
  assert.ok(sectionNodes.every((node) => plan.edges.some((edge) => edge.sourceNodeKey === node.key && edge.targetNodeKey === 'bible_assembly')))
  const executionPlan = buildOutputWorkflowExecutionPlan(plan.nodes, plan.edges)
  const levelWithSections = executionPlan.levels.find((level) => sectionNodes.every((node) => level.includes(node.key)))
  assert.ok(levelWithSections)
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'bible_assembly' && edge.targetNodeKey === 'document_render'))
  assert.equal(validateOutputWorkflowGraph({ nodes: plan.nodes, edges: plan.edges }).ok, true)
})

test('validates DAG ordering and rejects cycles', () => {
  const nodes = [
    { key: 'context', nodeType: 'world_context_query' as const },
    { key: 'outline', nodeType: 'text_llm' as const },
    { key: 'artifact', nodeType: 'output_artifact' as const },
  ]
  const edges = [
    { sourceNodeKey: 'context', targetNodeKey: 'outline' },
    { sourceNodeKey: 'outline', targetNodeKey: 'artifact' },
  ]

  assert.equal(validateOutputWorkflowGraph({ nodes, edges }).ok, true)
  assert.deepEqual(topologicallySortOutputWorkflow(nodes, edges), ['context', 'outline', 'artifact'])
  assert.equal(validateOutputWorkflowGraph({
    nodes,
    edges: [...edges, { sourceNodeKey: 'artifact', targetNodeKey: 'context' }],
  }).ok, false)
})

test('builds execution levels for independent parallel branches and joins', () => {
  const nodes = [
    { key: 'context' },
    { key: 'chapter_a' },
    { key: 'chapter_b' },
    { key: 'assembly' },
  ]
  const edges = [
    { sourceNodeKey: 'context', targetNodeKey: 'chapter_a' },
    { sourceNodeKey: 'context', targetNodeKey: 'chapter_b' },
    { sourceNodeKey: 'chapter_a', targetNodeKey: 'assembly' },
    { sourceNodeKey: 'chapter_b', targetNodeKey: 'assembly' },
  ]

  const plan = buildOutputWorkflowExecutionPlan(nodes, edges)

  assert.deepEqual(plan.levels, [['context'], ['chapter_a', 'chapter_b'], ['assembly']])
  assert.deepEqual(plan.dependencyKeysByNodeKey.assembly.sort(), ['chapter_a', 'chapter_b'])
  assert.deepEqual(plan.diagnostics, [])
})

test('workflow graph view-model exposes statuses, provider backing, and edge port labels', () => {
  const plan = planOutputWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'write the ebook',
    targetFormat: 'pdf',
    selectedEntityKeys: ['hero'],
    selectedSequenceUnitKeys: ['chapter-1', 'chapter-2'],
    snapshot,
  })
  const nodes = plan.nodes.map((node, index) => ({
    ...node,
    id: `node-${index}`,
    workflowId: 'workflow-1',
    createdAt: now,
    updatedAt: now,
  }))
  const edges = plan.edges.map((edge, index) => ({
    ...edge,
    id: `edge-${index}`,
    workflowId: 'workflow-1',
    createdAt: now,
    updatedAt: now,
  }))
  const steps = [{
    id: 'step-1',
    runId: 'run-1',
    workflowId: 'workflow-1',
    nodeId: 'node-0',
    nodeKey: 'outline',
    nodeType: 'text_llm' as const,
    status: 'running' as const,
    orderIndex: 1,
    label: 'Outline / TOC',
    inputHash: '',
    outputHash: '',
    outputs: {},
    provider: 'openai',
    model: 'gpt-5.2',
    providerRequestId: 'resp_123',
    errorMessage: null,
    metadata: { providerStatus: 'in_progress' },
    startedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  }]

  const viewModel = buildOutputWorkflowGraphViewModel({ nodes, edges, steps })
  const outline = viewModel.nodes.find((node) => node.key === 'outline')
  const contextEdge = viewModel.edges.find((edge) => edge.sourceNodeKey === 'world_context' && edge.targetNodeKey === 'outline')

  assert.equal(viewModel.diagnostics.length, 0)
  assert.equal(outline?.status, 'running')
  assert.equal(outline?.providerBacked, true)
  assert.equal(contextEdge?.sourcePort, 'context')
  assert.equal(contextEdge?.targetPort, 'context')
})

test('workflow graph level layout keeps parallel chapter nodes in one column', () => {
  const plan = planOutputWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'write the ebook',
    targetFormat: 'pdf',
    selectedEntityKeys: ['hero'],
    selectedSequenceUnitKeys: ['chapter-1', 'chapter-2'],
    snapshot,
  })
  const nodes = plan.nodes.map((node, index) => ({
    ...node,
    id: `node-${index}`,
    workflowId: 'workflow-1',
    createdAt: now,
    updatedAt: now,
  }))
  const edges = plan.edges.map((edge, index) => ({
    ...edge,
    id: `edge-${index}`,
    workflowId: 'workflow-1',
    createdAt: now,
    updatedAt: now,
  }))
  const positions = buildOutputWorkflowLevelLayout({ nodes, edges })
  const firstChapter = positions.get('chapter_001_prose')
  const secondChapter = positions.get('chapter_002_prose')

  assert.ok(firstChapter)
  assert.ok(secondChapter)
  assert.equal(firstChapter?.x, secondChapter?.x)
  assert.notEqual(firstChapter?.y, secondChapter?.y)
  assert.deepEqual(buildOutputWorkflowTargetedRunMetadata('chapter_001_prose', 'run-1'), {
    sourceRunId: 'run-1',
    runMode: 'targeted_node_only_preview',
    runScope: 'node_only',
    targetNodeKeys: ['chapter_001_prose'],
    forceNodeKeys: ['chapter_001_prose'],
    reuseExistingUpstreamOutputs: true,
    allowStaleUpstreamOutputs: true,
  })
})

test('selects targeted run subgraph with ancestors only', () => {
  const nodes = [
    { key: 'context' },
    { key: 'outline' },
    { key: 'chapter_a' },
    { key: 'chapter_b' },
    { key: 'assembly' },
    { key: 'artifact' },
  ]
  const edges = [
    { sourceNodeKey: 'context', targetNodeKey: 'outline' },
    { sourceNodeKey: 'outline', targetNodeKey: 'chapter_a' },
    { sourceNodeKey: 'outline', targetNodeKey: 'chapter_b' },
    { sourceNodeKey: 'chapter_a', targetNodeKey: 'assembly' },
    { sourceNodeKey: 'chapter_b', targetNodeKey: 'assembly' },
    { sourceNodeKey: 'assembly', targetNodeKey: 'artifact' },
  ]

  const chapterOnly = selectOutputWorkflowRunSubgraph({ nodes, edges, targetNodeKeys: ['chapter_a'] })
  assert.deepEqual(chapterOnly.nodes.map((node) => node.key), ['context', 'outline', 'chapter_a'])
  assert.deepEqual(chapterOnly.edges.map((edge) => `${edge.sourceNodeKey}->${edge.targetNodeKey}`), [
    'context->outline',
    'outline->chapter_a',
  ])

  const artifactOnly = selectOutputWorkflowRunSubgraph({ nodes, edges, targetNodeKeys: ['artifact'] })
  assert.deepEqual(artifactOnly.nodes.map((node) => node.key), ['context', 'outline', 'chapter_a', 'chapter_b', 'assembly', 'artifact'])
  assert.deepEqual(artifactOnly.diagnostics, [])

  const missing = selectOutputWorkflowRunSubgraph({ nodes, edges, targetNodeKeys: ['missing'] })
  assert.equal(missing.diagnostics.length, 1)
})

test('selects targeted run subgraphs by run scope', () => {
  const nodes = [
    { key: 'context' },
    { key: 'script' },
    { key: 'page_a' },
    { key: 'page_b' },
    { key: 'pdf' },
    { key: 'artifact' },
  ]
  const edges = [
    { sourceNodeKey: 'context', targetNodeKey: 'script' },
    { sourceNodeKey: 'script', targetNodeKey: 'page_a' },
    { sourceNodeKey: 'script', targetNodeKey: 'page_b' },
    { sourceNodeKey: 'page_a', targetNodeKey: 'pdf' },
    { sourceNodeKey: 'page_b', targetNodeKey: 'pdf' },
    { sourceNodeKey: 'pdf', targetNodeKey: 'artifact' },
  ]

  const nodeOnly = selectOutputWorkflowRunSubgraph({ nodes, edges, targetNodeKeys: ['page_a'], runScope: 'node_only' })
  assert.deepEqual(nodeOnly.nodes.map((node) => node.key), ['page_a'])
  assert.deepEqual(nodeOnly.edges, [])

  const downstream = selectOutputWorkflowRunSubgraph({ nodes, edges, targetNodeKeys: ['page_a'], runScope: 'node_and_downstream' })
  assert.deepEqual(downstream.nodes.map((node) => node.key), ['page_a', 'pdf', 'artifact'])
  assert.deepEqual(downstream.edges.map((edge) => `${edge.sourceNodeKey}->${edge.targetNodeKey}`), [
    'page_a->pdf',
    'pdf->artifact',
  ])
})

test('dirty propagation marks downstream nodes only', () => {
  const dirty = markDirtyOutputWorkflowNodes({
    changedNodeKeys: ['outline'],
    nodes: [{ key: 'context' }, { key: 'outline' }, { key: 'chapters' }, { key: 'artifact' }],
    edges: [
      { sourceNodeKey: 'context', targetNodeKey: 'outline' },
      { sourceNodeKey: 'outline', targetNodeKey: 'chapters' },
      { sourceNodeKey: 'chapters', targetNodeKey: 'artifact' },
    ],
  })

  assert.deepEqual(dirty.filter((node) => node.dirty).map((node) => node.key).sort(), ['artifact', 'chapters', 'outline'])
})

test('fingerprints are stable and change when world context changes', () => {
  const first = buildOutputWorkflowFingerprint({
    worldEntities: snapshot.worldEntities,
    worldRelationships: snapshot.worldRelationships,
    worldWiki: snapshot.worldWiki,
  })
  const second = buildOutputWorkflowFingerprint({
    worldEntities: snapshot.worldEntities,
    worldRelationships: snapshot.worldRelationships,
    worldWiki: snapshot.worldWiki,
  })
  const changed = buildOutputWorkflowFingerprint({
    worldEntities: snapshot.worldEntities,
    worldRelationships: snapshot.worldRelationships,
    worldWiki: { ...snapshot.worldWiki, title: 'Changed' },
  })

  assert.equal(first, second)
  assert.notEqual(first, changed)
})

test('ebook preset binds sequence units and creates PDF artifact chain', () => {
  const plan = planOutputWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Generate an ebook PDF from the world.',
    selectedEntityKeys: ['hero'],
    selectedSequenceUnitKeys: ['chapter-1', 'chapter-2'],
    targetFormat: 'pdf',
    snapshot,
  })

  assert.equal(plan.preset, 'ebook_from_world')
  assert.deepEqual(plan.sourceSequenceUnitKeys, ['chapter-1', 'chapter-2'])
  assert.ok(plan.nodes.some((node) => node.key === 'skill_context' && node.nodeType === 'skill_context_query'))
  assert.ok(plan.nodes.some((node) => node.nodeType === 'document_render'))
  assert.ok(plan.nodes.some((node) => node.nodeType === 'output_artifact'))
  assert.ok(plan.nodes.some((node) => node.key === 'chapter_001_prose'))
  assert.ok(plan.nodes.some((node) => node.key === 'chapter_002_prose'))
  assert.ok(plan.nodes.some((node) => node.key === 'cover_prompt' && node.nodeType === 'text_llm'))
  assert.ok(plan.nodes.some((node) => node.key === 'cover_image' && node.nodeType === 'image_generation'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'cover_prompt' && edge.targetNodeKey === 'cover_image'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'cover_image' && edge.targetNodeKey === 'document_render' && edge.targetPort === 'cover'))
  assert.equal(plan.nodes.some((node) => node.key.includes('_section_')), false)
  assert.equal(validateOutputWorkflowGraph({
    nodes: plan.nodes,
    edges: plan.edges,
  }).ok, true)
})

test('ebook preset fans full chapter prose nodes out before chapter assembly', () => {
  const plan = planOutputWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Generate an ebook PDF from the world.',
    selectedEntityKeys: ['hero'],
    selectedSequenceUnitKeys: ['chapter-1', 'chapter-2'],
    targetFormat: 'pdf',
    snapshot,
  })

  const executionPlan = buildOutputWorkflowExecutionPlan(plan.nodes, plan.edges)
  const chapterProseLevel = executionPlan.levels.find((level) => level.includes('chapter_001_prose'))
  const chapterNode = plan.nodes.find((node) => node.key === 'chapter_001_prose')

  assert.ok(chapterProseLevel?.includes('chapter_001_prose'))
  assert.ok(chapterProseLevel?.includes('chapter_002_prose'))
  assert.deepEqual(executionPlan.dependencyKeysByNodeKey.cover_image.sort(), ['cover_prompt', 'skill_context'])
  assert.ok(executionPlan.dependencyKeysByNodeKey.document_render.includes('cover_image'))
  assert.equal(defaultOutputWorkflowConcurrency.global, 8)
  assert.equal(defaultOutputWorkflowConcurrency.resourceClasses.llm, 8)
  assert.equal(defaultOutputWorkflowConcurrency.resourceClasses.image, 8)
  assert.equal(defaultOutputWorkflowConcurrency.resourceClasses.video, 8)
  assert.equal(defaultOutputWorkflowConcurrency.resourceClasses.utility, 8)
  assert.equal(chapterNode ? getOutputWorkflowNodeExecutionMetadata(chapterNode).maxConcurrency : undefined, 8)
  assert.equal(getOutputWorkflowNodeExecutionMetadata({
    nodeType: 'image_generation',
    config: { execution: { resourceClass: 'image', groupKey: 'cinematic_v2_shot_keyframes', maxConcurrency: 3 } },
    metadata: {},
  }).maxConcurrency, 8)
  assert.deepEqual(executionPlan.dependencyKeysByNodeKey.chapter_assembly.sort(), ['chapter_001_prose', 'chapter_002_prose'])
  assert.deepEqual(executionPlan.dependencyKeysByNodeKey.chapter_001_prose.sort(), [
    'chapter_plan',
    'skill_context',
    'world_context',
  ])
})

test('comic issue preset requires one sequence unit and creates fixed page fan-out', () => {
  const plan = planOutputWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a comic issue from this sequence unit.',
    preset: 'comic_issue_from_sequence',
    selectedSequenceUnitKeys: ['chapter-1'],
    pageCount: 4,
    targetFormat: 'pdf',
    snapshot,
  })

  assert.equal(plan.preset, 'comic_issue_from_sequence')
  assert.deepEqual(plan.sourceSequenceUnitKeys, ['chapter-1'])
  assert.ok(plan.sourceEntityKeys.includes('hero'))
  assert.ok(plan.sourceEntityKeys.includes('archive'))
  assert.ok(!plan.sourceEntityKeys.includes('chapter-2'))
  assert.ok(plan.nodes.some((node) => node.key === 'comic_scene_script' && readConfigPurpose(node) === 'comic_scene_script'))
  assert.ok(plan.nodes.some((node) => node.key === 'comic_page_plan' && readConfigPurpose(node) === 'comic_page_plan'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'world_context' && edge.targetNodeKey === 'comic_scene_script' && edge.targetPort === 'context'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'skill_context' && edge.targetNodeKey === 'comic_scene_script' && edge.targetPort === 'guidance'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'relevant_entities' && edge.targetNodeKey === 'comic_scene_script' && edge.targetPort === 'asset_pack'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'comic_scene_script' && edge.targetNodeKey === 'comic_page_plan'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'comic_page_plan' && edge.targetNodeKey === 'comic_script'))
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'comic_page_prompt').length, 4)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'comic_page').length, 4)
  assert.equal(plan.nodes.find((node) => node.key === 'page_001_prompt')?.nodeType, 'utility_transform')
  assert.ok(plan.nodes.some((node) => node.key === 'relevant_entities' && readConfigPurpose(node) === 'comic_entity_selector'))
  assert.equal(plan.nodes.some((node) => node.key === 'comic_atlas_prompt'), false)
  assert.equal(plan.nodes.some((node) => node.key === 'comic_atlas_image'), false)
  assert.ok(plan.nodes.some((node) => node.key === 'comic_pdf_render' && node.nodeType === 'document_render'))
  const pageImage = plan.nodes.find((node) => node.key === 'page_001_image')
  const pageImageSize = pageImage?.config.imageSize as { width?: number; height?: number } | undefined
  assert.equal((pageImageSize?.width ?? 0) % 16, 0)
  assert.equal((pageImageSize?.height ?? 0) % 16, 0)
  assert.equal(pageImage?.config.maxReferenceImages, 6)
  assert.equal(pageImage ? getOutputWorkflowNodeExecutionMetadata(pageImage).maxConcurrency : undefined, 8)
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'relevant_entities' && edge.targetNodeKey === 'page_001_image' && edge.targetPort === 'references'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'page_001_prompt' && edge.targetNodeKey === 'page_001_image' && edge.targetPort === 'asset_pack'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'page_004_image' && edge.targetNodeKey === 'comic_pdf_render' && edge.targetPort === 'pages'))
  assert.equal(validateOutputWorkflowGraph({ nodes: plan.nodes, edges: plan.edges }).ok, true)
})

test('comic scene script return path does not reference comic script repair state', () => {
  const sharedSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const sceneScriptBranch = sharedSource.slice(
    sharedSource.indexOf("if (purpose === 'comic_scene_script')"),
    sharedSource.indexOf("if (purpose === 'comic_page_plan')"),
  )

  assert.ok(sceneScriptBranch.includes('providerRequestId: readText(response.body.id)'))
  assert.equal(sceneScriptBranch.includes('repairResponse'), false)
})

test('comic issue page images run in parallel and PDF waits for all pages', () => {
  const plan = planOutputWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'comic from chapter one',
    selectedSequenceUnitKeys: ['chapter-1'],
    pageCount: 3,
    targetFormat: 'pdf',
    snapshot,
  })
  const executionPlan = buildOutputWorkflowExecutionPlan(plan.nodes, plan.edges)
  const pageImageLevel = executionPlan.levels.find((level) => level.includes('page_001_image'))

  assert.equal(plan.preset, 'comic_issue_from_sequence')
  assert.ok(pageImageLevel?.includes('page_001_image'))
  assert.ok(pageImageLevel?.includes('page_002_image'))
  assert.ok(pageImageLevel?.includes('page_003_image'))
  assert.deepEqual(executionPlan.dependencyKeysByNodeKey.comic_pdf_render.sort(), [
    'comic_script',
    'page_001_image',
    'page_002_image',
    'page_003_image',
  ])
  assert.deepEqual([...new Set(executionPlan.dependencyKeysByNodeKey.page_001_image)].sort(), [
    'page_001_prompt',
    'relevant_entities',
    'skill_context',
  ])
})

test('optional cover branch failure still allows document render to run with errors', async () => {
  const nodes = [
    { key: 'manuscript', nodeType: 'text_llm' as const, config: {}, metadata: {} },
    { key: 'cover', nodeType: 'image_generation' as const, config: { execution: { continueOnError: true } }, metadata: {} },
    { key: 'document', nodeType: 'document_render' as const, config: {}, metadata: {} },
  ]
  const edges = [
    { sourceNodeKey: 'manuscript', sourcePort: 'text', targetNodeKey: 'document', targetPort: 'source', metadata: {} },
    { sourceNodeKey: 'cover', sourcePort: 'image', targetNodeKey: 'document', targetPort: 'cover', metadata: { optional: true } },
  ]
  const completed: string[] = []
  const failed: string[] = []

  const result = await runOutputWorkflowReadyQueue({
    nodes,
    edges,
    executeNode: async ({ node }) => {
      if (node.key === 'cover') throw new Error('cover failed')
      return { outputs: { text: node.key } }
    },
    onNodeComplete: ({ node }) => {
      completed.push(node.key)
    },
    onNodeFailed: ({ node }) => {
      failed.push(node.key)
    },
  })

  assert.equal(result.status, 'completed_with_errors')
  assert.deepEqual(failed, ['cover'])
  assert.ok(completed.includes('document'))
})

test('ebook nodes carry guidance config and invalid skill keys produce diagnostics', () => {
  const plan = planOutputWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Generate an ebook PDF from the world.',
    selectedEntityKeys: ['hero'],
    selectedSequenceUnitKeys: ['chapter-1', 'chapter-2'],
    targetFormat: 'pdf',
    snapshot,
  })
  const chapterNode = plan.nodes.find((node) => node.key === 'chapter_001_prose')
  assert.ok(chapterNode)
  const guidance = buildOutputGuidanceBundleForNode({ node: chapterNode!, worldWiki: snapshot.worldWiki })

  assert.ok(guidance.skillKeys.includes('fiction_prose_voice'))
  assert.ok(guidance.skillKeys.includes('anti_ai_telltales'))
  assert.ok(guidance.skillKeys.includes('fiction_pov_balance'))

  const invalidPlan = validateOutputWorkflowGraph({
    nodes: [{ ...chapterNode!, config: { ...chapterNode!.config, skillKeys: ['missing_skill'] } }],
    edges: [],
    worldWiki: snapshot.worldWiki,
  })
  assert.equal(invalidPlan.ok, false)
  assert.ok(invalidPlan.diagnostics.some((diagnostic) => diagnostic.includes('missing_skill')))
})

test('changing node skill keys changes workflow input hash material', () => {
  const baseHash = hashOutputWorkflowValue({
    nodeConfig: { purpose: 'chapter_prose', skillKeys: ['fiction_prose_voice'] },
    upstream: {},
  })
  const changedHash = hashOutputWorkflowValue({
    nodeConfig: { purpose: 'chapter_prose', skillKeys: ['fiction_prose_voice', 'anti_ai_telltales'] },
    upstream: {},
  })

  assert.notEqual(baseHash, changedHash)
})

test('ready queue runs independent nodes concurrently within global cap', async () => {
  const nodes = [
    { key: 'a', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
    { key: 'b', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
    { key: 'c', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
  ]
  let running = 0
  let maxRunning = 0
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })

  await runOutputWorkflowReadyQueue({
    nodes,
    edges: [],
    globalMaxConcurrency: 2,
    executeNode: async ({ node }) => {
      running += 1
      maxRunning = Math.max(maxRunning, running)
      if (running === 2) release()
      await gate
      running -= 1
      return { outputs: { nodeKey: node.key } }
    },
  })

  assert.equal(maxRunning, 2)
})

test('ready queue can run eight independent video nodes in parallel by default', async () => {
  const nodes = Array.from({ length: 8 }, (_, index) => ({
    key: `video_${index + 1}`,
    nodeType: 'video_generation' as const,
    config: { execution: { resourceClass: 'video', groupKey: 'cinematic_videos', maxConcurrency: 8 } },
    metadata: {},
  }))
  let running = 0
  let maxRunning = 0

  const result = await runOutputWorkflowReadyQueue({
    nodes,
    edges: [],
    executeNode: async ({ node }) => {
      running += 1
      maxRunning = Math.max(maxRunning, running)
      await new Promise((resolve) => setTimeout(resolve, 10))
      running -= 1
      return { outputs: { nodeKey: node.key } }
    },
  })

  assert.equal(result.status, 'completed')
  assert.equal(maxRunning, 8)
  assert.equal(result.completed.length, 8)
})

test('ready queue respects resource class caps', async () => {
  const nodes = [
    { key: 'a', nodeType: 'text_llm' as const, config: {}, metadata: {} },
    { key: 'b', nodeType: 'text_llm' as const, config: {}, metadata: {} },
    { key: 'c', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
  ]
  let runningLlm = 0
  let maxRunningLlm = 0

  await runOutputWorkflowReadyQueue({
    nodes,
    edges: [],
    globalMaxConcurrency: 3,
    resourceClassMaxConcurrency: { llm: 1, utility: 3 },
    executeNode: async ({ node, resourceClass }) => {
      if (resourceClass === 'llm') {
        runningLlm += 1
        maxRunningLlm = Math.max(maxRunningLlm, runningLlm)
      }
      await Promise.resolve()
      if (resourceClass === 'llm') runningLlm -= 1
      return { outputs: { nodeKey: node.key } }
    },
  })

  assert.equal(maxRunningLlm, 1)
})

test('ready queue lets hash-skipped nodes unlock dependents', async () => {
  const nodes = [
    { key: 'cached', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
    { key: 'dependent', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
  ]
  const seen: string[] = []
  const result = await runOutputWorkflowReadyQueue({
    nodes,
    edges: [{ sourceNodeKey: 'cached', sourcePort: 'output', targetNodeKey: 'dependent', targetPort: 'input' }],
    executeNode: async ({ node, upstream }) => {
      seen.push(node.key)
      if (node.key === 'cached') return { status: 'skipped', outputs: { value: 1 } }
      assert.equal(upstream.cached.value, 1)
      return { outputs: { value: 2 } }
    },
  })

  assert.deepEqual(seen, ['cached', 'dependent'])
  assert.deepEqual(result.skipped, ['cached'])
  assert.equal(result.status, 'completed')
})

test('ready queue pauses on resumable waiting nodes without running dependents', async () => {
  const nodes = [
    { key: 'wait_for_child', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
    { key: 'downstream', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
  ]
  const seen: string[] = []
  let waitingNodeKey = ''
  const result = await runOutputWorkflowReadyQueue({
    nodes,
    edges: [{ sourceNodeKey: 'wait_for_child', sourcePort: 'output', targetNodeKey: 'downstream', targetPort: 'input' }],
    executeNode: async ({ node }) => {
      seen.push(node.key)
      if (node.key === 'wait_for_child') {
        return {
          status: 'waiting',
          resumeAfterMs: 2_500,
          outputs: {
            waiting: true,
            resumable: true,
            childRequestId: 'child-1',
          },
        }
      }
      return { outputs: { nodeKey: node.key } }
    },
    onNodeWaiting: ({ node, resumeAfterMs }) => {
      waitingNodeKey = node.key
      assert.equal(resumeAfterMs, 2_500)
    },
  })

  assert.equal(result.status, 'waiting')
  assert.equal(result.waitingNodeKey, 'wait_for_child')
  assert.equal(result.resumeAfterMs, 2_500)
  assert.deepEqual(result.completed, [])
  assert.deepEqual(seen, ['wait_for_child'])
  assert.equal(waitingNodeKey, 'wait_for_child')
})

test('ready queue blocks failed optional branch and completes independent branches with errors', async () => {
  const nodes = [
    { key: 'optional', nodeType: 'utility_transform' as const, config: { execution: { continueOnError: true } }, metadata: {} },
    { key: 'dependent', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
    { key: 'independent', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
  ]
  const cancelled: string[] = []
  const result = await runOutputWorkflowReadyQueue({
    nodes,
    edges: [{ sourceNodeKey: 'optional', sourcePort: 'output', targetNodeKey: 'dependent', targetPort: 'input' }],
    executeNode: async ({ node }) => {
      if (node.key === 'optional') throw new Error('Optional branch failed.')
      return { outputs: { nodeKey: node.key } }
    },
    onNodeCancelled: ({ node }) => {
      cancelled.push(node.key)
    },
  })

  assert.equal(result.status, 'completed_with_errors')
  assert.deepEqual(result.failed, ['optional'])
  assert.deepEqual(cancelled, ['dependent'])
  assert.deepEqual(result.completed, ['independent'])
})

test('ready queue treats running node cancellation as cancelled and cancels pending descendants', async () => {
  const nodes = [
    { key: 'running', nodeType: 'text_llm' as const, config: {}, metadata: {} },
    { key: 'dependent', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
  ]
  const cancelled: string[] = []
  const error = new Error('Cancelled by user.') as Error & { workflowCancelled: boolean }
  error.workflowCancelled = true

  const result = await runOutputWorkflowReadyQueue({
    nodes,
    edges: [{ sourceNodeKey: 'running', sourcePort: 'text', targetNodeKey: 'dependent', targetPort: 'input' }],
    executeNode: async () => {
      throw error
    },
    onNodeCancelled: ({ node }) => {
      cancelled.push(node.key)
    },
  })

  assert.equal(result.status, 'cancelled')
  assert.deepEqual(cancelled, ['running', 'dependent'])
})

test('worker persists cache status metadata for fresh skipped and recovered nodes', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')

  assert.match(source, /buildOutputWorkflowNodeExecutionCacheMetadata/)
  assert.match(source, /cachedInputUpstream/)
  assert.match(source, /cachedInputNodeKeys/)
  assert.match(source, /cacheStatus/)
  assert.match(source, /recoveredFromRunStep: true/)
  assert.match(source, /skippedReason/)
  assert.match(source, /outputPreview: buildOutputWorkflowNodeOutputPreview/)
  assert.match(source, /sourceRunIdForCache/)
  assert.match(source, /outputWorkflowRunStepSelect/)
})

test('dynamic cinematic fanout marks obsolete nodes stale instead of deleting active graph nodes', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const obsoleteSections = source.match(/obsoleteDynamicNodes[\s\S]{0,900}?dynamicCinematicStale[\s\S]{0,400}?replacedByDynamicCompileHash/g) ?? []

  assert.equal(obsoleteSections.length >= 2, true)
  assert.doesNotMatch(source, /obsoleteDynamicNodeKeys[\s\S]{0,240}?\.delete\(\)\.eq\('workflow_id'/)
})

test('dynamic cinematic execution ignores stale materialized nodes when settling fanout', () => {
  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const startRunSource = readFileSync(resolve(repoRoot, 'supabase/functions/start-output-workflow-run/index.ts'), 'utf8')

  assert.match(workerSource, /function isStaleDynamicCinematicNode/)
  assert.match(workerSource, /function isDynamicCinematicFanoutNodeKey/)
  assert.match(workerSource, /existingDynamicNodes = allExistingDynamicNodes\.filter\(\(row\) => !isStaleDynamicCinematicNode\(row\)\)/)
  assert.match(workerSource, /activeWorkflowNodes = bundle\.nodes\.filter\(\(node\) => !isStaleDynamicCinematicNode\(node\)\)/)
  assert.match(workerSource, /activeWorkflowEdges = bundle\.edges\.filter/)
  assert.match(workerSource, /nodes: activeWorkflowNodes/)
  assert.match(workerSource, /edges: activeWorkflowEdges/)
  assert.match(workerSource, /targetsSequenceAnimaticScenePlanFanout/)
  assert.match(workerSource, /hasMaterializedDynamicFanoutDependents/)
  assert.match(workerSource, /continueDynamicFanoutDependents/)
  assert.match(workerSource, /runScope !== 'node_only'[\s\S]*targetsSequenceAnimaticScenePlanFanout/)
  assert.match(workerSource, /targetNodeKeys: continueDynamicFanoutDependents \? \['artifact'\] : targetNodeKeys/)
  assert.match(workerSource, /runScope: continueDynamicFanoutDependents[\s\S]*'upstream_to_node'/)
  assert.doesNotMatch(workerSource, /dynamicFanoutRan/)
  assert.match(startRunSource, /dynamicCinematicStale/)
})

test('dynamic cinematic execution does not loop on cached fanout expansion outputs', () => {
  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')

  assert.match(workerSource, /dynamicFanoutWasCacheSkipped/)
  assert.match(workerSource, /schedulerResult\.skipped\.includes\(dynamicFanoutNodeKey\)/)
  assert.match(workerSource, /dynamicGraphExpanded && dynamicFanoutNodeKey && !dynamicFanoutWasCacheSkipped/)
  assert.match(workerSource, /Cinematic dynamic workflow expansion did not settle after 4 scheduler passes/)
})

test('selected-shot cinematic materialization preserves existing non-target dynamic outputs', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')

  assert.match(source, /preserveExistingDynamicNodeOutput/)
  assert.match(source, /selectedShotMaterialization/)
  assert.match(source, /preservedDuringSelectedShotMaterialization/)
  assert.match(source, /outputWorkflowNodeSelect/)
  assert.match(source, /upsert\(nodeRows\.map\(preserveNodeRow\)/)
  assert.match(source, /selectedShotKeyframeNode/)
  assert.match(source, /function uniqueStrings/)
  assert.match(source, /function resolveCinematicV2QualityShotIds[\s\S]*uniqueStrings/)
})

test('cinematic v3 dynamic rematerialization preserves durable node outputs and previews', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')

  assert.match(source, /materializeDynamicCinematicV3StoryboardFanout/)
  assert.match(source, /existingDynamicNodeByKey/)
  assert.match(source, /existingStepByNodeKey/)
  assert.match(source, /hasRecoverableStepOutput/)
  assert.match(source, /preserveV3NodeRow/)
  assert.match(source, /existingStep: existingStepByNodeKey\.get\(key\) \?\? null/)
  assert.match(source, /preservedFromRunStep/)
  assert.match(source, /preservedDuringDynamicRematerialization/)
  assert.match(source, /dynamic_node_config_changed/)
  assert.match(source, /nextConfigHash !== existingConfigHash/)
  assert.match(source, /dynamicV3GraphPersistenceVersion/)
  assert.match(source, /readText\(asRecord\(existingNode\?\.config\)\.purpose\)[\s\S]*readText\(asRecord\(row\.config\)\.purpose\)/)
  assert.match(source, /upsert\(nodeRows/)
})

test('output worker repairs artifact-backed nodes left running after upload interruptions', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')

  assert.match(source, /function buildRecoveredNodeOutputsFromOutputArtifact/)
  assert.match(source, /async function recoverArtifactBackedWorkflowNodeOutputs/)
  assert.match(source, /recoveredFromArtifact/)
  assert.match(source, /const recoveredArtifactNodeCount = await recoverArtifactBackedWorkflowNodeOutputs/)
  assert.match(source, /if \(recoveredArtifactNodeCount > 0\)[\s\S]*loadOutputWorkflowRunBundle/)
  assert.match(source, /async function loadRecoverableArtifactBackedNodeOutputs/)
  assert.match(source, /const recoverableArtifact = await loadRecoverableArtifactBackedNodeOutputs/)
  assert.match(source, /terminalProviderStepMetadata/)
  assert.match(source, /providerStatus: 'COMPLETED'/)
})

test('cinematic v3 storyboard prompt previews lead with unique group summary', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')

  assert.match(source, /const storyboardGroup = asRecord\(outputs\.storyboardGroup\)/)
  assert.match(source, /Storyboard \$\{storyboardIndex \|\| ''\}: \$\{storyboardSummary\}/)
})

test('output Fal image progress stores provider submission age for stale request recovery', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')

  assert.match(source, /function outputWorkflowFalStaleRequestMs/)
  assert.match(source, /providerSubmittedAt/)
  assert.match(source, /inferUuidV7TimestampIso/)
  assert.match(source, /providerElapsedMs/)
  assert.match(source, /staleRequestRestarted/)
  assert.match(source, /providerStatus: 'TIMED_OUT'/)
  assert.match(source, /Fal image request \$\{requestId\} timed out/)
  assert.match(source, /Date\.now\(\) - providerSubmittedAtMs > outputWorkflowFalStaleRequestMs\(\)/)
})

test('cinematic v3 default graph stops at authoring timeline and keeps video nodes manual-only', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')

  assert.match(source, /purpose: 'cinematic_v3_storyboard_group_video'/)
  assert.match(source, /manualOnly: true/)
  assert.match(source, /isManualOnlyOutputWorkflowNode/)
  assert.match(source, /executionNodes = executionNodes\.filter\(manualNodeAllowed\)/)
  assert.match(source, /extractKey\}__timeline_panels/)
  assert.match(source, /videoPromptKey\}__timeline_prompt/)
  assert.match(source, /\$\{extractKey\}__timeline_panels[\s\S]*authoringOptional: true/)
  assert.match(source, /\$\{videoPromptKey\}__timeline_prompt[\s\S]*authoringOptional: true/)
  assert.match(source, /targetNodeKey: 'cinematic_v3_timeline_assemble', targetPort: 'videos', metadata: \{[^}]*optional: true/)
  assert.match(source, /sourceNodeKey\.startsWith\('cinematic_v3_storyboard_group_'\)/)
  assert.match(source, /targetNodeKey === 'cinematic_v3_timeline_assemble'/)
  assert.match(source, /model: 'cinematic-v3-authoring-timeline-v1'/)
  assert.match(source, /shotPlan,\s*shot_plan: shotPlan/)
  assert.match(source, /registerOtherOutputArtifact/)
  assert.match(source, /role: 'cinematic_v3_authoring_timeline'[\s\S]*shotPlan/)
  assert.match(source, /model: 'cinematic-v3-authoring-artifact-v1'/)
  assert.match(source, /v3AuthoringReady/)
  assert.match(source, /nonCriticalCompletedWithErrors/)
  assert.match(source, /Cinematics V3 storyboard video generation requires a completed Video Prompt node/)
  assert.match(source, /Cinematics V3 storyboard video generation requires the storyboard sheet reference/)
  assert.match(source, /role === 'cinematic_v3_storyboard_sheet'/)
  assert.match(source, /usedAsVideoReference/)
  assert.match(source, /loadLatestWorkflowStepOutputsByNodeKey/)
  assert.match(source, /loadRecoverableWorkflowArtifactOutputsByNodeKey/)
  assert.doesNotMatch(source, /\.in\('status', \['completed', 'skipped'\]\)/)
  assert.match(source, /recoveredOutputsByNodeKey/)
  assert.match(source, /outputContainsEdgePortValue/)
  assert.match(source, /readUpstreamImages\(\{ value: record \}/)
  assert.match(source, /resolveProjectAssetByKey\(client, run, assetKey\)/)
  assert.match(source, /imageReferenceToFalUrl\(input\.client, image, input\.run\)/)
  assert.match(source, /function buildCinematicV3StoryboardGroupAssetPack/)
  assert.match(source, /referenceScope: 'cinematic_v3_storyboard_group'/)
  assert.match(source, /purpose === 'cinematic_v3_storyboard_prompt'[\s\S]*buildCinematicV3StoryboardGroupAssetPack/)
  assert.match(source, /purpose === 'cinematic_v3_storyboard_sheet'[\s\S]*buildCinematicV3StoryboardGroupAssetPack/)
  assert.match(source, /isCinematicV3StoryboardGroupVideo[\s\S]*buildCinematicV3StoryboardGroupAssetPack/)
  assert.match(source, /rewriteSeedanceReferenceLegend\(prompt, manifest, \(isCinematicV3StoryboardGroupVideo \|\| isSequenceAnimaticShotVideo\) \? '' : referencePolicy\)/)
  assert.match(source, /if \(isCinematicV3StoryboardGroupVideo \|\| isSequenceAnimaticShotVideo\) \{[\s\S]*compactSeedancePromptForProvider\(directPrompt\)/)
  assert.doesNotMatch(source, /purpose === 'cinematic_v3_storyboard_group_video_prompt'[\s\S]{0,5000}User brief:/)
  assert.match(source, /seedance-2-vip-omni-reference'.*DEFAULT_MUAPI_VIDEO_MODEL/s)
  assert.match(source, /resolveMuapiVideoDurationSeconds/)
  assert.match(source, /OUTPUT_WORKFLOW_MUAPI_VIDEO_QUALITY/)
  assert.match(source, /Provider response:/)
})

test('graph loader returns cache status diagnostics without bulk node outputs', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/get-output-workflow-graph/index.ts'), 'utf8')

  assert.match(source, /buildGraphNodesWithCacheStatus/)
  assert.match(source, /missingRequiredUpstreamKeys/)
  assert.match(source, /staleUpstreamKeys/)
  assert.match(source, /cacheStatus/)
  assert.match(source, /outputWorkflowNodeStatusSelect/)
  assert.match(source, /knownGraphRevision/)
  assert.match(source, /unchanged/)
  assert.doesNotMatch(source, /select\(outputWorkflowNodeSelect\)\.eq\('workflow_id', payload\.workflowId\)\.eq\('draft_id'/)
})

test('graph loader recovers cinematic previews from durable artifacts and run-step previews', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/get-output-workflow-graph/index.ts'), 'utf8')

  assert.match(source, /buildRecoveredNodeOutputPreview/)
  assert.match(source, /recoveredFromRunStepPreview/)
  assert.match(source, /recoveredFromArtifacts/)
  assert.match(source, /buildRecoveredNodeOutputsFromArtifacts/)
  assert.match(source, /outputRecoverable/)
  assert.match(source, /assetKeys/)
  assert.match(source, /selectedNodeOutput/)
})

test('outputs graph UI defaults to repairable upstream runs when cache is not ready', () => {
  const overlaySource = readFileSync(resolve(repoRoot, 'src/features/outputs/OutputWorkflowGraphOverlay.tsx'), 'utf8')
  const workspaceSource = readFileSync(resolve(repoRoot, 'src/features/outputs/OutputsWorkspace.tsx'), 'utf8')

  assert.match(overlaySource, /Repair Cached Inputs/)
  assert.match(overlaySource, /Run cached node only/)
  assert.match(overlaySource, /selectedDirtyCachedInputs\.length > 0/)
  assert.match(workspaceSource, /buildTargetedRunCachePreflight/)
  assert.match(workspaceSource, /autoRepairUpstream/)
  assert.match(workspaceSource, /requestedRunScope/)
  assert.match(workspaceSource, /effectiveRunScope/)
})
