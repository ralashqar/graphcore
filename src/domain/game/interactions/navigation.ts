import type { Physics } from '../v2/physics.ts'
import type { Vec } from './spec.ts'
export function interactionPath(
  physics: Physics,
  actor: string,
  from: Vec,
  to: Vec,
  bounds: { width: number; depth: number },
): Vec[] | null {
  const step = 0.5,
    key = (x: number, z: number) => `${x},${z}`,
    start = { x: Math.round(from.x / step), z: Math.round(from.z / step) },
    goal = { x: Math.round(to.x / step), z: Math.round(to.z / step) },
    end = key(goal.x, goal.z),
    first = key(start.x, start.z),
    open = [first],
    came = new Map<string, string>(),
    cost = new Map([[first, 0]]),
    points = new Map<string, Vec>(),
    clear = new Map<string, boolean>()
  const point = (k: string) => {
    let p = points.get(k)
    if (!p) {
      const [x, z] = k.split(',').map(Number)
      p = { x: x * step, y: 0, z: z * step }
      points.set(k, p)
    }
    return p
  }
  const heuristic = (k: string) => {
    const p = point(k)
    return Math.hypot(p.x - to.x, p.z - to.z)
  }
  while (open.length) {
    open.sort(
      (a, b) => cost.get(a)! + heuristic(a) - (cost.get(b)! + heuristic(b)),
    )
    const current = open.shift()!
    if (current === end) {
      const path = [to]
      let k = current
      while (k !== first) {
        path.push(point(k))
        k = came.get(k)!
      }
      return path.reverse()
    }
    const p = point(current)
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const q = { x: p.x + dx * step, y: 0, z: p.z + dz * step },
        k = key(Math.round(q.x / step), Math.round(q.z / step))
      if (
        Math.abs(q.x) > bounds.width / 2 - 0.5 ||
        Math.abs(q.z) > bounds.depth / 2 - 0.5
      )
        continue
      if (!clear.has(k))
        clear.set(k, physics.free(actor, q) && physics.supported(q))
      if (!clear.get(k) || !physics.actorPathClear(actor, p, q)) continue
      const next = cost.get(current)! + step
      if (next >= (cost.get(k) ?? Infinity)) continue
      cost.set(k, next)
      came.set(k, current)
      if (!open.includes(k)) open.push(k)
    }
  }
  return null
}
