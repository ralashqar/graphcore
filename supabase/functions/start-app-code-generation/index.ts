import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  appGenerationJobSelect,
  appGenerationStepSelect,
  appGenerationStartRequestSchema,
  appGenerationStatusResponseSchema,
  evaluateAppPreviewReadiness,
  mapAppGenerationJobRow,
  mapWorldEntityRow,
  mapWorldRelationshipRow,
  type AppGenerationJobRow,
  type AppGenerationStepRow,
  type WorldEntityRow,
  type WorldRelationshipRow,
} from '../_shared/app-generation.ts'

const APP_NODE_TYPES = [
  'app',
  'persona',
  'business_goal',
  'feature',
  'user_flow',
  'screen',
  'section',
  'component',
  'data_model',
  'action',
  'api_endpoint',
  'backend_function',
  'external_service',
  'design_system',
  'capability',
  'screen_mockup',
  'image_region',
  'animation_spec',
  'tower',
  'code_file',
  'player_profile',
  'player_initial_config',
  'player_stat',
  'inventory',
  'inventory_item',
  'currency',
  'shadow_token',
  'location_spot',
  'travel_link',
  'marketplace',
  'trade_offer',
  'quest',
  'quest_step',
  'narrative_arc',
  'narrative_scene',
  'dialogue_node',
  'choice',
  'choice_condition',
  'choice_outcome',
  'state_variable',
  'game_rule',
  'encounter',
  'save_state',
]

const STEP_DEFINITIONS = [
  ['graph_readiness', 'Check App Graph readiness'],
  ['shared_contracts', 'Generate shared contracts and adapters'],
  ['tower_files', 'Generate tower-owned Expo files'],
  ['sandbox_preview', 'Create sandbox preview shell'],
] as const

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client, user } = await requireUserClient(request, 'start-app-code-generation')
    const payload = appGenerationStartRequestSchema.parse(await request.json())

    const draftResponse = await client
      .from('project_drafts')
      .select('id, project_id, metadata')
      .eq('id', payload.draftId)
      .eq('project_id', payload.projectId)
      .single()
    if (draftResponse.error || !draftResponse.data) throw new HttpError(404, 'Draft not found or not editable.')

    const entityResponse = await client
      .from('world_entities')
      .select('id, key, name, summary, context, node_type, aliases, tags, status, thumbnail_asset_key, linked_definition_key, source, custom_properties, metadata, created_at, updated_at')
      .eq('draft_id', payload.draftId)
      .in('node_type', APP_NODE_TYPES)
    if (entityResponse.error) throw new Error(entityResponse.error.message)

    const entities = ((entityResponse.data ?? []) as WorldEntityRow[]).map(mapWorldEntityRow)
    const relationshipResponse = await client
      .from('world_relationships')
      .select('id, key, source_entity_id, target_entity_id, verb, direction, strength, confidence, source, notes, state, metadata, created_at, updated_at')
      .eq('draft_id', payload.draftId)
    if (relationshipResponse.error) throw new Error(relationshipResponse.error.message)
    const relationships = ((relationshipResponse.data ?? []) as WorldRelationshipRow[]).map((row) => mapWorldRelationshipRow(row, entities))
    if (entities.filter((entity) => entity.nodeType === 'app' || entity.nodeType === 'screen').length === 0) {
      throw new HttpError(400, 'Build Preview App requires an app graph with at least one app node or screen node.')
    }

    const readiness = evaluateAppPreviewReadiness({
      draftMetadata: draftResponse.data.metadata ?? {},
      entities,
      relationships,
    })
    if (!readiness.gates.implementation_plan_ready) {
      throw new HttpError(400, 'Build Preview App requires an approved visual prototype plus tower and code_file implementation plan nodes.')
    }
    const now = new Date().toISOString()

    const insertJobResponse = await client
      .from('app_generation_jobs')
      .insert({
        project_id: payload.projectId,
        draft_id: payload.draftId,
        requested_by: user.id,
        status: 'queued',
        kind: payload.kind,
        target_gate: payload.targetGate,
        input: {
          ...payload.input,
          readiness,
          graphNodeCount: entities.length,
          graphRelationshipCount: relationships.length,
        },
        metadata: {
          ...payload.metadata,
          runtime: 'fly_worker_sandbox',
          startedBy: 'start-app-code-generation',
          queuedAt: now,
        },
        attempt_count: 0,
        heartbeat_at: now,
      })
      .select(appGenerationJobSelect)
      .single()
    if (insertJobResponse.error || !insertJobResponse.data) throw new Error(insertJobResponse.error?.message ?? 'Failed to create app generation job.')

    const jobRow = insertJobResponse.data as AppGenerationJobRow
    const stepInsertResponse = await client
      .from('app_generation_job_steps')
      .insert(STEP_DEFINITIONS.map(([stepKey, label]) => ({
        job_id: jobRow.id,
        status: 'queued',
        step_key: stepKey,
        label,
        metadata: stepKey === 'graph_readiness' ? { readiness } : {},
      })))
      .select(appGenerationStepSelect)
    if (stepInsertResponse.error) throw new Error(stepInsertResponse.error.message)

    const job = mapAppGenerationJobRow(
      jobRow,
      (stepInsertResponse.data ?? []) as AppGenerationStepRow[],
      [],
    )
    return json(appGenerationStatusResponseSchema.parse({
      ok: true,
      job,
      terminal: false,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to start app code generation.')
  }
})
