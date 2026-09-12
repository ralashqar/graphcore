// Outcome messages for the Director conversation log.
// Both take executors (legacy output-workflow handler and the isolated runtime) call these so the
// direction panel shows what happened to a take, not only what the user typed. Inserts are best
// effort: a failed message write must never fail or retry a paid generation.

type MessageClient = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>
  }
}

export type DirectorMessageRole = 'user' | 'assistant' | 'system'

export async function insertDirectorMessage(client: MessageClient, sessionId: string, role: DirectorMessageRole, text: string) {
  const trimmed = text.trim().slice(0, 2000)
  if (!sessionId || !trimmed) return false
  try {
    const result = await client.from('director_messages').insert({ session_id: sessionId, role, text: trimmed })
    if (result.error) {
      console.warn(JSON.stringify({ event: 'director_message_insert_failed', sessionId, role, error: result.error.message }))
      return false
    }
    return true
  } catch (error) {
    console.warn(JSON.stringify({ event: 'director_message_insert_failed', sessionId, role, error: String(error) }))
    return false
  }
}

export function takeCompletedMessage(input: { durationSeconds?: number | null; estimatedCostUsd?: number | null; model?: string | null; branch?: 'frame' | 'motion' | null }) {
  const parts = ['Take saved']
  if (typeof input.durationSeconds === 'number' && Number.isFinite(input.durationSeconds)) parts.push(`${input.durationSeconds.toFixed(1)} s`)
  if (typeof input.estimatedCostUsd === 'number' && Number.isFinite(input.estimatedCostUsd)) parts.push(`$${input.estimatedCostUsd.toFixed(2)} est.`)
  if (input.model) parts.push(input.model.includes('turbo') ? 'H3 Max Turbo' : 'H3 Max')
  if (input.branch === 'frame') parts.push('continued from frame')
  if (input.branch === 'motion') parts.push('continued with motion')
  return parts.join(' · ')
}

export function takeFailedMessage(error: unknown) {
  const text = String(error instanceof Error ? error.message : error).replace(/\s+/g, ' ').trim()
  return `Take failed: ${text.slice(0, 400) || 'unknown error'}`
}

export function takeAttentionMessage(reason: string) {
  return `Take needs recovery: ${reason.replace(/\s+/g, ' ').trim().slice(0, 400)}`
}
