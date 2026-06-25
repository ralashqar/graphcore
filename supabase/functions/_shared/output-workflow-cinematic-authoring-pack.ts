import {
  buildCinematicV3StoryboardLayout,
  cinematicV2ShotPlanSchema,
  cinematicV2StoryboardGroupPlanSchema,
  cinematicV2StoryboardLayoutSchema,
  cinematicV2KeyframeQaSchema,
  cinematicV2TimelineSchema,
} from '../../../src/domain/cinematics.ts'
import {
  createWorkflowNodeExtensionScaffold,
  workflowNodeManifestToContract,
  type WorkflowNodeExtensionScaffold,
  type WorkflowNodeRuntimeKind,
} from '../../../src/domain/outputWorkflowManifests.ts'
import { outputWorkflowNodeManifestsByPurpose } from '../../../src/domain/outputWorkflowNodeContracts.ts'
import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import { createWorkflowNodeExecutionResult } from './output-workflow-node-pack-runtime.ts'
import {
  collectCinematicV3ShotPlansFromUpstream,
  mergeCinematicV3ShotPlansForTimeline,
} from './output-workflow-sequence-animatic-planning-runtime.ts'
import { cinematicAssetPackEntityKeys } from './output-workflow-cinematic-asset-pack-runtime.ts'

declare const Deno: {
  makeTempDir: (options?: { prefix?: string }) => Promise<string>
  writeFile: (path: string, data: Uint8Array) => Promise<void>
  readFile: (path: string) => Promise<Uint8Array>
  remove: (path: string, options?: { recursive?: boolean }) => Promise<void>
}

type LooseRecord = Record<string, unknown>

type CinematicAuthoringNodeExecutionContext = {
  inputHash: string
  client: unknown
  workflow: {
    id: string
    key: string
    name: string
    metadata?: unknown
  }
  run: {
    id: string
    projectId: string
    draftId?: string | null
    preset?: string | null
    input?: unknown
    metadata?: unknown
  }
  node: {
    id: string
    key: string
    label: string
    config: unknown
  }
  upstream: Record<string, LooseRecord>
}

type CinematicAuthoringNodeExecutionResult = {
  status?: string
  inputHash: string
  outputHash: string
  outputs: LooseRecord
  provider: string
  model: string
}

type ArtifactRegistrationInput = {
  client: unknown
  run: CinematicAuthoringNodeExecutionContext['run']
  workflow: CinematicAuthoringNodeExecutionContext['workflow']
  node: CinematicAuthoringNodeExecutionContext['node']
  assetKey: string
  storagePath: string
  name: string
  summary: string
  mimeType: string
  metadata: LooseRecord
}

type OtherArtifactRegistrationInput = {
  client: unknown
  run: CinematicAuthoringNodeExecutionContext['run']
  workflow: CinematicAuthoringNodeExecutionContext['workflow']
  node: CinematicAuthoringNodeExecutionContext['node']
  key: string
  name: string
  summary: string
  metadata: LooseRecord
}

export type CinematicAuthoringWorkflowNodePackHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  readFirstUpstreamRecord: (upstream: Record<string, LooseRecord>, fields: string[]) => LooseRecord
  readFirstUpstreamArray: (upstream: Record<string, LooseRecord>, fields: string[]) => LooseRecord[]
  readFirstUpstreamImage: (upstream: Record<string, LooseRecord>, fields?: string[]) => LooseRecord | null
  slugify: (value: string) => string
  hashOutputWorkflowValue: (value: unknown) => string
  downloadProjectAssetBytes: (client: unknown, storagePath: string) => Promise<Uint8Array>
  downloadRemoteBytes: (url: string) => Promise<Uint8Array>
  uploadBytes: (client: unknown, storagePath: string, bytes: Uint8Array, mimeType: string) => Promise<void>
  runFfmpeg: (args: string[]) => Promise<{ ok: boolean; code?: number; stderr: string }>
  probeImageSize: (path: string) => Promise<{ width: number; height: number } | null>
  stitchVideoBytes: (input: { client: unknown; videos: LooseRecord[] }) => Promise<{ bytes: Uint8Array; mimeType: string; mode: string; diagnostics?: string }>
  registerImageArtifact: (input: ArtifactRegistrationInput) => Promise<unknown>
  registerVideoArtifact: (input: ArtifactRegistrationInput) => Promise<unknown>
  registerOtherArtifact: (input: OtherArtifactRegistrationInput) => Promise<unknown>
}

function result(input: {
  context: CinematicAuthoringNodeExecutionContext
  helpers: CinematicAuthoringWorkflowNodePackHelpers
  outputs: LooseRecord
  model: string
  status?: string
}): CinematicAuthoringNodeExecutionResult {
  return createWorkflowNodeExecutionResult<CinematicAuthoringNodeExecutionResult>(input)
}

function readUpstreamVideos(
  upstream: Record<string, LooseRecord>,
  helpers: CinematicAuthoringWorkflowNodePackHelpers,
  fields = ['video', 'videos'],
) {
  const videos: LooseRecord[] = []
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = outputs[field]
      if (Array.isArray(value)) {
        for (const entry of value) {
          const record = helpers.asRecord(entry)
          if (helpers.readText(record.assetKey) || helpers.readText(record.storagePath) || helpers.readText(record.url)) videos.push(record)
        }
        continue
      }
      const record = helpers.asRecord(value)
      if (helpers.readText(record.assetKey) || helpers.readText(record.storagePath) || helpers.readText(record.url)) videos.push(record)
    }
    if (
      (helpers.readText(outputs.assetKey) || helpers.readText(outputs.storagePath) || helpers.readText(outputs.storage_path) || helpers.readText(outputs.url))
      && !videos.some((video) => helpers.readText(video.assetKey) === helpers.readText(outputs.assetKey) && helpers.readText(video.storagePath || video.storage_path) === helpers.readText(outputs.storagePath || outputs.storage_path))
    ) {
      videos.push(outputs)
    }
  }
  return videos
}

function collectCinematicV2ShotVideos(
  upstream: Record<string, LooseRecord>,
  helpers: CinematicAuthoringWorkflowNodePackHelpers,
) {
  const seen = new Set<string>()
  return readUpstreamVideos(upstream, helpers, ['video', 'videos'])
    .map((video, index): LooseRecord => ({
      ...video,
      shotIndex: Number(video.shotIndex ?? video.shot_index ?? index + 1) || index + 1,
      shotId: helpers.readText(video.shotId) || helpers.readText(video.shot_id),
    }))
    .filter((video) => {
      const identity = [
        helpers.readText(video.assetKey),
        helpers.readText(video.storagePath),
        helpers.readText(video.url),
        helpers.readText(video.shotId),
        `shot:${Number(video.shotIndex ?? 0) || 0}`,
      ].filter(Boolean).join('|')
      if (!identity) return true
      if (seen.has(identity)) return false
      seen.add(identity)
      return true
    })
    .sort((left, right) => Number(left.shotIndex) - Number(right.shotIndex))
}

