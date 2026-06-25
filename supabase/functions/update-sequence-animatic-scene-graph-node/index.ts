import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  mapOutputRequestRow,
  outputRequestSelect,
} from '../_shared/output-workflow.ts'
import {
  sequenceAnimaticSceneGraphNodeUpdateRequestSchema,
  sequenceAnimaticSceneGraphNodeUpdateResponseSchema,
  sequenceAnimaticSceneGraphOverridesSchema,
} from '../../../src/domain/outputWorkflow.ts'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readScreenplayAnimaticRole(metadata: Record<string, unknown>) {
  return readText(metadata.screenplayAnimaticRole) || readText(metadata.sequenceAnimaticRole)
}

function readSceneGraphOverrides(metadata: Record<string, unknown>) {
  const raw = asRecord(metadata.sequenceAnimaticSceneGraphOverrides ?? metadata.sequence_animatic_scene_graph_overrides)
  const parsed = sequenceAnimaticSceneGraphOverridesSchema.safeParse(raw)
  return parsed.success ? parsed.data : sequenceAnimaticSceneGraphOverridesSchema.parse({})
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'update-sequence-animatic-scene-graph-node')
    const admin = createAdminClient('update-sequence-animatic-scene-graph-node')
    const payload = sequenceAnimaticSceneGraphNodeUpdateRequestSchema.parse(await request.json())

    const masterResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('id', payload.masterRequestId)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .single()
    if (masterResponse.error || !masterResponse.data) throw new HttpError(404, 'Screenplay animatic master request not found.')

    const masterRequest = mapOutputRequestRow(masterResponse.data)
    const metadata = asRecord(masterRequest.metadata)
    if (readScreenplayAnimaticRole(metadata) !== 'master') throw new HttpError(409, 'This output is not a screenplay animatic master request.')

    const overrides = readSceneGraphOverrides(metadata)
    const existing = overrides.nodes[payload.nodeId] ?? null
    const nextNodes = { ...overrides.nodes }
    let nodeOverride: typeof existing = null

    if (payload.clearOverride) {
      delete nextNodes[payload.nodeId]
    } else {
      const visualBriefOverride = readText(payload.visualBriefOverride)
      const extraPromptDirection = readText(payload.extraPromptDirection)
      const previousAssetKeys = existing?.previousAssetKeys ?? []
      const lastGeneratedAssetKey = existing?.lastGeneratedAssetKey ?? null
      if (visualBriefOverride || extraPromptDirection || lastGeneratedAssetKey || previousAssetKeys.length > 0) {
        nodeOverride = {
          nodeId: payload.nodeId,
          nodeKind: payload.nodeKind,
          visualBriefOverride,
          extraPromptDirection,
          updatedAt: new Date().toISOString(),
          updatedBy: user.id,
          lastGeneratedAssetKey,
          previousAssetKeys,
        }
        nextNodes[payload.nodeId] = nodeOverride
      } else {
        delete nextNodes[payload.nodeId]
      }
    }

    const nextOverrides = sequenceAnimaticSceneGraphOverridesSchema.parse({
      version: 'sequence_animatic_scene_graph_overrides_v1',
      nodes: nextNodes,
    })
    const nextMetadata = {
      ...metadata,
      sequenceAnimaticSceneGraphOverrides: nextOverrides,
      sequence_animatic_scene_graph_overrides: nextOverrides,
      sequenceAnimaticSceneGraphOverridesUpdatedAt: new Date().toISOString(),
    }

    const updateResponse = await admin
      .from('output_requests')
      .update({ metadata: nextMetadata })
      .eq('id', masterRequest.id)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .select(outputRequestSelect)
      .single()
    if (updateResponse.error || !updateResponse.data) throw new Error(updateResponse.error?.message ?? 'Failed to update scene graph override metadata.')

    return json(sequenceAnimaticSceneGraphNodeUpdateResponseSchema.parse({
      ok: true,
      masterRequest: mapOutputRequestRow(updateResponse.data),
      overrides: nextOverrides,
      nodeOverride,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to update sequence animatic scene graph node.')
  }
})
