import { z } from 'zod'
import { vectorSchema, type GameBuildManifest, type GameDesignSpec, type Vector } from './contracts.ts'

export const gameSaveSchema = z.object({
  version: z.literal(1), buildId: z.string().uuid(), position: vectorSchema,
  stamina: z.number().min(0).max(100), items: z.record(z.string(), z.number().int().nonnegative()),
  picked: z.array(z.string()), doorOpen: z.boolean(), complete: z.boolean(),
}).strict()
export type GameState = z.infer<typeof gameSaveSchema>
export type GameplayEvent = { system: string; type: string; message: string }
export function initialGameState(manifest: GameBuildManifest): GameState {
  return { version: 1, buildId: manifest.id, position: { ...manifest.design.level.spawn }, stamina: 100, items: {}, picked: [], doorOpen: false, complete: false }
}
export function distance(a: Vector, b: Vector) { return Math.hypot(a.x - b.x, a.z - b.z) }
export function blockedAt(d: GameDesignSpec, state: GameState, x: number, z: number, clearance = 0) {
  const radius = .38 + clearance
  if (Math.abs(x) > d.level.width / 2 - radius || Math.abs(z) > d.level.depth / 2 - radius) return true
  return d.level.instances.some(i => {
    const p = d.prefabs.find(p => p.key === i.prefabKey)
    if (!p || p.collider === 'none' || (p.role === 'door' && state.doorOpen)) return false
    return Math.abs(x - i.position.x) < p.size.x / 2 + radius && Math.abs(z - i.position.z) < p.size.z / 2 + radius
  })
}
export function movePlayer(d: GameDesignSpec, state: GameState, input: { x: number; z: number; sprint: boolean }, dt: number): GameState {
  const next = structuredClone(state), elapsed = Math.min(Math.max(dt, 0), 1 / 15)
  const length = Math.hypot(input.x, input.z)
  const sprint = input.sprint && next.stamina > 0 && length > 0
  const speed = sprint ? d.movement.sprintSpeed : d.movement.walkSpeed
  next.stamina = Math.max(0, Math.min(100, next.stamina + elapsed * (sprint ? -d.movement.staminaDrain : d.movement.staminaRecovery)))
  if (length > 0) {
    const dx = input.x / Math.max(1, length) * speed * elapsed, dz = input.z / Math.max(1, length) * speed * elapsed
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / .15))
    for (let step = 0; step < steps; step++) {
      if (!blockedAt(d, next, next.position.x + dx / steps, next.position.z)) next.position.x += dx / steps
      if (!blockedAt(d, next, next.position.x, next.position.z + dz / steps)) next.position.z += dz / steps
    }
  }
  return next
}
export function nearestInteraction(d: GameDesignSpec, state: GameState) {
  return d.level.instances.filter(i => {
    const p = d.prefabs.find(p => p.key === i.prefabKey)
    return p && ['npc', 'key', 'door', 'goal'].includes(p.role) && !state.picked.includes(i.key) && distance(state.position, i.position) <= 2
  }).sort((a, b) => distance(state.position, a.position) - distance(state.position, b.position))[0] ?? null
}
export function interact(d: GameDesignSpec, state: GameState, instanceKey: string): { state: GameState; event: GameplayEvent } {
  const next = structuredClone(state), instance = d.level.instances.find(i => i.key === instanceKey)
  const p = d.prefabs.find(p => p.key === instance?.prefabKey)
  const result = (system: string, type: string, message: string) => ({ state: next, event: { system, type, message } })
  if (!instance || !p || distance(state.position, instance.position) > 2) return result('interaction', 'rejected', 'Move closer to interact.')
  if (p.role === 'key') {
    if (state.picked.includes(instance.key)) return result('inventory', 'rejected', 'Already collected.')
    if (Object.values(state.items).reduce((n, v) => n + v, 0) >= d.inventory.capacity) return result('inventory', 'rejected', 'Inventory is full.')
    next.items[d.inventory.keyItem] = (next.items[d.inventory.keyItem] ?? 0) + 1
    next.picked.push(instance.key)
    return result('inventory', 'changed', `${p.label} collected.`)
  }
  if (p.role === 'door') {
    if (next.doorOpen) return result('quest', 'unchanged', 'The gate is open.')
    if (!(next.items[d.inventory.keyItem] > 0)) return result('quest', 'locked', 'You need the key to open this gate.')
    next.doorOpen = true
    return result('quest', 'unlocked', 'Gate unlocked. Continue to your destination.')
  }
  if (p.role === 'goal') {
    if (!next.doorOpen) return result('quest', 'locked', 'Unlock the gate before completing the objective.')
    next.complete = true
    return result('quest', 'completed', d.quest.completionText)
  }
  if (p.role === 'npc') return result('dialogue', 'spoken', next.complete ? d.dialogue.afterComplete : next.items[d.inventory.keyItem] ? d.dialogue.afterKey : d.dialogue.greeting)
  return result('interaction', 'rejected', 'Nothing to interact with.')
}
export function restoreGameState(manifest: GameBuildManifest, input: unknown): GameState {
  const state = gameSaveSchema.parse(input), d = manifest.design
  if (state.buildId !== manifest.id) throw new Error('This save belongs to another build.')
  if (blockedAt(d, state, state.position.x, state.position.z) || state.position.y !== 0) throw new Error('Save position is invalid.')
  if (Object.keys(state.items).some(k => k !== d.inventory.keyItem) || Object.values(state.items).reduce((a, b) => a + b, 0) > d.inventory.capacity) throw new Error('Invalid saved inventory.')
  if (state.picked.some(k => !d.level.instances.some(i => i.key === k && d.prefabs.find(p => p.key === i.prefabKey)?.role === 'key'))) throw new Error('Invalid pickup reference.')
  if ((state.doorOpen && !(state.items[d.inventory.keyItem] > 0)) || (state.complete && !state.doorOpen)) throw new Error('Invalid saved progression.')
  return state
}

