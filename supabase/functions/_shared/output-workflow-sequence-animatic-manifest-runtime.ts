import { buildCinematicV3StoryboardLayout, cinematicV2ShotPlanSchema, providerSafeCinematicV2DurationSeconds } from '../../../src/domain/cinematics.ts'
import type {
  LooseRecord,
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticWorkflowNodePackHelpers,
} from './output-workflow-sequence-animatic-node-pack-types.ts'
import {
  buildSequenceAnimaticReferenceCatalog,
} from './output-workflow-sequence-animatic-reference-runtime.ts'
import {
  buildCinematicV3StoryboardGroupFromShotBreakGroup,
  buildSequenceAnimaticShotPlanFromBreaks,
  collectCinematicV3ShotPlansFromUpstream,
  mergeCinematicV3ShotPlansForTimeline,
} from './output-workflow-sequence-animatic-planning-runtime.ts'
import {
  cinematicAssetPackEntityKeys,
  repairCinematicV2ShotPlanVisualReferences,
} from './output-workflow-cinematic-asset-pack-runtime.ts'
import {
  sequenceAnimaticStableHash,
} from './sequence-animatic-workflow-factory.ts'

type SequenceAnimaticManifestRuntimeHelpers = Pick<SequenceAnimaticWorkflowNodePackHelpers,
  | 'asRecord'
  | 'readText'
  | 'readArray'
  | 'readStringArray'
  | 'readFirstUpstreamRecord'
>

type SequenceAnimaticManifestRuntimeResult = {
  outputs: LooseRecord
  model: string
}

function readAnchorArray(input: {
  upstream: Record<string, Record<string, unknown>>
  fields: string[]
  helpers: SequenceAnimaticManifestRuntimeHelpers
}) {
  const arrays = Object.values(input.upstream).flatMap((outputs) => input.fields.flatMap((field) => {
    const value = outputs[field]
    return Array.isArray(value) ? value.map(input.helpers.asRecord) : []
  }))
  const withAssets = arrays.filter((anchor) => input.helpers.readText(anchor.assetKey))
  return (withAssets.length > 0 ? withAssets : arrays)
    .filter((anchor, index, values) => input.helpers.readText(anchor.id) && values.findIndex((candidate) => input.helpers.readText(candidate.id) === input.helpers.readText(anchor.id)) === index)
}

function screenplayMarkdownFromDraft(screenplayDraft: LooseRecord, helpers: SequenceAnimaticManifestRuntimeHelpers) {
  return helpers.readText(screenplayDraft.screenplayMarkdown)
    || helpers.readText(screenplayDraft.markdown)
    || helpers.readText(screenplayDraft.text)
}

