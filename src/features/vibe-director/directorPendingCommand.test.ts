import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pendingCommandKey, readPendingCommand, savePendingCommand } from './directorPendingCommand.ts'
test('a lost acknowledgement survives reload with the exact command ID and direction', () => {
  const data = new Map<string, string>(),
    storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value)
      },
      removeItem: (key: string) => {
        data.delete(key)
      },
    }
  const key = pendingCommandKey('project', 'draft', 'actor')
  const command = {
    action: 'generate' as const,
    projectId: crypto.randomUUID(),
    draftId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    expectedRevision: 2,
    direction: 'Push in slowly',
    branchMode: 'frame' as const,
  }
  savePendingCommand(storage, key, command)
  assert.deepEqual(readPendingCommand(storage, key), command)
  assert.equal(readPendingCommand(storage, pendingCommandKey('project', 'draft', 'another-user')), null)
})
test('a corrupt browser entry cannot dispatch an unvalidated command', () => {
  let value = '{invalid'
  const storage = {
    getItem: () => value,
    removeItem: () => {
      value = ''
    },
  }
  assert.equal(readPendingCommand(storage, 'key'), null)
  assert.equal(value, '')
})
