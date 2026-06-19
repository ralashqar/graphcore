import {
  type OutputRequest,
} from '../../../src/domain/outputWorkflow.ts'
import {
  sequenceAnimaticScenePackageOutputSchema,
} from './output-workflow-sequence-animatic-scene-package-runtime.ts'

type LooseRecord = Record<string, unknown>

type ScenePackage = LooseRecord & {
  sceneId: string
  index?: number
  title?: string
  dialogueRows?: unknown
}

type ScenePackageOutput = LooseRecord & {
  screenplayScenes: ScenePackage[]
  scenePackages: ScenePackage[]
  dialogueRows?: unknown[]
}

type TemplateGraphResult = {
  ok: boolean
  diagnostics: string[]
  sourceHash: string
  graph?: {
    nodes: LooseRecord[]
    edges: LooseRecord[]
  } | null
}

export type SequenceAnimaticSceneShotPlanEnsureHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  slugify: (value: string) => string
  sequenceAnimaticStableHash: (value: unknown) => string
  readScreenplayAnimaticRoleFromMetadata: (metadata: LooseRecord) => string
  loadChildRequests: (input: {
    projectId: string
    draftId: string
    parentRequestId: string
  }) => Promise<OutputRequest[]>
  buildSceneShotPlanTemplateGraph: (input: {
    workflowId: string
    draftId: string
    commonConfig: LooseRecord
    sceneId: string
    sceneIndex: number
    sceneTitle: string
    scenePackageOutput: LooseRecord
    screenplayText: string
    assetPack: LooseRecord
    context: LooseRecord
    guidance: LooseRecord
    maxShotCount: number
    aspectRatio: string
    resolution: string
  }) => TemplateGraphResult
  sceneShotPlansTemplateKey: string
  ensureMappedChildWorkflow: (input: {
    projectId: string
    draftId: string
    parentRequestId: string
    role: string
    identityKey: string
    identityValue: string
    workflow: LooseRecord
    nodes: LooseRecord[]
    edges: LooseRecord[]
    request: LooseRecord
  }) => Promise<{
    request: OutputRequest
    created?: boolean
    reused?: boolean
  }>
}

