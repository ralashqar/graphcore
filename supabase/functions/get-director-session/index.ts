import { z } from 'zod'
import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

const inputSchema = z.object({ projectId: z.string().uuid(), draftId: z.string().uuid(), sessionId: z.string().uuid().optional(), cursor: z.string().datetime().optional(), progressOnly:z.boolean().default(false), revision:z.number().optional() })
Deno.serve(async request => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'get-director-session')
    const input = inputSchema.parse(await request.json())
    if(input.progressOnly && input.sessionId){
      const authorized=await client.from('director_sessions').select('id,revision').eq('id',input.sessionId).eq('project_id',input.projectId).eq('draft_id',input.draftId).single()
      if(authorized.error)throw new HttpError(404,'Director session not found')
      if(authorized.data.revision!==input.revision)return json({needsRefresh:true})
      const [takes,jobs,exports]=await Promise.all([
        client.from('director_takes').select('id,status,review,asset_key,duration_seconds,provider_request_id,error_message,credits_charged,credits_settled,updated_at').eq('session_id',input.sessionId).order('created_at',{ascending:false}).limit(60),
        createAdminClient('get-director-session').from('director_runtime_jobs').select('run_id,take_id,phase,error_message').eq('session_id',input.sessionId).order('created_at',{ascending:false}).limit(60),
        client.from('output_workflow_runs').select('id,status,outputs,error_message').eq('draft_id',input.draftId).contains('metadata',{directorSessionId:input.sessionId}).contains('input',{sessionId:input.sessionId}).order('created_at',{ascending:false}).limit(10),
      ])
      for(const result of [takes,jobs,exports])if(result.error)throw result.error
      return json({needsRefresh:false,takes:takes.data,jobs:jobs.data,exports:exports.data})
    }
    const sessions = await client.from('director_sessions').select('*').eq('project_id', input.projectId).eq('draft_id', input.draftId).order('updated_at', { ascending: false }).limit(50)
    if (sessions.error) throw sessions.error
    let session = sessions.data.find(s => s.id === input.sessionId) ?? (!input.sessionId ? sessions.data[0] : null) ?? null
    if (input.sessionId && !session) {
      const selected = await client.from('director_sessions').select('*').eq('id', input.sessionId).eq('project_id', input.projectId).eq('draft_id', input.draftId).maybeSingle()
      if (selected.error) throw selected.error
      session = selected.data
      if (session) sessions.data.push(session)
    }
    if (input.sessionId && !session) throw new HttpError(404, 'Director session not found.')
    if (!session) return json({ sessions: sessions.data, session: null, takes: [], edits: [], messages: [], exports: [], nextCursor: null })
    let takeQuery = client.from('director_takes').select('*').eq('session_id', session.id).order('created_at', { ascending: false }).limit(51)
    if (input.cursor) takeQuery = takeQuery.lt('created_at', input.cursor)
    const results = await Promise.all([
      takeQuery,
      input.progressOnly ? Promise.resolve({data:[],error:null}) : client.from('director_edits').select('*').eq('session_id', session.id).order('created_at', { ascending: true }),
      input.progressOnly ? Promise.resolve({data:[],error:null}) : client.from('director_messages').select('*').eq('session_id', session.id).order('created_at', { ascending: false }).limit(100),
      client.from('output_workflow_runs').select('id,status,outputs,error_message').eq('draft_id', input.draftId).contains('metadata', { directorSessionId: session.id }).contains('input', { sessionId: session.id }).order('created_at', { ascending: false }).limit(10),
    ])
    for (const result of results) if (result.error) throw result.error
    const takes = results[0].data!.slice(0, 50)
    for (const take of takes) {
      if (take.status === 'generating' && !take.run_id && Date.parse(take.created_at) + 120000 < Date.now()) {
        take.status = 'failed'; take.error_message = 'Live session ended. Recover locally recorded footage from Live Director.'
      }
    }
    const cursor = results[0].data!.length > 50 ? takes.at(-1)!.created_at : null
    const activeEdit = results[1].data!.find(e => e.id === session.active_edit_id)
    const requiredIds = (Array.isArray(activeEdit?.clips) ? activeEdit.clips : []).map((c: { takeId: string }) => c.takeId).filter((id: string) => !takes.some(t => t.id === id))
    if (requiredIds.length) {
      const saved = await client.from('director_takes').select('*').eq('session_id', session.id).in('id', requiredIds)
      if (saved.error) throw saved.error
      takes.push(...saved.data)
    }
    // A workflow can fail before its take handler starts; project this terminal state without mutating reads.
    const runIds = takes.filter(t => t.run_id && !['completed','failed','cancelled'].includes(t.status)).map(t => t.run_id)
    if (runIds.length) {
      const runs = await client.from('output_workflow_runs').select('id,status,error_message').in('id', runIds)
      if (runs.error) throw runs.error
      for (const take of takes) {
        const run = runs.data.find(r => r.id === take.run_id)
        if (run && ['failed','cancelled'].includes(run.status)) { take.status = run.status; take.error_message = run.error_message }
      }
    }
    // Session membership was checked by the RLS client above. Return only public progress fields.
    const jobs = await createAdminClient('get-director-session').from('director_runtime_jobs').select('run_id,take_id,phase,error_message').eq('session_id',session.id).order('created_at',{ascending:false}).limit(60)
    if (jobs.error) throw jobs.error
    return json({ sessions: sessions.data, session, takes, edits: results[1].data, messages: results[2].data!.reverse(), exports: results[3].data, nextCursor: cursor, jobs: jobs.data })
  } catch (error) { return errorResponse(error, 'Could not load Director.') }
})