// Navigation acceptance uses the same collision model as the runtime, not teleportation.
export function findWalkPath(d: GameDesignSpec, state: GameState, target: Vector): Vector[] | null {
  const step = .5, encode = (x: number, z: number) => `${x},${z}`
  const start = { x: Math.round(state.position.x / step), z: Math.round(state.position.z / step) }
  const queue = [start], parents = new Map<string, string | null>([[encode(start.x, start.z), null]])
  for (let n = 0; n < queue.length && n < 40000; n++) {
    const at = queue[n], k = encode(at.x, at.z), pos = { x: at.x * step, y: 0, z: at.z * step }
    if (distance(pos, target) <= 1.5) {
      const path: Vector[] = []; let current: string | null = k
      while (current) { const [x, z] = current.split(',').map(Number); path.unshift({ x: x * step, y: 0, z: z * step }); current = parents.get(current) ?? null }
      return path
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = at.x + dx, z = at.z + dz, nk = encode(x, z)
      if (!parents.has(nk) && !blockedAt(d, state, x * step, z * step, .2)) { parents.set(nk, k); queue.push({ x, z }) }
    }
  }
  return null
}
export function runGameAcceptance(manifest: GameBuildManifest) {
  const d = manifest.design, reports: { nodeKey: string; passed: boolean; message: string }[] = []
  let state = initialGameState(manifest)
  const instance = (role: string) => d.level.instances.find(i => d.prefabs.find(p => p.key === i.prefabKey)?.role === role)!
  const walk = (role: string) => {
    const target = instance(role), path = findWalkPath(d, state, target.position)
    if (!path) throw new Error(`${role} is unreachable`)
    for (const point of path) {
      for (let n = 0; n < 120 && distance(state.position, point) > .08; n++) state = movePlayer(d, state, { x: point.x - state.position.x, z: point.z - state.position.z, sprint: false }, 1 / 30)
    }
    if (distance(state.position, target.position) > 2) throw new Error(`Cannot approach ${role}`)
    return target
  }
  try {
    const door = walk('door'); const locked = interact(d, state, door.key)
    reports.push({ nodeKey: 'quest', passed: !locked.state.doorOpen, message: 'Gate rejects player without a key' })
    const pickup = walk('key'); state = interact(d, state, pickup.key).state
    const duplicate = interact(d, state, pickup.key).state
    reports.push({ nodeKey: 'inventory', passed: duplicate.items[d.inventory.keyItem] === 1, message: 'Pickup is idempotent' })
    walk('door'); state = interact(d, state, door.key).state
    const goal = walk('goal'); state = interact(d, state, goal.key).state
    reports.push({ nodeKey: 'quest', passed: state.complete, message: 'Walkable objective completion' })
    const restored = restoreGameState(manifest, JSON.parse(JSON.stringify(state)))
    reports.push({ nodeKey: 'persistence', passed: restored.complete && restored.doorOpen, message: 'Save/load preserves completion' })
  } catch (error) { reports.push({ nodeKey: 'level', passed: false, message: error instanceof Error ? error.message : String(error) }) }
  return reports
}
