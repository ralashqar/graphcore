import { buildManifestSchema, gameCommandSchema, workspaceSchema, type GameCommand } from '../domain/game/contracts'
import { supabase } from '../utils/supabase'
import { getCurrentSession } from './auth'
import { runCoalescedRequest, runLimitedRequest } from './requestCoordinator'

export async function invokeGame(name: string, body: Record<string, unknown>) {
  const session = await runCoalescedRequest({ key: 'game-auth', className: 'auth', fn: getCurrentSession })
  if (!session) throw new Error('Sign in to build games.')
  const response = await supabase.functions.invoke(name, { body, headers: { Authorization: `Bearer ${session.access_token}` } })
  if (response.error) {
    const context = response.error.context
    const detail = context instanceof Response ? await context.clone().json().catch(() => null) : null
    const error = new Error(detail?.error ?? response.error.message)
    Object.assign(error, { status: context instanceof Response ? context.status : undefined })
    throw error
  }
  return response.data
}
export function loadGameWorkspace(projectId: string, draftId: string) {
  return runCoalescedRequest({ key: `game:${draftId}`, className: 'edge-function', fn: async () => workspaceSchema.parse(await invokeGame('get-game-workspace', { projectId, draftId })) })
}
export function sendGameCommand(command: GameCommand) {
  return runLimitedRequest({ className: 'mutation', resourceKey: `game:${command.draftId}`, fn: async () => {
    const session = await getCurrentSession()
    if (!session) throw new Error('Sign in to build games.')
    const key = `graphcore.game.pending.${session.user.id}.${command.projectId}.${command.draftId}`
    const parsed = gameCommandSchema.parse(command)
    localStorage.setItem(key, JSON.stringify(parsed))
    try {
      const result = await invokeGame('game-command', parsed) as { revision: number; jobId: string | null; reservedCredits: number }
      localStorage.removeItem(key); return result
    } catch (error) {
      const status = (error as Error & { status?: number }).status
      if (status && status >= 400 && status < 500) localStorage.removeItem(key)
      throw error
    }
  } })
}
export async function pendingGameCommand(projectId: string, draftId: string) {
  const session = await getCurrentSession()
  if (!session) return null
  try { const value = JSON.parse(localStorage.getItem(`graphcore.game.pending.${session.user.id}.${projectId}.${draftId}`) ?? 'null'); const parsed = gameCommandSchema.safeParse(value); return parsed.success ? parsed.data : null } catch { return null }
}
export function loadGameBuild(projectId: string, draftId: string, buildId: string) {
  return runCoalescedRequest({ key: `game-build:${buildId}`, className: 'edge-function', fn: async () => {
    const response = await invokeGame('get-game-workspace', { projectId, draftId, buildId })
    return { manifest: buildManifestSchema.parse(response.manifest), assetUrls: response.assetUrls as Record<string, string> }
  } })
}
