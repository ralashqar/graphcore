import {
  createWorkflowNodeExtensionScaffold,
  workflowNodeManifestToContract,
  type WorkflowNodeExtensionScaffold,
  type WorkflowNodeRuntimeKind,
} from '../../../src/domain/outputWorkflowManifests.ts'
import { outputWorkflowNodeManifestsByPurpose } from '../../../src/domain/outputWorkflowNodeContracts.ts'
import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import { createWorkflowNodeExecutionResult } from './output-workflow-node-pack-runtime.ts'

type LooseRecord = Record<string, unknown>

type CinematicFanoutNodeExecutionContext = {
  inputHash: string
  node: {
    config: unknown
  }
  run: unknown
  workflow: {
    metadata?: unknown
  }
  upstream: Record<string, LooseRecord>
  client: unknown
}

type CinematicFanoutNodeExecutionResult = {
  inputHash: string
  outputHash: string
  outputs: LooseRecord
  provider: string
  model: string
}

type CinematicV3ShotParseFanoutResult = {
  expanded: boolean
  compileHash: string
  parseGroupCount: number
  storyboardSheetCount: number
}

type CinematicV3StoryboardFanoutResult = {
  expanded: boolean
  compileHash: string
  shotCount: number
  storyboardSheetCount: number
}

type CinematicV2ShotFanoutResult = {
  expanded: boolean
  compileHash: string
  shotCount: number
  storyboardSheetCount: number
}

type CinematicTakeFanoutResult = {
  expanded: boolean
  compileHash: string
  takeCount: number
}

export type CinematicFanoutWorkflowNodePackHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  readFirstUpstreamRecord: (upstream: Record<string, LooseRecord>, fields: string[]) => LooseRecord
  readUpstreamGuidanceBundle: (upstream: Record<string, LooseRecord>) => LooseRecord
  hashOutputWorkflowValue: (value: unknown) => string
  compileCinematicScriptDocForOutput: (input: {
    scriptDoc: LooseRecord
    directorScriptDoc?: LooseRecord | null
    maxDynamicTakes: number
    maxTotalDurationSeconds?: number | null
  }) => LooseRecord
  materializeDynamicCinematicV2ShotFanout: (input: {
    client: unknown
    run: unknown
    workflow: unknown
    compileOutputs: LooseRecord
    config: LooseRecord
  }) => Promise<CinematicV2ShotFanoutResult>
  materializeDynamicCinematicTakeFanout: (input: {
    client: unknown
    workflow: unknown
    compileOutputs: LooseRecord
    config: LooseRecord
  }) => Promise<CinematicTakeFanoutResult>
  materializeDynamicCinematicV3ShotParseFanout: (input: {
    client: unknown
    run: unknown
    workflow: unknown
    compileOutputs: LooseRecord
    config: LooseRecord
  }) => Promise<CinematicV3ShotParseFanoutResult>
  materializeDynamicCinematicV3StoryboardFanout: (input: {
    client: unknown
    run: unknown
    workflow: unknown
    compileOutputs: LooseRecord
    config: LooseRecord
  }) => Promise<CinematicV3StoryboardFanoutResult>
}

function result(input: {
  context: CinematicFanoutNodeExecutionContext
  helpers: CinematicFanoutWorkflowNodePackHelpers
  outputs: LooseRecord
  model: string
}): CinematicFanoutNodeExecutionResult {
  return createWorkflowNodeExecutionResult<CinematicFanoutNodeExecutionResult>({
    context: input.context,
    helpers: input.helpers,
    outputs: input.outputs,
    model: input.model,
  })
}

