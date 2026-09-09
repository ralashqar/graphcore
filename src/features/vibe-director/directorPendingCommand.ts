import { type DirectorCommand, directorCommandSchema } from '../../domain/directorWorkspace.ts'
export function pendingCommandKey(projectId: string, draftId: string, userId: string) {
  return `director.pending.v2:${userId}:${projectId}:${draftId}`
}
export function readPendingCommand(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  key: string,
): DirectorCommand | null {
  const value = storage.getItem(key)
  if (!value) return null
  try {
    return directorCommandSchema.parse(JSON.parse(value))
  } catch {
    storage.removeItem(key)
    return null
  }
}
export function savePendingCommand(storage: Pick<Storage, 'setItem'>, key: string, command: DirectorCommand) {
  // Persistence must succeed before dispatching a paid action.
  storage.setItem(key, JSON.stringify(directorCommandSchema.parse(command)))
}
