import { mechanicCommandSchema } from '../domain/game/v3/mechanicCommands'
import { invokeGame } from './gameRepository'
import { getCurrentSession } from './auth'

async function pendingKey(draft: string) {
  const session = await getCurrentSession()
  if (!session) throw new Error('Sign in to author mechanics')
  return `graphcore.mechanics.pending.${session.user.id}.${draft}`
}
export async function pendingMechanic(draft: string) {
  const value = localStorage.getItem(await pendingKey(draft))
  return value ? mechanicCommandSchema.parse(JSON.parse(value)) : null
}
export async function sendMechanic(raw: unknown) {
  const command = mechanicCommandSchema.parse(raw),
    key = await pendingKey(command.draftId)
  const old = localStorage.getItem(key)
  if (old && old !== JSON.stringify(command)) {
    throw new Error('Recover the pending mechanic command first')
  }
  localStorage.setItem(key, JSON.stringify(command))
  try {
    const result = await invokeGame('game-command', command)
    localStorage.removeItem(key)
    return result
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status && status >= 400 && status < 500) localStorage.removeItem(key)
    throw error
  }
}