async function cinematicSequenceCompileNode(
  context: CinematicFanoutNodeExecutionContext,
  helpers: CinematicFanoutWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const scriptDoc = helpers.readFirstUpstreamRecord(context.upstream, ['cinematicScriptDoc', 'scriptDoc'])
  const directorScriptDoc = helpers.readFirstUpstreamRecord(context.upstream, ['directorScriptDoc', 'script'])
  if (Object.keys(scriptDoc).length === 0) {
    throw new Error('Cinematic sequence compile requires an authored cinematic script document.')
  }
  const compiled = helpers.compileCinematicScriptDocForOutput({
    scriptDoc,
    directorScriptDoc,
    maxDynamicTakes: Number(config.maxDynamicTakes ?? 6) || 6,
    maxTotalDurationSeconds: Number(config.maxTotalDurationSeconds ?? 60) || 60,
  })
  const guidance = helpers.readUpstreamGuidanceBundle(context.upstream)
  const outputs = {
    ...compiled,
    guidance,
    text: JSON.stringify({
      dynamicTakeCount: compiled.dynamicTakeCount,
      totalDurationSeconds: compiled.totalDurationSeconds,
      diagnostics: compiled.diagnostics,
    }, null, 2),
    deterministic: true,
  }
  return result({
    context,
    helpers,
    outputs,
    model: 'deterministic-cinematic-sequence-compile-v1',
  })
}

async function cinematicV2DynamicShotFanoutNode(
  context: CinematicFanoutNodeExecutionContext,
  helpers: CinematicFanoutWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const compileOutputs = {
    screenplayDraft: helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft']),
    parsedScript: helpers.readFirstUpstreamRecord(context.upstream, ['parsedScript', 'parsed_script']),
    sceneState: helpers.readFirstUpstreamRecord(context.upstream, ['sceneState', 'scene_state']),
    layoutPlan: helpers.readFirstUpstreamRecord(context.upstream, ['layoutPlan', 'layout_plan']),
    shotPlan: helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan']),
    storyboardGroupPlan: helpers.readFirstUpstreamRecord(context.upstream, ['storyboardGroupPlan', 'storyboard_group_plan']),
    cinematicReferencePlan: helpers.readFirstUpstreamRecord(context.upstream, ['cinematicReferencePlan', 'cinematic_reference_plan']),
    compileHash: helpers.readText(config.compileHash),
  }
  const fanout = await helpers.materializeDynamicCinematicV2ShotFanout({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    compileOutputs,
    config,
  })
  const outputs = {
    dynamicGraphExpanded: fanout.expanded,
    graphExpanded: fanout.expanded,
    compileHash: fanout.compileHash,
    dynamicShotCount: fanout.shotCount,
    storyboardSheetCount: fanout.storyboardSheetCount,
    text: fanout.expanded
      ? `Materialized ${fanout.shotCount} Cinematics V2 shot workflows across ${fanout.storyboardSheetCount} storyboard sheet(s).`
      : `Cinematics V2 shot workflows already materialized for ${fanout.shotCount} shots across ${fanout.storyboardSheetCount} storyboard sheet(s).`,
    deterministic: true,
  }
  return result({
    context,
    helpers,
    outputs,
    model: 'deterministic-cinematic-v2-dynamic-shot-fanout-v1',
  })
}

async function cinematicDynamicTakeFanoutNode(
  context: CinematicFanoutNodeExecutionContext,
  helpers: CinematicFanoutWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const compileOutputs = Object.values(context.upstream).find((outputs) => {
    const record = helpers.asRecord(outputs)
    return Array.isArray(record.takePlan) && Object.keys(helpers.asRecord(record.compiledCinematicSequence)).length > 0
  })
  if (!compileOutputs) {
    throw new Error('Cinematic dynamic fanout requires compiled take outputs.')
  }
  const fanout = await helpers.materializeDynamicCinematicTakeFanout({
    client: context.client,
    workflow: context.workflow,
    compileOutputs: helpers.asRecord(compileOutputs),
    config,
  })
  const outputs = {
    dynamicGraphExpanded: fanout.expanded,
    graphExpanded: fanout.expanded,
    compileHash: fanout.compileHash,
    dynamicTakeCount: fanout.takeCount,
    text: fanout.expanded
      ? `Materialized ${fanout.takeCount} cinematic take workflows.`
      : `Cinematic take workflows already materialized for ${fanout.takeCount} takes.`,
    deterministic: true,
  }
  return result({
    context,
    helpers,
    outputs,
    model: 'deterministic-cinematic-dynamic-take-fanout-v1',
  })
}

