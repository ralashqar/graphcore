import { invokeGame } from './gameRepository'
import { getCurrentSession } from './auth'
import { commandSchema, type Command } from '../domain/game/v3/protocol'
import { runLimitedRequest } from './requestCoordinator'
async function key(project: string, draft: string) {
  const session = await getCurrentSession()
  if (!session) throw new Error('Sign in to generate games')
  return `graphcore.unified.pending.${session.user.id}.${project}.${draft}`
}
export async function pendingUnified(project: string, draft: string) {
  const value = localStorage.getItem(await key(project, draft))
  return value ? commandSchema.parse(JSON.parse(value)) : null
}
export async function sendUnified(command: Command) {
  return runLimitedRequest({
    className: 'mutation',
    resourceKey: `game:${command.draftId}`,
    fn: async () => {
      const c = commandSchema.parse(command),
        k = await key(c.projectId, c.draftId)
      localStorage.setItem(k, JSON.stringify(c))
      try {
        const result = await invokeGame('game-command', c)
        localStorage.removeItem(k)
        return result
      } catch (error) {
        const status = (error as Error & { status?: number }).status
        if (status && status >= 400 && status < 500) localStorage.removeItem(k)
        throw error
      }
    },
  })
}