function buildCinematicV2Timeline(input: {
  shotPlan: LooseRecord
  videos: LooseRecord[]
}, helpers: CinematicAuthoringWorkflowNodePackHelpers) {
  const shotPlan = cinematicV2ShotPlanSchema.parse(input.shotPlan)
  let cursor = 0
  const videoByShotId = new Map(input.videos.map((video) => [helpers.readText(video.shotId), video] as const))
  const videoClips = shotPlan.shots.map((shot) => {
    const video = videoByShotId.get(shot.id) ?? {}
    const startTime = cursor
    const endTime = startTime + shot.editorialDurationSeconds
    cursor = endTime
    return {
      shotId: shot.id,
      videoAssetKey: helpers.readText(video.assetKey) || null,
      startTime,
      endTime,
      trimIn: 0,
      trimOut: Math.max(0, shot.providerDurationSeconds - shot.editorialDurationSeconds),
    }
  })
  return cinematicV2TimelineSchema.parse({
    id: 'timeline_1',
    sceneId: shotPlan.sceneId,
    durationSeconds: cursor,
    videoClips,
    audioClips: [
      { type: 'ambience', label: shotPlan.audioPlan.ambience || 'continuous ambience placeholder', startTime: 0, endTime: cursor, volumeDb: -12, placeholder: true },
      { type: 'music', label: shotPlan.audioPlan.music || 'continuous music placeholder', startTime: 0, endTime: cursor, volumeDb: -18, placeholder: true },
    ],
  })
}

function formatCinematicV2PerformanceDirection(shot: { performanceBeats: Array<Record<string, unknown>> }) {
  if (shot.performanceBeats.length === 0) return ''
  return shot.performanceBeats.map((beat) => {
    const metrics = [
      `valence ${beat.valence}`,
      `arousal ${beat.arousal}`,
      `confidence ${beat.confidence}`,
      `dominance ${beat.dominance}`,
    ].join(', ')
    const acting = [
      beat.facialExpression ? `face: ${beat.facialExpression}` : '',
      beat.bodyLanguage ? `body: ${beat.bodyLanguage}` : '',
      beat.gaze ? `gaze: ${beat.gaze}` : '',
      beat.gesture ? `gesture: ${beat.gesture}` : '',
      beat.voiceEnergy ? `voice: ${beat.voiceEnergy}` : '',
    ].filter(Boolean).join('; ')
    return `${beat.characterRefId} (${metrics})${acting ? ` - ${acting}` : ''}`
  }).join(' | ')
}

function cinematicVideoApprovedEnabled(
  run: CinematicAuthoringNodeExecutionContext['run'],
  helpers: CinematicAuthoringWorkflowNodePackHelpers,
) {
  const runInput = helpers.asRecord(run.input)
  const runMetadata = helpers.asRecord(run.metadata)
  return runInput.cinematicVideoApproved === true || runMetadata.cinematicVideoApproved === true
}

function upstreamHasDebugSkippedVideo(
  upstream: Record<string, LooseRecord>,
  helpers: CinematicAuthoringWorkflowNodePackHelpers,
) {
  for (const outputs of Object.values(upstream)) {
    const video = helpers.asRecord(outputs.video)
    if (video.debugSkipVideoGeneration === true || video.skippedReason === 'debug_skip_video_generation') return true
    if (outputs.debugSkipVideoGeneration === true || outputs.skippedReason === 'debug_skip_video_generation') return true
  }
  return false
}

function collectCinematicV3StoryboardPanels(
  upstream: Record<string, LooseRecord>,
  helpers: CinematicAuthoringWorkflowNodePackHelpers,
) {
  const rawPanels = Object.values(upstream)
    .flatMap((outputs) => {
      const directPanels = Array.isArray(outputs.panels) ? outputs.panels.map(helpers.asRecord) : []
      const images = Array.isArray(outputs.images) ? outputs.images.map(helpers.asRecord) : []
      return [...directPanels, ...images].filter((entry) => (
        helpers.readText(entry.assetKey)
        && (
          helpers.readText(entry.role) === 'cinematic_v3_storyboard_panel'
          || helpers.readText(helpers.asRecord(entry.metadata).role) === 'cinematic_v3_storyboard_panel'
          || helpers.readText(entry.shotId)
        )
      ))
    })
  const seenPanelKeys = new Set<string>()
  return rawPanels.filter((panel) => {
    const key = helpers.readText(panel.assetKey) || `${helpers.readText(panel.storyboardGroupId)}:${helpers.readText(panel.shotId)}:${helpers.readText(panel.id)}`
    if (!key || seenPanelKeys.has(key)) return false
    seenPanelKeys.add(key)
    return true
  })
}

function collectCinematicV3VideoPrompts(
  upstream: Record<string, LooseRecord>,
  helpers: CinematicAuthoringWorkflowNodePackHelpers,
) {
  return Object.entries(upstream)
    .map(([nodeKey, outputs]) => {
      const prompt = helpers.readText(outputs.prompt) || helpers.readText(outputs.text)
      if (!prompt) return null
      const storyboardGroup = helpers.asRecord(outputs.storyboardGroup)
      return {
        nodeKey,
        prompt,
        promptHash: helpers.hashOutputWorkflowValue(prompt),
        storyboardGroupId: helpers.readText(outputs.storyboardGroupId) || helpers.readText(storyboardGroup.id),
        storyboardGroupIndex: Number(storyboardGroup.index ?? 0) || null,
        durationSeconds: Number(outputs.durationSeconds ?? 0) || null,
        referenceImageCount: Number(outputs.referenceImageCount ?? 0) || 0,
      }
    })
    .filter(Boolean) as LooseRecord[]
}

