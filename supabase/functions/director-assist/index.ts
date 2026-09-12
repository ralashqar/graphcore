// Director's assistant: rewrites rough direction into an H3-ready shot direction, or suggests the next take.
// Read-only with respect to the session (no settings/direction mutation, no credits); it appends an
// `assistant` message to the conversation log and records text usage through the shared gateway.
import { directorAssistRequestSchema, directorAssistResponseSchema } from '../../../src/domain/directorWorkspace.ts'
import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { runTrackedOpenAiResponses } from '../_shared/ai-provider-gateway.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { reasoningPayloadFor, resolveOutputTextModelPolicy } from '../_shared/model-policy.ts'
import { insertDirectorMessage } from '../_shared/director-messages.ts'

const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const text = (v: unknown) => typeof v === 'string' ? v.trim() : ''

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['direction', 'notes'],
  properties: {
    direction: { type: 'string', description: 'The rewritten or proposed take direction, at most 600 characters.' },
    notes: { type: 'array', maxItems: 3, items: { type: 'string' }, description: 'Up to three short craft notes for the director.' },
  },
}

function parseJsonObject(value: string) {
  try {
    return record(JSON.parse(value))
  } catch {
    const start = value.indexOf('{'), end = value.lastIndexOf('}')
    return start >= 0 && end > start ? record(JSON.parse(value.slice(start, end + 1))) : {}
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'director-assist')
    const input = directorAssistRequestSchema.parse(await request.json())
    const session = await client.from('director_sessions').select('id,title,source,direction,entity_keys,settings').eq('id', input.sessionId).eq('draft_id', input.draftId).eq('project_id', input.projectId).single()
    if (session.error || !session.data) throw new HttpError(404, 'Director session not found.')
    const admin = createAdminClient('director-assist')
    const keys = input.entityKeys ?? (Array.isArray(session.data.entity_keys) ? session.data.entity_keys as string[] : [])
    const [entities, draft, recent] = await Promise.all([
      keys.length ? admin.from('world_entities').select('key,name,summary,metadata').eq('draft_id', input.draftId).in('key', keys) : Promise.resolve({ data: [], error: null }),
      admin.from('project_drafts').select('metadata').eq('id', input.draftId).single(),
      admin.from('director_messages').select('role,text').eq('session_id', input.sessionId).order('created_at', { ascending: false }).limit(8),
    ])
    if (entities.error) throw entities.error
    if (draft.error) throw draft.error
    const wiki = record(record(draft.data.metadata).worldWiki)
    const settings = input.settings ?? record(session.data.settings)
    const cast = (entities.data ?? []).map((e) => {
      const metadata = record(e.metadata)
      const visual = text(record(metadata.visual).description) || text(metadata.visualDescription)
      return `- ${e.name}: ${visual || text(e.summary) || 'no visual description'}`
    })
    const script = text(record(session.data.source).script).slice(0, 4000)
    const direction = text(input.direction) || text(session.data.direction)
    const history = (recent.data ?? []).reverse().map((m) => `${m.role}: ${String(m.text).slice(0, 300)}`).join('\n')
    const policy = resolveOutputTextModelPolicy('utility_prompt')
    const seconds = Math.max(5, Math.ceil(Number(record(settings).durationSeconds) || 5))
    const instructions = [
      'You are a film director’s assistant for single-take AI video generation (MiniMax H3 Max via fal).',
      'Write direction for ONE continuous take of the given length. Be concrete about blocking, camera (framing, movement), performance beats, pacing and a sound cue.',
      'Use only the named cast and the scene; never invent new characters or dialogue that contradicts the script. Keep spoken lines short and quoted.',
      'Do not mention reference sheets, panels, text overlays, or model settings. Output plain prose, ≤ 600 characters, no markdown.',
      'Return only JSON matching the schema.',
    ].join(' ')
    const task = input.intent === 'suggest'
      ? `Propose the NEXT take after the current one: what should the next ${seconds}-second shot be so the scene progresses? Put the proposal in "direction".`
      : `Rewrite the director’s rough direction into a tight, shootable direction for a ${seconds}-second take. Preserve their intent and any scripted dialogue.`
    const prompt = [
      `Art direction: ${text(wiki.artStyleDescription) || 'project art style'}`,
      cast.length ? `Cast in this take:\n${cast.join('\n')}` : 'Cast: none selected.',
      script ? `Scene / script:\n${script}` : 'Scene: no script; the direction carries the scene.',
      `Mode: ${text(record(settings).mode) === 'explore' ? 'explore the scene freely' : 'follow the script'}. Aspect: ${text(record(settings).aspectRatio) || '16:9'}. Length: ${seconds}s.`,
      history ? `Recent conversation:\n${history}` : '',
      `Director’s rough direction:\n${direction || '(empty)'}`,
      task,
    ].filter(Boolean).join('\n\n')
    const response = await runTrackedOpenAiResponses({
      client: admin as never,
      payload: {
        model: policy.model,
        instructions,
        input: prompt,
        reasoning: reasoningPayloadFor(policy),
        text: { format: { type: 'json_schema', name: 'director_assist', schema, strict: true } },
        maxOutputTokens: 700,
        metadata: { graphcore_task: 'director_assist', project_id: input.projectId, draft_id: input.draftId, session_id: input.sessionId, intent: input.intent },
        timeoutMs: 45_000,
      },
      context: {
        userId: user.id, projectId: input.projectId, draftId: input.draftId, surface: 'director-assist',
        idempotencyKey: `director-assist:${input.sessionId}:${Date.now()}`, metadata: { intent: input.intent },
      },
    })
    if (!response.response.ok) throw new HttpError(502, 'The assistant could not answer right now.')
    const parsed = parseJsonObject(response.outputText)
    const result = directorAssistResponseSchema.parse({
      direction: text(parsed.direction).slice(0, 600),
      notes: Array.isArray(parsed.notes) ? parsed.notes.map(text).filter(Boolean).slice(0, 3) : [],
      messageId: null,
    })
    if (!result.direction) throw new HttpError(502, 'The assistant returned no direction.')
    const message = input.intent === 'suggest'
      ? `Next take idea: ${result.direction}${result.notes.length ? `\n${result.notes.map((n) => `• ${n}`).join('\n')}` : ''}`
      : `Polished direction: ${result.direction}${result.notes.length ? `\n${result.notes.map((n) => `• ${n}`).join('\n')}` : ''}`
    await insertDirectorMessage(admin as never, input.sessionId, 'assistant', message)
    return json(result)
  } catch (error) {
    return errorResponse(error, 'Director assistant failed.')
  }
})
