import { z } from 'zod'
import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { runOpenAiResponses } from '../_shared/openai.ts'
import {
  mapOutputArtifactRow,
  mapOutputRequestRow,
  outputArtifactSelect,
  outputRequestSelect,
} from '../_shared/output-workflow.ts'
import { normalizeStrictJsonSchema } from '../_shared/structured-output.ts'
import {
  analyzeSequenceAnimaticZonePoiLabels,
  collectGraphNodesFromContinuityPack,
  mergeZonePoiAnalysisIntoAssetState,
} from '../_shared/sequence-animatic-zone-poi-analysis.ts'
import {
  sequenceAnimaticZonePoiAnalyzeRequestSchema,
  sequenceAnimaticZonePoiAnalyzeResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseJsonObject(text: string) {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  const candidate = fenced || trimmed
  try {
    return asRecord(JSON.parse(candidate))
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return asRecord(JSON.parse(candidate.slice(start, end + 1)))
      } catch {
        return {}
      }
    }
  }
  return {}
}

function outputWorkflowTextModel() {
  return Deno.env.get('OUTPUT_WORKFLOW_TEXT_MODEL')?.trim() || 'gpt-5.4'
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'analyze-sequence-animatic-zone-pois')
    const admin = createAdminClient('analyze-sequence-animatic-zone-pois')
    const payload = sequenceAnimaticZonePoiAnalyzeRequestSchema.parse(await request.json())

    const masterResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('id', payload.masterRequestId)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .single()
    if (masterResponse.error || !masterResponse.data) throw new HttpError(404, 'Screenplay animatic master request not found.')
    const masterRequest = mapOutputRequestRow(masterResponse.data)

    const artifactResponse = await admin
      .from('output_artifacts')
      .select(outputArtifactSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .order('updated_at', { ascending: false })
      .limit(200)
    if (artifactResponse.error) throw new Error(artifactResponse.error.message)
    const artifacts = (artifactResponse.data ?? []).map((row) => mapOutputArtifactRow(row as never))
    const continuityPackArtifact = artifacts.find((artifact) => {
      const metadata = asRecord(artifact.metadata)
      return readText(metadata.role) === 'sequence_animatic_continuity_pack'
        && readText(metadata.masterRequestId) === payload.masterRequestId
    }) ?? artifacts.find((artifact) => readText(asRecord(artifact.metadata).role) === 'sequence_animatic_continuity_pack') ?? null
    const continuityPackMetadata = asRecord(continuityPackArtifact?.metadata)
    const continuityPack = asRecord(continuityPackMetadata.continuityPack ?? continuityPackMetadata.continuity_pack)

    const continuityAssetArtifact = artifacts.find((artifact) => {
      const metadata = asRecord(artifact.metadata)
      return readText(metadata.role) === 'sequence_animatic_continuity_asset'
        && readText(metadata.targetNodeId) === payload.zoneNodeId
        && readText(metadata.masterRequestId) === payload.masterRequestId
    }) ?? artifacts.find((artifact) => {
      const metadata = asRecord(artifact.metadata)
      return readText(metadata.role) === 'sequence_animatic_continuity_asset'
        && readText(metadata.targetNodeId) === payload.zoneNodeId
    }) ?? null
    if (!continuityAssetArtifact) throw new HttpError(404, 'No generated zone continuity asset was found for this node.')
    const assetMetadata = asRecord(continuityAssetArtifact.metadata)
    const image = asRecord(assetMetadata.image)
    const storagePath = readText(image.storagePath) || readText(image.storage_path)
    const assetKey = readText(assetMetadata.assetKey) || readText(image.assetKey)
    const targetNode = asRecord(assetMetadata.targetNode ?? assetMetadata.target_node)
    if (!storagePath || !assetKey) throw new HttpError(409, 'The selected zone asset has no stored image to analyze.')

    const analysis = await analyzeSequenceAnimaticZonePoiLabels({
      client: admin as never,
      targetNodeId: payload.zoneNodeId,
      targetNode,
      continuityPack,
      graphNodes: collectGraphNodesFromContinuityPack(continuityPack),
      image: {
        assetKey,
        storagePath,
        mimeType: readText(image.mimeType) || readText(image.mime_type) || 'image/webp',
      },
      runVisionStructuredNode: async (input) => {
        const model = outputWorkflowTextModel()
        const response = await runOpenAiResponses({
          model,
          instructions: input.instructions,
          input: input.input,
          text: {
            format: {
              type: 'json_schema',
              name: input.schemaName,
              schema: normalizeStrictJsonSchema(z.toJSONSchema(input.schema)),
              strict: true,
            },
          },
          maxOutputTokens: input.maxOutputTokens ?? 2200,
          metadata: {
            graphcore_task: input.schemaName,
            graphcore_node_key: input.nodeKey,
          },
          timeoutMs: 120_000,
        })
        if (!response.response.ok) {
          return {
            value: input.fallback,
            provider: 'graphcore',
            model: `deterministic-${input.schemaName}-fallback-v1`,
            providerRequestId: response.id,
            fallbackUsed: true,
            fallbackReason: `Provider request failed: ${response.response.status}`,
          }
        }
        try {
          return {
            value: input.schema.parse(parseJsonObject(response.outputText)),
            provider: 'openai',
            model,
            providerRequestId: response.id,
            fallbackUsed: false,
            fallbackReason: '',
          }
        } catch (error) {
          return {
            value: input.fallback,
            provider: 'graphcore',
            model: `deterministic-${input.schemaName}-fallback-v1`,
            providerRequestId: response.id,
            fallbackUsed: true,
            fallbackReason: error instanceof Error ? error.message : 'Structured output parse failed.',
          }
        }
      },
    })
    const nextAssetState = mergeZonePoiAnalysisIntoAssetState({
      assetState: asRecord(assetMetadata.assetState ?? assetMetadata.asset_state),
      analysis,
    })
    const nextAssetMetadata = {
      ...assetMetadata,
      assetState: nextAssetState,
      asset_state: nextAssetState,
      zoneImagePoiAnalysis: analysis,
      zone_image_poi_analysis: analysis,
      zoneImagePoiAnchors: analysis.anchors,
      zone_image_poi_anchors: analysis.anchors,
    }
    const assetUpdate = await admin
      .from('output_artifacts')
      .update({ metadata: nextAssetMetadata })
      .eq('id', continuityAssetArtifact.id)
      .select(outputArtifactSelect)
      .single()
    if (assetUpdate.error || !assetUpdate.data) throw new Error(assetUpdate.error?.message ?? 'Failed to update continuity asset POI metadata.')

    let updatedPackArtifact = continuityPackArtifact
    if (continuityPackArtifact) {
      const assetStateByNodeId = {
        ...asRecord(continuityPack.assetStateByNodeId ?? continuityPack.asset_state_by_node_id),
        [payload.zoneNodeId]: nextAssetState,
      }
      const nextPack = {
        ...continuityPack,
        assetStateByNodeId,
        asset_state_by_node_id: assetStateByNodeId,
      }
      const packUpdate = await admin
        .from('output_artifacts')
        .update({
          metadata: {
            ...continuityPackMetadata,
            continuityPack: nextPack,
            continuity_pack: nextPack,
            assetStateByNodeId,
            asset_state_by_node_id: assetStateByNodeId,
          },
        })
        .eq('id', continuityPackArtifact.id)
        .select(outputArtifactSelect)
        .single()
      if (packUpdate.error || !packUpdate.data) throw new Error(packUpdate.error?.message ?? 'Failed to update continuity pack POI metadata.')
      updatedPackArtifact = mapOutputArtifactRow(packUpdate.data as never)
    }

    return json(sequenceAnimaticZonePoiAnalyzeResponseSchema.parse({
      ok: true,
      masterRequest,
      analysis,
      assetState: nextAssetState,
      continuityPackArtifact: updatedPackArtifact,
      continuityAssetArtifact: mapOutputArtifactRow(assetUpdate.data as never),
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to analyze sequence animatic zone spot labels.')
  }
})