async function cinematicV3PanelExtractNode(
  context: CinematicAuthoringNodeExecutionContext,
  helpers: CinematicAuthoringWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const sheetImage = helpers.readFirstUpstreamImage(context.upstream, ['image'])
  const shotPlan = cinematicV2ShotPlanSchema.parse(helpers.asRecord(mergeCinematicV3ShotPlansForTimeline(collectCinematicV3ShotPlansFromUpstream(context.upstream))))
  if (!sheetImage) throw new Error('Cinematics V2 panel extraction requires a storyboard sheet image.')
  const configuredLayout = cinematicV2StoryboardLayoutSchema.safeParse(config.storyboardLayout)
  const configuredGroup = cinematicV2StoryboardGroupPlanSchema.shape.groups.element.safeParse(config.storyboardGroup)
  const storyboardGroup = configuredGroup.success ? configuredGroup.data : null
  const imageLayout = cinematicV2StoryboardLayoutSchema.safeParse(sheetImage.storyboardLayout ?? helpers.asRecord(sheetImage.metadata).storyboardLayout)
  const layout = configuredLayout.success
    ? configuredLayout.data
    : imageLayout.success
      ? imageLayout.data
      : buildCinematicV3StoryboardLayout(shotPlan.shots.length)
  const groupShotIds = new Set(storyboardGroup?.shotIds ?? [])
  const matchedGroupShots = storyboardGroup
    ? shotPlan.shots.filter((shot) => groupShotIds.has(shot.id))
    : []
  const shotsToExtract = storyboardGroup
    ? (matchedGroupShots.length > 0 ? matchedGroupShots : shotPlan.shots).slice(0, layout.panelCount)
    : shotPlan.shots.slice(0, layout.panelCount)
  const sheetStoragePath = helpers.readText(sheetImage.storagePath) || helpers.readText(sheetImage.storage_path)
  const sheetBytes = sheetStoragePath
    ? await helpers.downloadProjectAssetBytes(context.client, sheetStoragePath)
    : await helpers.downloadRemoteBytes(helpers.readText(sheetImage.url))
  const sourceMimeType = helpers.readText(sheetImage.mimeType) || helpers.readText(sheetImage.mime_type) || 'image/webp'
  const tempDir = await Deno.makeTempDir({ prefix: 'graphcore-cinematic-panels-' })
  const panels: LooseRecord[] = []
  try {
    const sourcePath = `${tempDir}/storyboard.${sourceMimeType.includes('png') ? 'png' : sourceMimeType.includes('jpeg') || sourceMimeType.includes('jpg') ? 'jpg' : 'webp'}`
    await Deno.writeFile(sourcePath, sheetBytes)
    const probedSize = await helpers.probeImageSize(sourcePath)
    const width = probedSize?.width
      || Number(sheetImage.width ?? 0)
      || Number(helpers.asRecord(config.imageSize).width ?? 0)
      || 1536
    const height = probedSize?.height
      || Number(sheetImage.height ?? 0)
      || Number(helpers.asRecord(config.imageSize).height ?? 0)
      || 864
    for (const [index, shot] of shotsToExtract.entries()) {
      const row = Math.floor(index / layout.columns)
      const column = index % layout.columns
      const cropX = Math.floor((width * column) / layout.columns)
      const cropY = Math.floor((height * row) / layout.rows)
      const nextX = Math.floor((width * (column + 1)) / layout.columns)
      const nextY = Math.floor((height * (row + 1)) / layout.rows)
      const panelWidth = Math.max(1, Math.min(width - cropX, nextX - cropX))
      const panelHeight = Math.max(1, Math.min(height - cropY, nextY - cropY))
      if (panelWidth < 32 || panelHeight < 32) {
        throw new Error(`Cinematics V3 panel extraction produced an invalid crop for shot ${shot.index}: ${panelWidth}x${panelHeight}. Check the persisted storyboard grid layout.`)
      }
      const outputPath = `${tempDir}/panel-${String(index + 1).padStart(3, '0')}.webp`
      const crop = await helpers.runFfmpeg(['-y', '-i', sourcePath, '-vf', `crop=${panelWidth}:${panelHeight}:${cropX}:${cropY}`, outputPath])
      if (!crop.ok) {
        throw new Error(`Cinematics V2 panel crop failed for shot ${shot.index}: ${crop.stderr.slice(0, 1200)}`)
      }
      const panelBytes = await Deno.readFile(outputPath)
      const assetKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.cinematic-v2-panel-${helpers.slugify(shot.id)}`
      const storagePath = `generated/output-workflows/${context.run.projectId}/${context.run.id}/cinematic-v2-panels/${helpers.slugify(storyboardGroup?.id || 'single')}/${helpers.slugify(shot.id)}.webp`
      const mimeType = 'image/webp'
      await helpers.uploadBytes(context.client, storagePath, panelBytes, mimeType)
      const metadata = {
        generatedBy: 'output_workflow',
        workflowId: context.workflow.id,
        workflowKey: context.workflow.key,
        runId: context.run.id,
        nodeId: context.node.id,
        nodeKey: context.node.key,
        preset: context.run.preset,
        role: 'cinematic_v3_storyboard_panel',
        sequenceAnimaticArtifactRole: helpers.readText(helpers.asRecord(context.workflow.metadata).sequenceAnimaticRole) === 'storyboard_block' ? 'sequence_animatic_block_panel' : null,
        parentRequestId: helpers.readText(helpers.asRecord(context.workflow.metadata).parentRequestId) || helpers.readText(helpers.asRecord(context.run.metadata).parentRequestId) || null,
        sequenceUnitKey: helpers.readText(helpers.asRecord(context.workflow.metadata).sequenceUnitKey) || helpers.readText(helpers.asRecord(context.run.metadata).sequenceUnitKey) || null,
        storyboardBlockId: helpers.readText(helpers.asRecord(context.workflow.metadata).storyboardBlockId) || storyboardGroup?.id || null,
        purpose: 'cinematic_v3_panel_extract',
        shotId: shot.id,
        shotIndex: shot.index,
        storyboardGroupId: storyboardGroup?.id ?? null,
        panelIndexInGroup: index,
        sourceSheetAssetKey: helpers.readText(sheetImage.assetKey),
        sourceSheetStoragePath: sheetStoragePath,
        row,
        column,
        crop: { x: cropX, y: cropY, width: panelWidth, height: panelHeight },
        cropRect: { x: cropX, y: cropY, width: panelWidth, height: panelHeight },
        cropMode: 'ffmpeg_crop',
        storageBucket: 'project-assets',
        storagePath,
      }
      const artifact = await helpers.registerImageArtifact({
        client: context.client,
        run: context.run,
        workflow: context.workflow,
        node: context.node,
        assetKey,
        storagePath,
        name: `Shot ${shot.index} Storyboard Panel`,
        summary: 'Extracted Cinematics V2 storyboard panel for one shot.',
        mimeType,
        metadata,
      })
      panels.push({
        id: `panel_${shot.id}`,
        shotId: shot.id,
        shotIndex: shot.index,
        storyboardGroupId: storyboardGroup?.id ?? null,
        panelIndexInGroup: index,
        assetKey,
        storagePath,
        mimeType,
        sourceSheetAssetKey: helpers.readText(sheetImage.assetKey) || null,
        row,
        column,
        cropRect: { x: cropX, y: cropY, width: panelWidth, height: panelHeight },
        width: panelWidth,
        height: panelHeight,
        role: 'cinematic_v3_storyboard_panel',
        sequenceAnimaticArtifactRole: helpers.readText(helpers.asRecord(context.workflow.metadata).sequenceAnimaticRole) === 'storyboard_block' ? 'sequence_animatic_block_panel' : null,
        artifact,
      })
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {})
  }
  if (panels.length !== shotsToExtract.length) {
    throw new Error(`Cinematics V3 panel extraction expected ${shotsToExtract.length} cropped panel${shotsToExtract.length === 1 ? '' : 's'} from the persisted ${layout.rows}x${layout.columns} grid but produced ${panels.length}.`)
  }
  const missingPanelShotIds = shotsToExtract
    .map((shot) => shot.id)
    .filter((shotId) => !panels.some((panel) => helpers.readText(panel.shotId) === shotId && helpers.readText(panel.assetKey)))
  if (missingPanelShotIds.length > 0) {
    throw new Error(`Cinematics V3 panel extraction missed shot panel asset(s): ${missingPanelShotIds.join(', ')}.`)
  }
  const outputs = {
    panels,
    images: panels,
    image: panels[0] ?? null,
    storyboardLayout: layout,
    storyboardGroup,
    storyboardGroupId: storyboardGroup?.id ?? null,
    sourceImage: sheetImage,
    shotPlan,
    deterministic: true,
    text: `Extracted ${panels.length} Cinematics V2 storyboard panels.`,
  }
  return result({ context, helpers, outputs, model: 'ffmpeg-cinematic-v2-panel-extract-v1' })
}

async function cinematicV2PanelExtractNode(
  context: CinematicAuthoringNodeExecutionContext,
  helpers: CinematicAuthoringWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const sheetImage = helpers.readFirstUpstreamImage(context.upstream, ['image'])
  const shotPlan = cinematicV2ShotPlanSchema.parse(helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan']))
  if (!sheetImage) throw new Error('Cinematics V2 panel extraction requires a storyboard sheet image.')
  const configuredLayout = cinematicV2StoryboardLayoutSchema.safeParse(config.storyboardLayout)
  const configuredGroup = cinematicV2StoryboardGroupPlanSchema.shape.groups.element.safeParse(config.storyboardGroup)
  const storyboardGroup = configuredGroup.success ? configuredGroup.data : null
  const imageLayout = cinematicV2StoryboardLayoutSchema.safeParse(sheetImage.storyboardLayout ?? helpers.asRecord(sheetImage.metadata).storyboardLayout)
  const layout = configuredLayout.success
    ? configuredLayout.data
    : imageLayout.success
      ? imageLayout.data
      : buildCinematicV3StoryboardLayout(shotPlan.shots.length)
  const groupShotIds = new Set(storyboardGroup?.shotIds ?? [])
  const matchedGroupShots = storyboardGroup
    ? shotPlan.shots.filter((shot) => groupShotIds.has(shot.id))
    : []
  const shotsToExtract = storyboardGroup
    ? (matchedGroupShots.length > 0 ? matchedGroupShots : shotPlan.shots).slice(0, layout.panelCount)
    : shotPlan.shots.slice(0, layout.panelCount)
  const sheetStoragePath = helpers.readText(sheetImage.storagePath) || helpers.readText(sheetImage.storage_path)
  const sheetBytes = sheetStoragePath
    ? await helpers.downloadProjectAssetBytes(context.client, sheetStoragePath)
    : await helpers.downloadRemoteBytes(helpers.readText(sheetImage.url))
  const sourceMimeType = helpers.readText(sheetImage.mimeType) || helpers.readText(sheetImage.mime_type) || 'image/webp'
  const tempDir = await Deno.makeTempDir({ prefix: 'graphcore-cinematic-panels-' })
  const panels: LooseRecord[] = []
  try {
    const sourcePath = `${tempDir}/storyboard.${sourceMimeType.includes('png') ? 'png' : sourceMimeType.includes('jpeg') || sourceMimeType.includes('jpg') ? 'jpg' : 'webp'}`
    await Deno.writeFile(sourcePath, sheetBytes)
    const probedSize = await helpers.probeImageSize(sourcePath)
    const width = probedSize?.width
      || Number(sheetImage.width ?? 0)
      || Number(helpers.asRecord(config.imageSize).width ?? 0)
      || 1536
    const height = probedSize?.height
      || Number(sheetImage.height ?? 0)
      || Number(helpers.asRecord(config.imageSize).height ?? 0)
      || 864
    for (const [index, shot] of shotsToExtract.entries()) {
      const row = Math.floor(index / layout.columns)
      const column = index % layout.columns
      const cropX = Math.floor((width * column) / layout.columns)
      const cropY = Math.floor((height * row) / layout.rows)
      const nextX = Math.floor((width * (column + 1)) / layout.columns)
      const nextY = Math.floor((height * (row + 1)) / layout.rows)
      const panelWidth = Math.max(1, Math.min(width - cropX, nextX - cropX))
      const panelHeight = Math.max(1, Math.min(height - cropY, nextY - cropY))
      if (panelWidth < 32 || panelHeight < 32) {
        throw new Error(`Cinematics V2 panel extraction produced an invalid crop for shot ${shot.index}: ${panelWidth}x${panelHeight}. Check the persisted storyboard grid layout.`)
      }
      const outputPath = `${tempDir}/panel-${String(index + 1).padStart(3, '0')}.webp`
      const crop = await helpers.runFfmpeg(['-y', '-i', sourcePath, '-vf', `crop=${panelWidth}:${panelHeight}:${cropX}:${cropY}`, outputPath])
      if (!crop.ok) {
        throw new Error(`Cinematics V2 panel crop failed for shot ${shot.index}: ${crop.stderr.slice(0, 1200)}`)
      }
      const panelBytes = await Deno.readFile(outputPath)
      const assetKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.cinematic-v2-panel-${helpers.slugify(shot.id)}`
      const storagePath = `generated/output-workflows/${context.run.projectId}/${context.run.id}/cinematic-v2-panels/${helpers.slugify(storyboardGroup?.id || 'single')}/${helpers.slugify(shot.id)}.webp`
      const mimeType = 'image/webp'
      await helpers.uploadBytes(context.client, storagePath, panelBytes, mimeType)
      const metadata = {
        generatedBy: 'output_workflow',
        workflowId: context.workflow.id,
        workflowKey: context.workflow.key,
        runId: context.run.id,
        nodeId: context.node.id,
        nodeKey: context.node.key,
        preset: context.run.preset,
        role: 'cinematic_v2_storyboard_panel',
        sequenceAnimaticArtifactRole: helpers.readText(helpers.asRecord(context.workflow.metadata).sequenceAnimaticRole) === 'storyboard_block' ? 'sequence_animatic_block_panel' : null,
        parentRequestId: helpers.readText(helpers.asRecord(context.workflow.metadata).parentRequestId) || helpers.readText(helpers.asRecord(context.run.metadata).parentRequestId) || null,
        sequenceUnitKey: helpers.readText(helpers.asRecord(context.workflow.metadata).sequenceUnitKey) || helpers.readText(helpers.asRecord(context.run.metadata).sequenceUnitKey) || null,
        storyboardBlockId: helpers.readText(helpers.asRecord(context.workflow.metadata).storyboardBlockId) || storyboardGroup?.id || null,
        purpose: 'cinematic_v2_panel_extract',
        shotId: shot.id,
        shotIndex: shot.index,
        storyboardGroupId: storyboardGroup?.id ?? null,
        panelIndexInGroup: index,
        sourceSheetAssetKey: helpers.readText(sheetImage.assetKey),
        sourceSheetStoragePath: sheetStoragePath,
        row,
        column,
        crop: { x: cropX, y: cropY, width: panelWidth, height: panelHeight },
        cropRect: { x: cropX, y: cropY, width: panelWidth, height: panelHeight },
        cropMode: 'ffmpeg_crop',
        storageBucket: 'project-assets',
        storagePath,
      }
      const artifact = await helpers.registerImageArtifact({
        client: context.client,
        run: context.run,
        workflow: context.workflow,
        node: context.node,
        assetKey,
        storagePath,
        name: `Shot ${shot.index} Storyboard Panel`,
        summary: 'Extracted Cinematics V2 storyboard panel for one shot.',
        mimeType,
        metadata,
      })
      panels.push({
        id: `panel_${shot.id}`,
        shotId: shot.id,
        shotIndex: shot.index,
        storyboardGroupId: storyboardGroup?.id ?? null,
        panelIndexInGroup: index,
        assetKey,
        storagePath,
        mimeType,
        sourceSheetAssetKey: helpers.readText(sheetImage.assetKey) || null,
        row,
        column,
        cropRect: { x: cropX, y: cropY, width: panelWidth, height: panelHeight },
        width: panelWidth,
        height: panelHeight,
        role: 'cinematic_v2_storyboard_panel',
        sequenceAnimaticArtifactRole: helpers.readText(helpers.asRecord(context.workflow.metadata).sequenceAnimaticRole) === 'storyboard_block' ? 'sequence_animatic_block_panel' : null,
        artifact,
      })
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {})
  }
  if (panels.length !== shotsToExtract.length) {
    throw new Error(`Cinematics V2 panel extraction expected ${shotsToExtract.length} cropped panel${shotsToExtract.length === 1 ? '' : 's'} from the persisted ${layout.rows}x${layout.columns} grid but produced ${panels.length}.`)
  }
  const missingPanelShotIds = shotsToExtract
    .map((shot) => shot.id)
    .filter((shotId) => !panels.some((panel) => helpers.readText(panel.shotId) === shotId && helpers.readText(panel.assetKey)))
  if (missingPanelShotIds.length > 0) {
    throw new Error(`Cinematics V2 panel extraction missed shot panel asset(s): ${missingPanelShotIds.join(', ')}.`)
  }
  const outputs = {
    panels,
    images: panels,
    image: panels[0] ?? null,
    storyboardLayout: layout,
    storyboardGroup,
    storyboardGroupId: storyboardGroup?.id ?? null,
    sourceImage: sheetImage,
    shotPlan,
    deterministic: true,
    text: `Extracted ${panels.length} Cinematics V2 storyboard panels.`,
  }
  return result({ context, helpers, outputs, model: 'ffmpeg-cinematic-v2-panel-extract-v1' })
}