async function cinematicV3DynamicStoryboardFanoutNode(
  context: CinematicFanoutNodeExecutionContext,
  helpers: CinematicFanoutWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const compileOutputs = {
    screenplayDraft: helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft']),
    shotPlan: helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan']),
    storyboardGroupPlan: helpers.readFirstUpstreamRecord(context.upstream, ['storyboardGroupPlan', 'storyboard_group_plan']),
    cinematicReferencePlan: helpers.readFirstUpstreamRecord(context.upstream, ['cinematicReferencePlan', 'cinematic_reference_plan']),
    compileHash: helpers.readText(config.compileHash),
  }
  const fanout = await helpers.materializeDynamicCinematicV3StoryboardFanout({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    compileOutputs,
    config,
  })
  const outputs = {
    dynamicGraphExpanded: fanout.expanded,
    graphExpanded: fanout.expanded,
    compileHash: fanout.compileHash,
    dynamicShotCount: fanout.shotCount,
    storyboardSheetCount: fanout.storyboardSheetCount,
    text: fanout.expanded
      ? `Materialized ${fanout.storyboardSheetCount} Cinematics V3 storyboard sheet workflow(s) covering ${fanout.shotCount} shot(s).`
      : `Cinematics V3 storyboard workflows already materialized for ${fanout.shotCount} shots across ${fanout.storyboardSheetCount} sheet(s).`,
    deterministic: true,
  }
  return result({
    context,
    helpers,
    outputs,
    model: 'deterministic-cinematic-v3-dynamic-storyboard-fanout-v1',
  })
}

async function cinematicV3DynamicShotParseFanoutNode(
  context: CinematicFanoutNodeExecutionContext,
  helpers: CinematicFanoutWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const compileOutputs = {
    screenplayDraft: helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft']),
    shotBreakPlan: helpers.readFirstUpstreamRecord(context.upstream, ['shotBreakPlan', 'shot_break_plan']),
    cinematicReferencePlan: helpers.readFirstUpstreamRecord(context.upstream, ['cinematicReferencePlan', 'cinematic_reference_plan']),
    compileHash: helpers.readText(config.compileHash),
  }
  const fanout = await helpers.materializeDynamicCinematicV3ShotParseFanout({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    compileOutputs,
    config,
  })
  const workflowMetadata = helpers.asRecord(context.workflow.metadata)
  const isSequenceAnimaticMasterFanout = helpers.readText(config.sequenceAnimaticMode) === 'master_script_only'
    || helpers.readText(workflowMetadata.screenplayAnimaticRole) === 'master'
    || helpers.readText(workflowMetadata.sequenceAnimaticRole) === 'master'
  const outputs = {
    dynamicGraphExpanded: fanout.expanded,
    graphExpanded: fanout.expanded,
    compileHash: fanout.compileHash,
    parseGroupCount: fanout.parseGroupCount,
    storyboardSheetCount: fanout.storyboardSheetCount,
    text: fanout.expanded
      ? (isSequenceAnimaticMasterFanout
        ? 'Materialized sequence animatic master manifest, shot continuity plan, and orchestrator nodes without parse-group LLM dependencies.'
        : `Materialized ${fanout.parseGroupCount} Cinematics V3 screenplay parse group node(s) and ${fanout.storyboardSheetCount} direct storyboard workflow(s).`)
      : `Cinematics V3 parse groups and storyboard workflows already materialized (${fanout.parseGroupCount} group(s), ${fanout.storyboardSheetCount} sheet(s)).`,
    deterministic: true,
  }
  return result({
    context,
    helpers,
    outputs,
    model: 'deterministic-cinematic-v3-dynamic-shot-parse-fanout-v1',
  })
}

const cinematicFanoutHandlers = {
  cinematic_sequence_compile: cinematicSequenceCompileNode,
  cinematic_v2_dynamic_shot_fanout: cinematicV2DynamicShotFanoutNode,
  cinematic_dynamic_take_fanout: cinematicDynamicTakeFanoutNode,
  cinematic_v3_dynamic_shot_parse_fanout: cinematicV3DynamicShotParseFanoutNode,
  cinematic_v3_dynamic_storyboard_fanout: cinematicV3DynamicStoryboardFanoutNode,
}

const cinematicFanoutWorkflowNodePackKey = 'output_workflow_cinematic_fanout'

export const cinematicFanoutWorkflowNodePack = defineWorkflowNodePack<
  CinematicFanoutNodeExecutionContext,
  CinematicFanoutNodeExecutionResult,
  CinematicFanoutWorkflowNodePackHelpers,
  typeof cinematicFanoutHandlers