export async function ensureSequenceAnimaticSceneShotPlanWorkflowsRuntime(input: {
  masterRequest: OutputRequest
  scenePackageOutput: LooseRecord
  screenplayText: string
  assetPack: LooseRecord
  context: LooseRecord
  guidance: LooseRecord
  maxShotCount: number
  aspectRatio: string
  resolution: string
  sceneIds?: string[]
  helpers: SequenceAnimaticSceneShotPlanEnsureHelpers
}): Promise<OutputRequest[]> {
  const { helpers, masterRequest } = input
  const masterMetadata = helpers.asRecord(masterRequest.metadata)
  const screenplayAnimaticSource = helpers.readText(masterMetadata.screenplayAnimaticSource) === 'prompt_cinematic'
    ? 'prompt_cinematic'
    : 'wiki_sequence_unit'
  const parsedPackage = sequenceAnimaticScenePackageOutputSchema.parse(input.scenePackageOutput) as ScenePackageOutput
  const scenePackages = (parsedPackage.scenePackages.length > 0 ? parsedPackage.scenePackages : parsedPackage.screenplayScenes)
    .slice()
    .sort((left, right) => (Number(left.index ?? 0) || 9999) - (Number(right.index ?? 0) || 9999))
  if (scenePackages.length === 0) throw new Error('Sequence animatic scene ensure requires registered screenplay scenes.')
  if (!input.screenplayText) throw new Error('Sequence animatic scene ensure requires the authored screenplay text.')

  const existingChildren = await helpers.loadChildRequests({
    projectId: masterRequest.projectId,
    draftId: masterRequest.draftId,
    parentRequestId: masterRequest.id,
  })
  const existingBySceneId = new Map(existingChildren
    .filter((child) => helpers.asRecord(child.metadata).sequenceAnimaticStale !== true
      && helpers.readScreenplayAnimaticRoleFromMetadata(helpers.asRecord(child.metadata)) === 'scene_shot_plan')
    .map((child) => [helpers.readText(helpers.asRecord(child.metadata).sceneId), child] as const)
    .filter(([id]) => id))
  const selectedSceneIds = input.sceneIds && input.sceneIds.length > 0 ? new Set(input.sceneIds) : null
  const now = new Date().toISOString()
  const childRequests: OutputRequest[] = []

  for (const scene of scenePackages) {
    const sceneId = helpers.readText(scene.sceneId)
    if (!sceneId) continue
    if (selectedSceneIds && !selectedSceneIds.has(sceneId)) {
      const existing = existingBySceneId.get(sceneId)
      if (existing) childRequests.push(existing)
      continue
    }
    const existing = existingBySceneId.get(sceneId)
    if (existing) {
      childRequests.push(existing)
      continue
    }
    const sceneScopedPackageOutput = {
      ...parsedPackage,
      scenePackages: [scene],
      screenplayScenes: [scene],
      dialogueRows: scene.dialogueRows,
    }
    const sceneHash = helpers.sequenceAnimaticStableHash({ scene, screenplayLength: input.screenplayText.length })
    const workflowId = crypto.randomUUID()
    const sceneIndex = Number(scene.index) || 0
    const sceneTitle = helpers.readText(scene.title)
    const commonConfig = {
      cinematicPipelineVersion: 'v3_script_storyboards',
      graphSpecVersion: 'sequence_animatic_graph_v2',
      screenplayAnimaticRole: 'scene_shot_plan',
      screenplayAnimaticSource,
      sequenceAnimaticRole: 'scene_shot_plan',
      parentRequestId: masterRequest.id,
      masterRequestId: masterRequest.id,
      sceneId,
      sceneIndex,
      sceneTitle,
      sceneHash,
      sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
      sourceMasterWorkflowId: masterRequest.workflowId,
    }
    const graphResult = helpers.buildSceneShotPlanTemplateGraph({
      workflowId,
      draftId: masterRequest.draftId,
      commonConfig,
      sceneId,
      sceneIndex,
      sceneTitle,
      scenePackageOutput: sceneScopedPackageOutput,
      screenplayText: input.screenplayText,
      assetPack: input.assetPack,
      context: input.context,
      guidance: input.guidance,
      maxShotCount: input.maxShotCount,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
    })
    if (!graphResult.ok || !graphResult.graph) throw new Error(graphResult.diagnostics.join(' '))
    const workflowTemplateMetadata = {
      workflowTemplateKey: helpers.sceneShotPlansTemplateKey,
      workflowTemplateSourceHash: graphResult.sourceHash,
    }
    const title = `${masterRequest.title} / Scene ${sceneIndex || ''}: ${sceneTitle || sceneId}`.trim()
    const ensured = await helpers.ensureMappedChildWorkflow({
      projectId: masterRequest.projectId,
      draftId: masterRequest.draftId,
      parentRequestId: masterRequest.id,
      role: 'scene_shot_plan',
      identityKey: 'sceneId',
      identityValue: sceneId,
      workflow: {
        project_id: masterRequest.projectId,
        draft_id: masterRequest.draftId,
        key: `sequence_animatic_scene_${helpers.slugify(masterRequest.id)}_${helpers.slugify(sceneId)}_${sceneHash.slice(0, 8)}`,
        name: title,
        description: 'Sequence animatic per-scene shot plan workflow.',
        preset: 'cinematic_episode_from_sequence',
        status: 'active',
        created_by: masterRequest.requestedBy,
        metadata: { ...commonConfig, ...workflowTemplateMetadata, readyToRun: true },
      },
      nodes: graphResult.graph.nodes,
      edges: graphResult.graph.edges,
      request: {
        project_id: masterRequest.projectId,
        draft_id: masterRequest.draftId,
        parent_request_id: masterRequest.id,
        requested_by: masterRequest.requestedBy,
        source_surface: screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
        prompt: `${masterRequest.prompt}\n\nPlan shots and continuity for ${sceneId} (${sceneTitle || 'scene'}).`,
        title,
        intent: 'output_generation',
        output_kind: 'cinematic_episode',
        status: 'awaiting_confirmation',
        selected_entity_keys: masterRequest.selectedEntityKeys,
        selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
        page_count: null,
        target_format: 'video',
        planner_notes: 'Per-scene shot plan workflow prepared from the registered scene index.',
        metadata: {
          ...commonConfig,
          ...workflowTemplateMetadata,
          readyToRun: true,
          createdFromSceneIndexAt: now,
        },
      },
    })
    const child = ensured.request
    existingBySceneId.set(sceneId, child)
    childRequests.push(child)
  }

  return childRequests.sort((left, right) => {
    const leftIndex = Number(helpers.asRecord(left.metadata).sceneIndex ?? 0) || 9999
    const rightIndex = Number(helpers.asRecord(right.metadata).sceneIndex ?? 0) || 9999
    return leftIndex - rightIndex
  })
}