async function cinematicV2KeyframeQaNode(
  context: CinematicAuthoringNodeExecutionContext,
  helpers: CinematicAuthoringWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shotId = helpers.readText(config.shotId)
  const shotIndex = Number(config.shotIndex ?? 0) || 0
  const shotPlan = cinematicV2ShotPlanSchema.parse(helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan']))
  const shot = shotPlan.shots.find((entry) => entry.id === shotId) ?? shotPlan.shots.find((entry) => entry.index === shotIndex) ?? shotPlan.shots[0]
  const keyframeImage = helpers.readFirstUpstreamImage(context.upstream, ['image', 'keyframe'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const expectedEntityRefIds = [
    ...shot.visibleCharacterRefIds,
    ...shot.speakerRefIds,
    ...(shot.locationRefId ? [shot.locationRefId] : []),
    ...shot.propRefIds,
  ].filter((value, index, values) => value && values.indexOf(value) === index)
  const selectedEntityCount = cinematicAssetPackEntityKeys(assetPack).length
  const notes = [
    `Expected refs: ${expectedEntityRefIds.join(', ') || 'none'}.`,
    shot.performanceBeats.length > 0 ? `Expected acting direction: ${formatCinematicV2PerformanceDirection(shot)}.` : 'No structured acting direction was supplied for this shot.',
    `Shot-scoped asset pack refs: ${selectedEntityCount}.`,
    keyframeImage ? 'Keyframe media is present for advisory review.' : 'No keyframe media was found.',
  ]
  if (shot.visibleCharacterRefIds.length === 1) {
    notes.push('Single-character shot: review for duplicate subject or background lookalike risk.')
  }
  const issueCategories = [
    ...(!keyframeImage ? ['missing_keyframe' as const] : []),
    ...(shot.visibleCharacterRefIds.length === 1 ? ['duplicate_subject_risk' as const] : []),
    'storyboard_artifact_risk' as const,
    'prompt_adherence_risk' as const,
  ]
  const qa = cinematicV2KeyframeQaSchema.parse({
    shotId: shot.id,
    shotIndex: shot.index,
    status: keyframeImage ? 'needs_review' : 'missing_media',
    expectedEntityRefIds,
    expectedEntityCount: expectedEntityRefIds.length,
    issueCategories,
    notes,
  })
  const outputs = {
    keyframeQa: qa,
    keyframe_qa: qa,
    shot,
    image: keyframeImage ?? null,
    assetPack,
    deterministic: true,
    text: JSON.stringify(qa, null, 2),
  }
  return result({ context, helpers, outputs, model: 'deterministic-cinematic-v2-keyframe-qa-v1' })
}

async function cinematicV2ShotKeyframePassthroughNode(
  context: CinematicAuthoringNodeExecutionContext,
  helpers: CinematicAuthoringWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shotId = helpers.readText(config.shotId)
  const shotIndex = Number(config.shotIndex ?? 0) || 0
  const shotPlan = cinematicV2ShotPlanSchema.safeParse(helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan']))
  const shot = shotPlan.success
    ? shotPlan.data.shots.find((entry) => entry.id === shotId) ?? shotPlan.data.shots.find((entry) => entry.index === shotIndex) ?? null
    : null
  const panels = helpers.readFirstUpstreamArray(context.upstream, ['panels', 'images'])
  const selectedPanel = panels.find((entry) => helpers.readText(entry.shotId) === (shot?.id ?? shotId))
    ?? panels.find((entry) => Number(entry.shotIndex ?? 0) === (shot?.index ?? shotIndex))
    ?? null
  const selectedImage = selectedPanel ?? helpers.readFirstUpstreamImage(context.upstream, ['image'])
  if (!selectedImage) throw new Error('Cinematics V2 panel keyframe requires a cropped storyboard panel image.')
  const selectedImageMetadata = helpers.asRecord(selectedImage.metadata)
  const image = {
    ...selectedImage,
    role: 'cinematic_v2_shot_keyframe',
    sourceRole: helpers.readText(selectedImage.role) || helpers.readText(selectedImageMetadata.role) || 'cinematic_v2_storyboard_panel',
    sourcePanelAssetKey: helpers.readText(selectedImage.assetKey),
    sourcePanelStoragePath: helpers.readText(selectedImage.storagePath) || helpers.readText(selectedImage.storage_path),
    shotId: helpers.readText(selectedImage.shotId) || shot?.id || shotId || null,
    shotIndex: Number(selectedImage.shotIndex ?? 0) || shot?.index || shotIndex || null,
    generatedBy: 'deterministic_panel_passthrough',
    keyframeMode: 'storyboard_panel_crop',
    planningOnly: true,
    planning_only: true,
  }
  const outputs = {
    image,
    keyframe: image,
    shot,
    deterministic: true,
    text: `Selected cropped storyboard panel as the shot ${image.shotIndex ?? ''} animatic keyframe.`.trim(),
  }
  return result({ context, helpers, outputs, model: 'deterministic-cinematic-v2-panel-keyframe-v1' })
}

async function cinematicV2TimelineAssembleNode(
  context: CinematicAuthoringNodeExecutionContext,
  helpers: CinematicAuthoringWorkflowNodePackHelpers,
) {
  const shotPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan'])
  const videos = collectCinematicV2ShotVideos(context.upstream, helpers)
  const timeline = buildCinematicV2Timeline({ shotPlan, videos }, helpers)
  if (!cinematicVideoApprovedEnabled(context.run, helpers)) {
    const video = {
      skipped: true,
      approvalRequired: true,
      skippedReason: 'cinematic_video_approval_required',
      provider: 'graphcore',
      model: 'cinematic-v2-timeline-approval-gate-v1',
      role: 'cinematic_v2_final_timeline',
      sourceVideoCount: videos.length,
    }
    const outputs = { video, videos, timeline, approvalRequired: true, skippedReason: 'cinematic_video_approval_required' }
    return result({ context, helpers, outputs, model: 'cinematic-v2-timeline-approval-gate-v1', status: 'skipped' })
  }
  if (videos.length === 0 && upstreamHasDebugSkippedVideo(context.upstream, helpers)) {
    const video = {
      skipped: true,
      debugSkipVideoGeneration: true,
      skippedReason: 'debug_skip_video_generation',
      provider: 'graphcore',
      model: 'debug-skip-cinematic-v2-timeline-v1',
      role: 'cinematic_v2_final_timeline',
      sourceVideoCount: 0,
    }
    const outputs = { video, videos: [], timeline, debugSkipVideoGeneration: true, skippedReason: 'debug_skip_video_generation' }
    return result({ context, helpers, outputs, model: 'debug-skip-cinematic-v2-timeline-v1', status: 'skipped' })
  }
  const stitchResult = await helpers.stitchVideoBytes({ client: context.client, videos })
  const assetKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.${helpers.slugify(context.node.key)}`
  const storagePath = `generated/output-workflows/${context.run.projectId}/${context.run.id}/${helpers.slugify(context.node.key)}.mp4`
  await helpers.uploadBytes(context.client, storagePath, stitchResult.bytes, stitchResult.mimeType)
  const metadata = {
    generatedBy: 'output_workflow',
    workflowId: context.workflow.id,
    workflowKey: context.workflow.key,
    runId: context.run.id,
    nodeId: context.node.id,
    nodeKey: context.node.key,
    preset: context.run.preset,
    provider: 'graphcore',
    model: 'ffmpeg-cinematic-v2-timeline-assemble-v1',
    role: 'cinematic_v2_final_timeline',
    stitchMode: stitchResult.mode,
    timeline,
    sourceVideoAssetKeys: videos.map((video) => helpers.readText(video.assetKey)).filter(Boolean),
    sourceVideoStoragePaths: videos.map((video) => helpers.readText(video.storagePath) || helpers.readText(video.storage_path)).filter(Boolean),
    byteSize: stitchResult.bytes.byteLength,
    storageBucket: 'project-assets',
    storagePath,
  }
  const artifact = await helpers.registerVideoArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    assetKey,
    storagePath,
    name: context.node.label,
    summary: 'Final Cinematics V2 shot-orchestrated sequence video.',
    mimeType: stitchResult.mimeType,
    metadata,
  })
  const video = {
    assetKey,
    storagePath,
    mimeType: stitchResult.mimeType,
    provider: 'graphcore',
    model: 'ffmpeg-cinematic-v2-timeline-assemble-v1',
    role: 'cinematic_v2_final_timeline',
    sourceVideoCount: videos.length,
    stitchMode: stitchResult.mode,
  }
  const outputs = { video, videos, timeline, artifact, assetKey, storagePath, mimeType: stitchResult.mimeType }
  return result({ context, helpers, outputs, model: 'ffmpeg-cinematic-v2-timeline-assemble-v1' })
}

async function cinematicV3TimelineAssembleNode(
  context: CinematicAuthoringNodeExecutionContext,
  helpers: CinematicAuthoringWorkflowNodePackHelpers,
) {
  const shotPlan = mergeCinematicV3ShotPlansForTimeline(collectCinematicV3ShotPlansFromUpstream(context.upstream))
  const videos = collectCinematicV2ShotVideos(context.upstream, helpers)
  const panels = collectCinematicV3StoryboardPanels(context.upstream, helpers)
  const videoPrompts = collectCinematicV3VideoPrompts(context.upstream, helpers)
  const timeline = buildCinematicV2Timeline({ shotPlan, videos }, helpers)
  if (!cinematicVideoApprovedEnabled(context.run, helpers)) {
    const video = {
      authoringOnly: true,
      approvalRequired: true,
      skippedReason: 'cinematic_video_approval_required',
      provider: 'graphcore',
      model: 'cinematic-v3-authoring-timeline-v1',
      role: 'cinematic_v3_final_timeline',
      sourceVideoCount: videos.length,
      sourcePanelCount: panels.length,
      videoPromptCount: videoPrompts.length,
    }
    const outputs = {
      video,
      videos,
      shotPlan,
      shot_plan: shotPlan,
      panels,
      videoPrompts,
      timeline,
      approvalRequired: true,
      authoringReady: true,
      skippedReason: 'cinematic_video_approval_required',
      text: JSON.stringify({
        timeline,
        panelCount: panels.length,
        videoPromptCount: videoPrompts.length,
        approvalRequired: true,
      }, null, 2),
    }
    return result({ context, helpers, outputs, model: 'cinematic-v3-authoring-timeline-v1' })
  }
  if (videos.length === 0 && upstreamHasDebugSkippedVideo(context.upstream, helpers)) {
    const video = {
      skipped: true,
      debugSkipVideoGeneration: true,
      skippedReason: 'debug_skip_video_generation',
      provider: 'graphcore',
      model: 'debug-skip-cinematic-v3-timeline-v1',
      role: 'cinematic_v3_final_timeline',
      sourceVideoCount: 0,
    }
    const outputs = { video, videos: [], shotPlan, shot_plan: shotPlan, timeline, debugSkipVideoGeneration: true, skippedReason: 'debug_skip_video_generation' }
    return result({ context, helpers, outputs, model: 'debug-skip-cinematic-v3-timeline-v1', status: 'skipped' })
  }
  const stitchResult = await helpers.stitchVideoBytes({ client: context.client, videos })
  const assetKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.${helpers.slugify(context.node.key)}`
  const storagePath = `generated/output-workflows/${context.run.projectId}/${context.run.id}/${helpers.slugify(context.node.key)}.mp4`
  await helpers.uploadBytes(context.client, storagePath, stitchResult.bytes, stitchResult.mimeType)
  const metadata = {
    generatedBy: 'output_workflow',
    workflowId: context.workflow.id,
    workflowKey: context.workflow.key,
    runId: context.run.id,
    nodeId: context.node.id,
    nodeKey: context.node.key,
    preset: context.run.preset,
    provider: 'graphcore',
    model: 'ffmpeg-cinematic-v3-timeline-assemble-v1',
    role: 'cinematic_v3_final_timeline',
    stitchMode: stitchResult.mode,
    timeline,
    sourceVideoAssetKeys: videos.map((video) => helpers.readText(video.assetKey)).filter(Boolean),
    sourceVideoStoragePaths: videos.map((video) => helpers.readText(video.storagePath) || helpers.readText(video.storage_path)).filter(Boolean),
    byteSize: stitchResult.bytes.byteLength,
    storageBucket: 'project-assets',
    storagePath,
  }
  const artifact = await helpers.registerVideoArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    assetKey,
    storagePath,
    name: context.node.label,
    summary: 'Final Cinematics V3 storyboard-group sequence video.',
    mimeType: stitchResult.mimeType,
    metadata,
  })
  const video = {
    assetKey,
    storagePath,
    mimeType: stitchResult.mimeType,
    provider: 'graphcore',
    model: 'ffmpeg-cinematic-v3-timeline-assemble-v1',
    role: 'cinematic_v3_final_timeline',
    sourceVideoCount: videos.length,
    stitchMode: stitchResult.mode,
  }
  const outputs = { video, videos, shotPlan, shot_plan: shotPlan, timeline, artifact, assetKey, storagePath, mimeType: stitchResult.mimeType }
  return result({ context, helpers, outputs, model: 'ffmpeg-cinematic-v3-timeline-assemble-v1' })
}

async function cinematicVideoArtifactNode(
  context: CinematicAuthoringNodeExecutionContext,
  helpers: CinematicAuthoringWorkflowNodePackHelpers,
) {
  const video = helpers.readFirstUpstreamRecord(context.upstream, ['video'])
  const artifact = helpers.readFirstUpstreamRecord(context.upstream, ['artifact'])
  if (video.authoringOnly === true || (video.approvalRequired === true && helpers.readText(video.role) === 'cinematic_v3_final_timeline')) {
    const timeline = helpers.readFirstUpstreamRecord(context.upstream, ['timeline'])
    const shotPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan'])
    const panels = helpers.readFirstUpstreamArray(context.upstream, ['panels'])
    const videoPrompts = helpers.readFirstUpstreamArray(context.upstream, ['videoPrompts', 'video_prompts'])
    const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.${helpers.slugify(context.node.key)}.authoring`
    const authoringArtifact = helpers.asRecord(await helpers.registerOtherArtifact({
      client: context.client,
      run: context.run,
      workflow: context.workflow,
      node: context.node,
      key: artifactKey,
      name: `${context.node.label} Authoring Timeline`,
      summary: 'Cinematics V3 storyboard authoring timeline with panel crops and video prompts; video generation is approval-gated.',
      metadata: {
        generatedBy: 'output_workflow',
        workflowId: context.workflow.id,
        workflowKey: context.workflow.key,
        runId: context.run.id,
        nodeId: context.node.id,
        nodeKey: context.node.key,
        preset: context.run.preset,
        provider: 'graphcore',
        model: 'cinematic-v3-authoring-artifact-v1',
        role: 'cinematic_v3_authoring_timeline',
        timeline,
        shotPlan,
        panelAssetKeys: panels.map((panel) => helpers.readText(panel.assetKey)).filter(Boolean),
        panelCount: panels.length,
        videoPromptCount: videoPrompts.length,
        videoPrompts: videoPrompts.map((prompt) => ({
          nodeKey: helpers.readText(prompt.nodeKey),
          storyboardGroupId: helpers.readText(prompt.storyboardGroupId),
          storyboardGroupIndex: Number(prompt.storyboardGroupIndex ?? 0) || null,
          durationSeconds: Number(prompt.durationSeconds ?? 0) || null,
          promptHash: helpers.readText(prompt.promptHash),
        })),
        approvalRequired: true,
      },
    }))
    const outputs = {
      artifactKey: helpers.readText(authoringArtifact.key),
      assetKey: '',
      artifact: authoringArtifact,
      artifacts: [authoringArtifact],
      video,
      timeline,
      shotPlan,
      panels,
      videoPrompts,
      approvalRequired: true,
      authoringReady: true,
    }
    return result({ context, helpers, outputs, model: 'cinematic-v3-authoring-artifact-v1' })
  }
  if (
    video.debugSkipVideoGeneration === true
    || video.skippedReason === 'debug_skip_video_generation'
    || video.skippedReason === 'cinematic_video_approval_required'
  ) {
    const skippedReason = helpers.readText(video.skippedReason) || 'debug_skip_video_generation'
    const outputs = {
      artifactKey: '',
      assetKey: '',
      artifact: {},
      artifacts: [],
      video,
      debugSkipVideoGeneration: video.debugSkipVideoGeneration === true,
      approvalRequired: video.skippedReason === 'cinematic_video_approval_required',
      skippedReason,
    }
    return result({
      context,
      helpers,
      outputs,
      model: skippedReason === 'cinematic_video_approval_required'
        ? 'cinematic-v2-artifact-approval-gate-v1'
        : 'debug-skip-cinematic-video-artifact-v1',
      status: 'skipped',
    })
  }
  const assetKey = helpers.readText(video.assetKey) || helpers.readText(artifact.assetKey)
  if (!assetKey) throw new Error('Cinematic video artifact requires a stitched video input.')
  const outputs = {
    artifactKey: helpers.readText(artifact.key),
    assetKey,
    artifact,
    artifacts: Object.keys(artifact).length > 0 ? [artifact] : [],
    video,
  }
  return result({ context, helpers, outputs, model: 'deterministic-cinematic-video-artifact-v1' })
}

const cinematicAuthoringHandlers = {
  cinematic_v2_panel_extract: cinematicV2PanelExtractNode,
  cinematic_v2_keyframe_qa: cinematicV2KeyframeQaNode,
  cinematic_v2_shot_keyframe_passthrough: cinematicV2ShotKeyframePassthroughNode,
  cinematic_v2_timeline_assemble: cinematicV2TimelineAssembleNode,
  cinematic_v3_panel_extract: cinematicV3PanelExtractNode,
  cinematic_v3_timeline_assemble: cinematicV3TimelineAssembleNode,
  cinematic_video_artifact: cinematicVideoArtifactNode,
}

const cinematicAuthoringWorkflowNodePackKey = 'output_workflow_cinematic_authoring'

export const cinematicAuthoringWorkflowNodePack = defineWorkflowNodePack<
  CinematicAuthoringNodeExecutionContext,
  CinematicAuthoringNodeExecutionResult,
  CinematicAuthoringWorkflowNodePackHelpers,
  typeof cinematicAuthoringHandlers
>({
  packKey: cinematicAuthoringWorkflowNodePackKey,
  handlers: cinematicAuthoringHandlers,
})

export const cinematicAuthoringWorkflowNodeHandlerKeys = cinematicAuthoringWorkflowNodePack.handlerKeys

function createCinematicAuthoringNodeScaffold(input: {
  purpose: keyof typeof cinematicAuthoringHandlers
  runtimeKind: WorkflowNodeRuntimeKind
  sourceHashKeys: string[]
  projectionMetadataKeys?: string[]
}): WorkflowNodeExtensionScaffold {
  const manifest = outputWorkflowNodeManifestsByPurpose.get(input.purpose)
  if (!manifest) throw new Error(`Cinematic authoring workflow node scaffold missing registered manifest: ${input.purpose}`)
  return createWorkflowNodeExtensionScaffold({
    ...workflowNodeManifestToContract(manifest),
    nodeType: manifest.nodeType,
    handlerKey: manifest.handlerKey,
    packKey: cinematicAuthoringWorkflowNodePackKey,
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

export const cinematicAuthoringWorkflowNodeScaffolds = [
  createCinematicAuthoringNodeScaffold({
    purpose: 'cinematic_v2_panel_extract',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: ['upstream.image', 'upstream.shotPlan', 'config.storyboardLayout', 'config.storyboardGroup', 'workflow.metadata.sequenceAnimaticRole'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'readyArtifactCount', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicAuthoringNodeScaffold({
    purpose: 'cinematic_v2_keyframe_qa',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.shotPlan', 'upstream.image', 'upstream.keyframe', 'upstream.assetPack', 'config.shotId', 'config.shotIndex'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'readyArtifactCount', 'recoveryHints'],
  }),
  createCinematicAuthoringNodeScaffold({
    purpose: 'cinematic_v2_shot_keyframe_passthrough',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.shotPlan', 'upstream.panels', 'upstream.images', 'upstream.image', 'config.shotId', 'config.shotIndex'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'readyArtifactCount', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicAuthoringNodeScaffold({
    purpose: 'cinematic_v2_timeline_assemble',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: ['upstream.shotPlan', 'upstream.videos', 'run.input.cinematicVideoApproved', 'run.metadata.cinematicVideoApproved'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'readyArtifactCount', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicAuthoringNodeScaffold({
    purpose: 'cinematic_v3_panel_extract',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: ['upstream.image', 'upstream.shotPlan', 'config.storyboardLayout', 'config.storyboardGroup', 'workflow.metadata.sequenceAnimaticRole'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'readyArtifactCount', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicAuthoringNodeScaffold({
    purpose: 'cinematic_v3_timeline_assemble',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: ['upstream.shotPlan', 'upstream.panels', 'upstream.videos', 'upstream.videoPrompts', 'run.input.cinematicVideoApproved', 'run.metadata.cinematicVideoApproved'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'readyArtifactCount', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicAuthoringNodeScaffold({
    purpose: 'cinematic_video_artifact',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: ['upstream.video', 'upstream.artifact', 'upstream.timeline', 'upstream.shotPlan', 'upstream.panels', 'upstream.videoPrompts'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'readyArtifactCount', 'scopedAssetKeys', 'recoveryHints'],
  }),
] as const

export const cinematicAuthoringWorkflowNodeScaffoldHandlerKeys = cinematicAuthoringWorkflowNodeScaffolds.map((scaffold) => scaffold.handlerKey)

export function registerCinematicAuthoringWorkflowNodePack(input: {
  helpers: CinematicAuthoringWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: CinematicAuthoringNodeExecutionContext) => Promise<CinematicAuthoringNodeExecutionResult>) => void
}) {
  cinematicAuthoringWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