>({
  packKey: cinematicFanoutWorkflowNodePackKey,
  handlers: cinematicFanoutHandlers,
})

export const cinematicFanoutWorkflowNodeHandlerKeys = cinematicFanoutWorkflowNodePack.handlerKeys

function createCinematicFanoutNodeScaffold(input: {
  purpose: keyof typeof cinematicFanoutHandlers
  runtimeKind: WorkflowNodeRuntimeKind
  sourceHashKeys: string[]
  projectionMetadataKeys?: string[]
}): WorkflowNodeExtensionScaffold {
  const manifest = outputWorkflowNodeManifestsByPurpose.get(input.purpose)
  if (!manifest) throw new Error(`Cinematic fanout workflow node scaffold missing registered manifest: ${input.purpose}`)
  return createWorkflowNodeExtensionScaffold({
    ...workflowNodeManifestToContract(manifest),
    nodeType: manifest.nodeType,
    handlerKey: manifest.handlerKey,
    packKey: cinematicFanoutWorkflowNodePackKey,
    runtimeKind: input.runtimeKind,
    sourceHashKeys: input.sourceHashKeys,
    projectionMetadataKeys: input.projectionMetadataKeys,
    inputSchema: manifest.inputSchema,
    outputSchema: manifest.outputSchema,
    configSchema: manifest.configSchema,
    executable: manifest.executable,
    executionPolicy: manifest.executionPolicy,
    retryPolicy: manifest.retryPolicy,
    cachePolicy: {
      ...manifest.cachePolicy,
      sourceHashKeys: manifest.cachePolicy.sourceHashKeys.length > 0
        ? manifest.cachePolicy.sourceHashKeys
        : input.sourceHashKeys,
    },
    cancellationPolicy: manifest.cancellationPolicy,
    streamingPolicy: manifest.streamingPolicy,
  })
}

export const cinematicFanoutWorkflowNodeScaffolds = [
  createCinematicFanoutNodeScaffold({
    purpose: 'cinematic_sequence_compile',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.cinematicScriptDoc', 'upstream.scriptDoc', 'upstream.directorScriptDoc', 'config.maxDynamicTakes', 'config.maxTotalDurationSeconds'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'readyArtifactCounts', 'scopedAssetKeys'],
  }),
  createCinematicFanoutNodeScaffold({
    purpose: 'cinematic_v2_dynamic_shot_fanout',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.screenplayDraft',
      'upstream.parsedScript',
      'upstream.sceneState',
      'upstream.layoutPlan',
      'upstream.shotPlan',
      'upstream.storyboardGroupPlan',
      'upstream.cinematicReferencePlan',
      'config.compileHash',
      'workflow.metadata',
    ],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'recoveryHints'],
  }),
  createCinematicFanoutNodeScaffold({
    purpose: 'cinematic_dynamic_take_fanout',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.compiledCinematicSequence', 'upstream.takePlan', 'config.compileHash', 'config.cinematicReferenceMode', 'workflow.metadata'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'recoveryHints'],
  }),
  createCinematicFanoutNodeScaffold({
    purpose: 'cinematic_v3_dynamic_shot_parse_fanout',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.screenplayDraft', 'upstream.shotBreakPlan', 'upstream.cinematicReferencePlan', 'config.compileHash', 'config.sequenceAnimaticMode', 'workflow.metadata'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'recoveryHints'],
  }),
  createCinematicFanoutNodeScaffold({
    purpose: 'cinematic_v3_dynamic_storyboard_fanout',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.screenplayDraft', 'upstream.shotPlan', 'upstream.storyboardGroupPlan', 'upstream.cinematicReferencePlan', 'config.compileHash', 'workflow.metadata'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'recoveryHints'],
  }),
] as const

export const cinematicFanoutWorkflowNodeScaffoldHandlerKeys = cinematicFanoutWorkflowNodeScaffolds.map((scaffold) => scaffold.handlerKey)

export function registerCinematicFanoutWorkflowNodePack(input: {
  helpers: CinematicFanoutWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: CinematicFanoutNodeExecutionContext) => Promise<CinematicFanoutNodeExecutionResult>) => void
}) {
  cinematicFanoutWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
