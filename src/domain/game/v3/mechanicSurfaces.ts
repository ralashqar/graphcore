import type { Vec, World } from '../v2/spec.ts'
import type { SurfaceContact, SurfaceProfile } from './mechanics.ts'

/** Supported authored planar box faces; returned geometry is re-evaluated each tick. */
export function queryMechanicSurfaces(
  world: World,
  profiles: SurfaceProfile[],
  position: Vec,
  radius: number,
  height: number,
): SurfaceContact[] {
  return profiles.flatMap((profile) => {
    const box = world.boxes.find((b) => b.id === profile.collider)
    if (!box || box.ramp) return []
    const axis = profile.face[0] as 'x' | 'z',
      other = axis === 'x' ? 'z' : 'x',
      sign = profile.face[1] === '+' ? 1 : -1
    const plane = box.position[axis] + sign * box.size[axis] / 2
    const distance = (position[axis] - plane) * sign - radius
    if (
      distance < -.02 ||
      Math.abs(position[other] - box.position[other]) >
        box.size[other] / 2 - radius ||
      position.y + height * .7 > box.position.y + box.size.y / 2 ||
      position.y + height * .3 < box.position.y - box.size.y / 2
    ) return []
    const normal = {
      x: axis === 'x' ? sign : 0,
      y: 0,
      z: axis === 'z' ? sign : 0,
    }
    return [{
      surface: profile.id,
      collider: box.id,
      point: { ...position, [axis]: plane, y: position.y + height * .5 },
      normal,
      tangent: { x: normal.z, y: 0, z: -normal.x },
      distance,
    }]
  }).sort((a, b) =>
    a.distance - b.distance || a.surface.localeCompare(b.surface)
  )
}
