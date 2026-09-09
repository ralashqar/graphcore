import { createCombatPlayer } from './combatRenderer'
import { UnifiedSimulation } from '../domain/game/v3/simulation'
import { runtimeDesign } from '../domain/game/v3/compiler'
import { type Manifest, of } from '../domain/game/v3/spec'
import { IMPLEMENTATION } from '../domain/game/v2/spec'
import { initPhysics } from '../domain/game/v2/physics'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { animationVisuals } from './animationRenderer'
import { assertMechanicReplacement } from '../domain/game/v3/mechanicLive'

export async function createUnifiedPlayer(
  canvas: HTMLCanvasElement,
  manifest: Manifest,
  onUpdate: (text: string, detail: string) => void,
  assetUrls: Record<string, string> = {},
) {
  await initPhysics()
  return createCombatPlayer(
    canvas,
    {
      ...manifest,
      schemaVersion: 2,
      runtimeVersion: IMPLEMENTATION,
      templateVersion: 'combat_traversal.v1',
      physicsVersion: '0.17.3',
      design: runtimeDesign(manifest.design),
      assets: [],
    },
    onUpdate,
    {
      create: () => new UnifiedSimulation(manifest.design, manifest.id),
      replaceMechanics: async (sim,value) => {
        const next=await assertMechanicReplacement(manifest,value)
        ;(sim as UnifiedSimulation).applyMechanics(next.design,next.id)
        manifest=next
      },
      visuals: scene => animationVisuals(scene, manifest, assetUrls),
      summary: (sim) => (sim as UnifiedSimulation).summary(),
      hint: (sim) => (sim as UnifiedSimulation).hint(),
      decorate: (scene, getSim) => {
        const mat = new StandardMaterial('quest-items', scene)
        mat.diffuseColor = Color3.FromHexString('#E5C177')
        const meshes = of(manifest.design, 'pickup').map((p) => {
          const mesh = CreateBox(p.id, { size: 0.35 }, scene)
          mesh.position.set(p.position.x, p.position.y + 0.35, p.position.z)
          mesh.material = mat
          return { mesh, id: p.id }
        })
        for (const r of of(manifest.design, 'region')) {
          const mesh = CreateCylinder(
            r.id,
            { diameter: r.radius * 2, height: 0.025 },
            scene,
          )
          mesh.position.set(r.position.x, r.position.y + 0.02, r.position.z)
          mesh.material = mat
        }
        return () => {
          const sim = getSim() as UnifiedSimulation
          meshes.forEach(({ mesh, id }) =>
            mesh.setEnabled(!sim.state.mission.pickups.includes(id)),
          )
        }
      },
    },
  )
}
