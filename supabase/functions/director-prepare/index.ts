// Ensures the per-session Director preparation workflow graph (cast sheets fan-out, optional start frame,
// readiness) and returns its workflow id. The client starts the run through start-output-workflow-run so
// wake, run defaults and RLS stay identical to every other graph run.
import { buildDirectorFramePrompt } from '../../../src/domain/directorWorkspace.ts'
import {
  buildDirectorPrepGraphRows,
  directorPrepareRequestSchema,
  directorPrepareResponseSchema,
  directorPrepWorkflowKey,
  type DirectorPrepCastSpec,
} from '../../../src/domain/directorPrep.ts'
import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const text = (v: unknown) => typeof v === 'string' ? v.trim() : ''

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'director-prepare')
    const input = directorPrepareRequestSchema.parse(await request.json())
    const session = await client.from('director_sessions').select('id,title,source,direction,entity_keys,settings').eq('id', input.sessionId).eq('draft_id', input.draftId).eq('project_id', input.projectId).single()
    if (session.error || !session.data) throw new HttpError(404, 'Director session not found.')
    const admin = createAdminClient('director-prepare')
    const entityKeys = [...new Set((input.entityKeys ?? (Array.isArray(session.data.entity_keys) ? session.data.entity_keys as string[] : [])).filter(Boolean))].slice(0, 50)
    const entities = entityKeys.length
      ? await admin.from('world_entities').select('key,name,summary,metadata,thumbnail_asset_key').eq('draft_id', input.draftId).in('key', entityKeys)
      : { data: [], error: null }
    if (entities.error) throw entities.error
    const rows = (entities.data ?? []) as Array<Record<string, unknown>>
    const cast: DirectorPrepCastSpec[] = entityKeys.flatMap((key) => {
      const entity = rows.find((row) => text(row.key) === key)
      if (!entity) return []
      const metadata = record(entity.metadata)
      return [{ entityKey: key, name: text(entity.name) || key, referenceAssetKey: text(metadata.referenceSheetAssetKey) || text(entity.thumbnail_asset_key) || null, force: input.forceEntityKeys.includes(key) }]
    })
    let frame = null
    if (input.composeFrame) {
      const draft = await admin.from('project_drafts').select('metadata').eq('id', input.draftId).single()
      if (draft.error) throw draft.error
      const wiki = record(record(draft.data.metadata).worldWiki)
      const assetKey = `director_frame_${input.sessionId.slice(0, 8)}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
      frame = {
        prompt: buildDirectorFramePrompt({
          artDirection: text(wiki.artStyleDescription),
          script: text(record(session.data.source).script),
          direction: text(input.direction) || text(session.data.direction) || text(record(session.data.source).script).slice(0, 400),
          cast: cast.map((member) => {
            const entity = rows.find((row) => text(row.key) === member.entityKey)
            const metadata = record(entity?.metadata)
            return { name: member.name, visual: text(record(metadata.visual).description) || text(metadata.visualDescription) || text(entity?.summary) }
          }),
          aspectRatio: input.aspectRatio,
        }),
        aspectRatio: input.aspectRatio,
        assetKey,
        storagePath: `generated/director-frames/${input.draftId}/${assetKey}.webp`,
        referenceEntityKeys: cast.map((member) => member.entityKey).slice(0, 4),
        quality: 'medium',
      }
    }
    const workflowKey = directorPrepWorkflowKey(input.sessionId)
    const existing = await admin.from('output_workflows').select('id').eq('draft_id', input.draftId).eq('key', workflowKey).maybeSingle()
    if (existing.error) throw existing.error
    let workflowId = text(record(existing.data).id)
    if (!workflowId) {
      workflowId = crypto.randomUUID()
      const inserted = await admin.from('output_workflows').insert({
        id: workflowId, project_id: input.projectId, draft_id: input.draftId, key: workflowKey,
        name: `Director prep · ${text(session.data.title) || 'scene'}`, preset: 'cinematic_trailer', created_by: user.id,
        metadata: { directorSessionId: input.sessionId, directorPrep: true },
      })
      if (inserted.error) throw inserted.error
    }
    const graph = buildDirectorPrepGraphRows({ workflowId, draftId: input.draftId, sessionId: input.sessionId, cast, frame })
    // Preserve cached outputs of nodes whose compile hash did not change so a rerun only redoes changed work.
    const currentNodes = await admin.from('output_workflow_nodes').select('key,outputs,input_hash,output_hash,metadata').eq('workflow_id', workflowId)
    if (currentNodes.error) throw currentNodes.error
    const currentByKey = new Map(((currentNodes.data ?? []) as Array<Record<string, unknown>>).map((node) => [text(node.key), node] as const))
    const nodeRows = graph.nodes.map((row) => {
      const current = currentByKey.get(row.key)
      const sameCompile = current && text(record(current.metadata).compileHash) === text(record(row.metadata).compileHash)
      const hasOutputs = current && Object.keys(record(current.outputs)).length > 0 && record(current.outputs).waiting !== true
      return sameCompile && hasOutputs
        ? { ...row, outputs: current.outputs, input_hash: current.input_hash, output_hash: current.output_hash, dirty: false }
        : row
    })
    const nextKeys = new Set(graph.nodes.map((row) => row.key))
    const staleKeys = [...currentByKey.keys()].filter((key) => !nextKeys.has(key))
    if (staleKeys.length) {
      const removedEdges = await admin.from('output_workflow_edges').delete().eq('workflow_id', workflowId).or(`source_node_key.in.(${staleKeys.map((k) => `"${k}"`).join(',')}),target_node_key.in.(${staleKeys.map((k) => `"${k}"`).join(',')})`)
      if (removedEdges.error) throw removedEdges.error
      const removedNodes = await admin.from('output_workflow_nodes').delete().eq('workflow_id', workflowId).in('key', staleKeys)
      if (removedNodes.error) throw removedNodes.error
    }
    const upsertNodes = await admin.from('output_workflow_nodes').upsert(nodeRows, { onConflict: 'workflow_id,key' })
    if (upsertNodes.error) throw upsertNodes.error
    const currentEdges = await admin.from('output_workflow_edges').select('key').eq('workflow_id', workflowId)
    if (currentEdges.error) throw currentEdges.error
    const nextEdgeKeys = new Set(graph.edges.map((row) => row.key))
    const staleEdgeKeys = ((currentEdges.data ?? []) as Array<Record<string, unknown>>).map((edge) => text(edge.key)).filter((key) => key && !nextEdgeKeys.has(key))
    if (staleEdgeKeys.length) {
      const removed = await admin.from('output_workflow_edges').delete().eq('workflow_id', workflowId).in('key', staleEdgeKeys)
      if (removed.error) throw removed.error
    }
    const upsertEdges = await admin.from('output_workflow_edges').upsert(graph.edges, { onConflict: 'workflow_id,key' })
    if (upsertEdges.error) throw upsertEdges.error
    return json(directorPrepareResponseSchema.parse({
      workflowId,
      nodeKeys: graph.nodes.map((row) => row.key),
      sheetEntityKeys: cast.filter((member) => member.force || !member.referenceAssetKey).map((member) => member.entityKey),
      composeFrame: Boolean(frame),
      frameAssetKey: frame?.assetKey ?? null,
      nothingToDo: graph.sheetKeys.length === 0 && !frame,
    }))
  } catch (error) {
    return errorResponse(error, 'Director preparation failed.')
  }
})
