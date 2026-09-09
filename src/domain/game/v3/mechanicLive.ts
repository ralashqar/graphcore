import { PERFORMANCE_RUNTIME } from './poseSequence.ts'
import { MOTION_RUNTIME } from './motionPresentation.ts'
import { ACTION_RUNTIME } from './actionMechanics.ts'
import { hashGameValue } from '../compiler.ts'
import { type Manifest, manifestSchema } from './spec.ts'
import { MECHANIC_RUNTIME } from './mechanics.ts'

export async function assertMechanicReplacement(
  current: Manifest,
  raw: unknown,
) {
  const next = manifestSchema.parse(raw)
  if (
    (next.design.mechanics && next.runtimeVersion !== MECHANIC_RUNTIME && next.runtimeVersion !== ACTION_RUNTIME && next.runtimeVersion !== MOTION_RUNTIME && next.runtimeVersion !== PERFORMANCE_RUNTIME) ||
    (!next.design.mechanics && !current.design.mechanics) ||
    next.projectId !== current.projectId || next.draftId !== current.draftId ||
    next.id === current.id
  ) throw new Error('Incompatible creator build identity')
  const stable = (m: Manifest) => {
    const { mechanics: _mechanics, ...design } = m.design
    return { design, assets: m.assets, animations: m.animations ?? null }
  }
  if (
    await hashGameValue(stable(current)) !== await hashGameValue(stable(next))
  ) {
    throw new Error(
      'Live application supports mechanic changes only. Geometry, rigs, assets and other systems require restarting the preview.',
    )
  }
  return next
}