export function buildSequenceAnimaticManifestRuntime(input: {
  context: SequenceAnimaticNodeExecutionContext
  helpers: SequenceAnimaticManifestRuntimeHelpers
}): SequenceAnimaticManifestRuntimeResult {
  const { context, helpers } = input
  const directorPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotContinuityPlan', 'shot_continuity_plan', 'directorPlan', 'director_plan'])
  const workflowMetadata = helpers.asRecord(context.workflow.metadata)
  const runMetadata = helpers.asRecord((context.run as { metadata?: unknown }).metadata)
  const screenplayAnimaticSource = helpers.readText(workflowMetadata.screenplayAnimaticSource)
    || (helpers.readText(workflowMetadata.cinematicAnimaticMode) === 'prompt_cinematic_master' ? 'prompt_cinematic' : 'wiki_sequence_unit')

  if (Object.keys(directorPlan).length > 0) {
    const screenplayDraft = helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft', 'screenplay'])
    const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
    const worldContext = helpers.readFirstUpstreamRecord(context.upstream, ['context'])
    if (!Object.keys(screenplayDraft).length) throw new Error('Sequence animatic manifest requires the authored screenplay.')
    if (!Object.keys(assetPack).length) throw new Error('Sequence animatic manifest requires the visual reference asset pack.')

    const selectedVisualReferenceKeys = cinematicAssetPackEntityKeys(assetPack)
    const animaticReferenceCatalog = buildSequenceAnimaticReferenceCatalog({ context: worldContext, assetPack })
    const rawShotPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan'])
    const directorShots = helpers.readArray(directorPlan.shots).map(helpers.asRecord)
    if (directorShots.length === 0) throw new Error('Sequence animatic manifest requires shot-continuity-owned shots.')
    const parsedShotPlan = cinematicV2ShotPlanSchema.safeParse(rawShotPlan)
    const shotPlan = (parsedShotPlan.success
      ? parsedShotPlan.data
      : cinematicV2ShotPlanSchema.parse({
        sceneId: 'sequence_animatic_master',
        totalEditorialDurationSeconds: directorShots.reduce((total, shot) => total + (Number(shot.editorialDurationSeconds) || 0), 0),
        shots: directorShots,
        performanceArc: [],
        audioPlan: { ambience: '', music: '', sfx: [], dialogueTrackCount: 0, placeholderOnly: true },
        diagnostics: ['Built shot plan from authoritative shot continuity plan shots.'],
      })) as LooseRecord & { shots: LooseRecord[] }
    const shotById = new Map(shotPlan.shots.map((shot) => [helpers.readText(shot.id), shot] as const).filter(([shotId]) => shotId))
    const coverageSetups = helpers.readArray(directorPlan.coverageSetups ?? directorPlan.coverage_setups).map(helpers.asRecord)
    const coverageSetupById = new Map(coverageSetups.map((setup) => [helpers.readText(setup.id), setup] as const).filter(([id]) => id))
    let cursor = 0
    const blocks = helpers.readArray(directorPlan.blocks).map(helpers.asRecord).map((block, index) => {
      const blockId = helpers.readText(block.id) || `cinematic_v3_storyboard_group_${String(index + 1).padStart(3, '0')}`
      const shotIds = helpers.readStringArray(block.shotIds ?? block.shot_ids).filter((shotId) => shotById.has(shotId))
      const blockShots = shotIds.map((shotId) => shotById.get(shotId)).filter((shot): shot is LooseRecord => Boolean(shot))
      if (blockShots.length === 0) throw new Error(`Sequence animatic shot continuity block ${blockId} has no valid shots.`)
      const layout = buildCinematicV3StoryboardLayout(blockShots.length)
      const duration = blockShots.reduce((total, shot) => total + (Number(shot.editorialDurationSeconds) || 0), 0)
      const startSeconds = cursor
      const endSeconds = startSeconds + duration
      cursor = endSeconds
      const summary = helpers.readText(block.summary) || blockShots.map((shot) => helpers.readText(shot.title)).filter(Boolean).join(' / ')
      const blockCoverageSetupIds = [...new Set(blockShots.map((shot) => helpers.readText(shot.coverageSetupId ?? shot.coverage_setup_id)).filter(Boolean))]
      const blockCoverageSetups = blockCoverageSetupIds.map((setupId) => coverageSetupById.get(setupId)).filter((setup): setup is LooseRecord => Boolean(setup))
      const storyboardGroup = {
        id: blockId,
        index: Number(block.index ?? index + 1) || index + 1,
        shotIds,
        summary,
        rows: layout.rows,
        columns: layout.columns,
        panelCount: layout.panelCount,
        startSeconds,
        endSeconds,
        editorialDurationSeconds: duration,
        providerDurationSeconds: providerSafeCinematicV2DurationSeconds(duration),
        coverageSetupIds: blockCoverageSetupIds,
        coverageSetups: blockCoverageSetups,
        continuityNotes: [
          ...helpers.readStringArray(block.continuityNotes ?? block.continuity_notes),
          helpers.readText(block.summary),
          ...blockCoverageSetups.slice(0, 8).map((setup) => `Coverage ${helpers.readText(setup.id)}: ${helpers.readText(setup.title) || helpers.readText(setup.setupKind)}; ${helpers.readText(setup.screenDirection ?? setup.screen_direction)}; ${helpers.readText(setup.stagingBrief ?? setup.staging_brief)}`),
        ].filter(Boolean),
      }
      return {
        ...block,
        id: blockId,
        index: Number(block.index ?? index + 1) || index + 1,
        title: helpers.readText(block.title) || summary || `Storyboard block ${index + 1}`,
        summary,
        sourceText: helpers.readText(block.sourceText ?? block.source_text),
        shotIds,
        shots: blockShots,
        coverageSetupIds: blockCoverageSetupIds,
        coverageSetups: blockCoverageSetups,
        continuityAnchorIds: [...new Set(blockShots.flatMap((shot) => helpers.readStringArray(shot.continuityAnchorIds)))],
        storyboardGroup,
        storyboardLayout: { rows: layout.rows, columns: layout.columns, panelCount: layout.panelCount },
        durationSeconds: duration,
        startSeconds,
        endSeconds,
        childRequestId: null,
        childWorkflowId: null,
      }
    })
    if (blocks.length === 0) throw new Error('Sequence animatic manifest requires shot-continuity-owned storyboard blocks.')

    const roughShotBreakPlan = helpers.readFirstUpstreamRecord(context.upstream, ['roughShotBreakPlan', 'rough_shot_break_plan', 'shotBreakPlan', 'shot_break_plan'])
    const directorPlanHash = helpers.readText(directorPlan.shotPlanHash) || sequenceAnimaticStableHash(directorPlan)
    const continuityGraphV2 = helpers.asRecord(directorPlan.continuityGraphV2 ?? directorPlan.continuity_graph_v2)
    const shotBindings = helpers.asRecord(directorPlan.shotBindings ?? directorPlan.shot_bindings)
    const manifest = {
      role: 'sequence_animatic_manifest',
      graphSpecVersion: 'sequence_animatic_graph_v2',
      screenplayAnimaticRole: 'master',
      screenplayAnimaticSource,
      sequenceAnimaticRole: 'master',
      requestId: runMetadata.outputRequestId ?? null,
      workflowId: context.workflow.id,
      runId: context.run.id,
      screenplayDraft,
      screenplayMarkdown: screenplayMarkdownFromDraft(screenplayDraft, helpers),
      shotBreakPlan: roughShotBreakPlan,
      roughShotBreakPlan,
      shotPlan,
      blocks,
      assetPack,
      selectedReferences: assetPack,
      selectedVisualReferenceKeys,
      animaticReferenceCatalog,
      directorPlan,
      directorPlanHash,
      shotContinuityPlan: directorPlan,
      shotContinuityPlanHash: directorPlanHash,
      continuityGraphV2,
      shotBindings,
      diagnostics: [
        ...helpers.readStringArray(directorPlan.diagnostics),
        `Built final sequence animatic manifest from shot continuity plan with ${blocks.length} storyboard block${blocks.length === 1 ? '' : 's'} and ${shotPlan.shots.length} shot${shotPlan.shots.length === 1 ? '' : 's'}.`,
      ],
    }
    return {
      outputs: {
        manifest,
        sequenceAnimaticManifest: manifest,
        sequence_animatic_manifest: manifest,
        screenplayDraft,
        screenplay_draft: screenplayDraft,
        shotBreakPlan: roughShotBreakPlan,
        shot_break_plan: roughShotBreakPlan,
        shotPlan,
        shot_plan: shotPlan,
        blocks,
        assetPack,
        asset_pack: assetPack,
        selectedVisualReferenceKeys,
        selected_visual_reference_keys: selectedVisualReferenceKeys,
        animaticReferenceCatalog,
        animatic_reference_catalog: animaticReferenceCatalog,
        directorPlan,
        director_plan: directorPlan,
        shotContinuityPlan: directorPlan,
        shot_continuity_plan: directorPlan,
        continuityGraphV2,
        continuity_graph_v2: continuityGraphV2,
        shotBindings,
        shot_bindings: shotBindings,
        text: JSON.stringify(manifest, null, 2),
        deterministic: true,
      },
      model: 'deterministic-sequence-animatic-director-manifest-v1',
    }
  }

  const screenplayDraft = helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft'])
  const shotBreakPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotBreakPlan', 'shot_break_plan'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const worldContext = helpers.readFirstUpstreamRecord(context.upstream, ['context'])
  const animaticReferenceCatalog = buildSequenceAnimaticReferenceCatalog({ context: worldContext, assetPack })
  const selectedVisualReferenceKeys = cinematicAssetPackEntityKeys(assetPack)
  const continuityAnchorPlan = helpers.readFirstUpstreamRecord(context.upstream, ['continuityAnchorPlan', 'continuity_anchor_plan'])
  const characterAnchors = readAnchorArray({ upstream: context.upstream, fields: ['characterAnchors', 'character_anchors'], helpers })
    .filter((anchor) => helpers.readText(anchor.anchorType) === 'character')
  const propAnchors = readAnchorArray({ upstream: context.upstream, fields: ['propAnchors', 'prop_anchors'], helpers })
    .filter((anchor) => helpers.readText(anchor.anchorType) !== 'location_spot' && helpers.readText(anchor.anchorType) !== 'character')
  const locationSpotAnchors = readAnchorArray({ upstream: context.upstream, fields: ['locationSpotAnchors', 'location_spot_anchors'], helpers })
    .filter((anchor) => helpers.readText(anchor.anchorType) === 'location_spot' || helpers.readText(anchor.baseLocationRefId))
  const anchorAssets = [...characterAnchors, ...propAnchors, ...locationSpotAnchors].map(helpers.asRecord).filter((anchor) => helpers.readText(anchor.id))
  const continuityAnchorIdsByShotId = helpers.asRecord(continuityAnchorPlan.continuityAnchorIdsByShotId ?? continuityAnchorPlan.shotContinuityAnchorIds)
  const groupPlans = collectCinematicV3ShotPlansFromUpstream(context.upstream)
  const rawMergedShotPlan = groupPlans.length > 0
    ? mergeCinematicV3ShotPlansForTimeline(groupPlans)
    : buildSequenceAnimaticShotPlanFromBreaks({ shotBreakPlan, assetPack, context: worldContext })
  const baseMergedShotPlan = repairCinematicV2ShotPlanVisualReferences({
    shotPlan: rawMergedShotPlan,
    assetPack,
  })
  const mergedShots: LooseRecord[] = baseMergedShotPlan.shots.map((shot) => {
    const anchorIds = helpers.readStringArray(continuityAnchorIdsByShotId[helpers.readText(shot.id)])
    return {
      ...shot,
      continuityAnchorIds: anchorIds,
      continuityAnchorRefIds: anchorIds,
    }
  })
  const mergedShotPlan = {
    ...baseMergedShotPlan,
    shots: mergedShots,
  }
  const breakGroups = Array.isArray(shotBreakPlan.groups) ? shotBreakPlan.groups.map(helpers.asRecord) : []
  const blocks = breakGroups.map((group, index) => {
    const storyboardGroup = buildCinematicV3StoryboardGroupFromShotBreakGroup(group, index)
    const shotIds = helpers.readStringArray(group.shotBreakIds)
    const shots = mergedShotPlan.shots.filter((shot) => shotIds.includes(helpers.readText(shot.id)))
    const storyboardShotIds = helpers.readStringArray(storyboardGroup.shotIds)
    const resolvedShots = shots.length > 0
      ? shots
      : mergedShotPlan.shots.filter((shot) => storyboardShotIds.includes(helpers.readText(shot.id)))
    const blockAnchorIds = [...new Set(resolvedShots.flatMap((shot) => helpers.readStringArray(shot.continuityAnchorIds)))]
    return {
      id: storyboardGroup.id,
      index: storyboardGroup.index,
      title: helpers.readText(group.title) || helpers.readText(group.summary) || helpers.readText(storyboardGroup.summary) || `Storyboard block ${helpers.readText(storyboardGroup.index) || index + 1}`,
      summary: storyboardGroup.summary,
      sourceText: helpers.readText(group.sourceText),
      shotIds: (resolvedShots.length > 0 ? resolvedShots.map((shot) => helpers.readText(shot.id)).filter(Boolean) : storyboardShotIds),
      shots: resolvedShots,
      continuityAnchorIds: blockAnchorIds,
      storyboardGroup,
      storyboardLayout: { rows: storyboardGroup.rows, columns: storyboardGroup.columns, panelCount: storyboardGroup.panelCount },
      durationSeconds: storyboardGroup.editorialDurationSeconds,
      startSeconds: storyboardGroup.startSeconds,
      endSeconds: storyboardGroup.endSeconds,
      childRequestId: null,
      childWorkflowId: null,
    }
  })
  const manifest = {
    role: 'sequence_animatic_manifest',
    graphSpecVersion: 'sequence_animatic_graph_v1',
    screenplayAnimaticRole: 'master',
    screenplayAnimaticSource,
    sequenceAnimaticRole: 'master',
    requestId: runMetadata.outputRequestId ?? null,
    workflowId: context.workflow.id,
    runId: context.run.id,
    screenplayDraft,
    screenplayMarkdown: screenplayMarkdownFromDraft(screenplayDraft, helpers),
    shotBreakPlan,
    shotPlan: mergedShotPlan,
    blocks,
    assetPack,
    selectedReferences: assetPack,
    selectedVisualReferenceKeys,
    animaticReferenceCatalog,
    continuityAnchorPlan,
    characterAnchors,
    propAnchors,
    locationSpotAnchors,
    anchorAssets,
    diagnostics: [
      ...helpers.readStringArray(shotBreakPlan.diagnostics),
      ...helpers.readStringArray(continuityAnchorPlan.diagnostics),
      ...(groupPlans.length === 0 ? ['Skipped parse-group LLM shot planning for sequence animatic master; shot continuity plan will assign shot references and scene graph continuity in one coherent pass.'] : []),
      `Built sequence animatic manifest with ${blocks.length} storyboard block${blocks.length === 1 ? '' : 's'} and ${mergedShotPlan.shots.length} shot${mergedShotPlan.shots.length === 1 ? '' : 's'}.`,
    ],
  }
  return {
    outputs: {
      manifest,
      sequenceAnimaticManifest: manifest,
      sequence_animatic_manifest: manifest,
      screenplayDraft,
      screenplay_draft: screenplayDraft,
      shotBreakPlan,
      shot_break_plan: shotBreakPlan,
      shotPlan: mergedShotPlan,
      shot_plan: mergedShotPlan,
      blocks,
      assetPack,
      asset_pack: assetPack,
      selectedVisualReferenceKeys,
      selected_visual_reference_keys: selectedVisualReferenceKeys,
      animaticReferenceCatalog,
      animatic_reference_catalog: animaticReferenceCatalog,
      continuityAnchorPlan,
      continuity_anchor_plan: continuityAnchorPlan,
      characterAnchors,
      character_anchors: characterAnchors,
      propAnchors,
      prop_anchors: propAnchors,
      locationSpotAnchors,
      location_spot_anchors: locationSpotAnchors,
      anchorAssets,
      anchor_assets: anchorAssets,
      text: JSON.stringify(manifest, null, 2),
      deterministic: true,
    },
    model: 'deterministic-sequence-animatic-manifest-v1',
  }
}
