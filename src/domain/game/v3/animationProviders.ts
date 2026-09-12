import { type MotionRecipe, motionRecipeSchema, ANIMATION_VERSION } from './animation.ts'
import { kimodoRelease, sourceMotionSchema, validateKimodoConstraints } from './animationTransport.ts'
import { motionbricksRelease } from './motionbricksRelease.ts'

// This catalog proposes work only. Neither resolving a capability nor planning
// a recipe makes a provider request or reserves money.
export const animationProviders = Object.freeze({
  kimodo: { label: 'Kimodo', release: kimodoRelease, states: ['idle', 'walk', 'run', 'backward', 'strafe_left', 'strafe_right'], prefix: 'GAME_ANIMATION' },
  motionbricks: { label: 'MotionBricks · experimental', release: motionbricksRelease, states: ['idle', 'walk'], prefix: 'GAME_MOTIONBRICKS' },
})
export function animationProvider(recipe: MotionRecipe) {
  return recipe.version === 2 ? animationProviders.motionbricks : animationProviders.kimodo
}
export function validateProviderRecipe(recipe: MotionRecipe) {
  motionRecipeSchema.parse(recipe)
  if (recipe.version === 1) validateKimodoConstraints(recipe)
}
export function decodeProviderMotion(recipe: MotionRecipe, raw: unknown) {
  const source = sourceMotionSchema.parse(raw)
  if (source.version !== recipe.version || source.model !== recipe.model || source.seed !== recipe.seed || source.frames.length !== Math.round(recipe.duration * 30)) throw new Error('Provider returned incompatible motion provenance, seed or duration')
  if (source.version === 2 && source.space !== 'g1') throw new Error('MotionBricks inference must return native G1 motion')
  return source
}
export function providerRequest(recipe: MotionRecipe) {
  validateProviderRecipe(recipe)
  // Retargeting is CPU work; the immutable native request remains compatible
  // with the deployed inference image and can be reused by newer CPU adapters.
  if (recipe.version === 2) {
    const { retargetRevision: _cpuRevision, ...nativeRecipe } = recipe
    return { version: 2 as const, recipe: nativeRecipe, modelRevision: motionbricksRelease.model }
  }
  const {retargetRevision:_cpuRevision,targetFullBody:_targetPoses,...nativeRecipe}=recipe
  return { version: 1 as const, recipe:nativeRecipe, modelRevision: kimodoRelease.model }
}
export function motionbricksRecipe(recipe: MotionRecipe): MotionRecipe {
  if (!['idle', 'walk'].includes(recipe.state)) throw new Error('MotionBricks has no accepted capability for this state')
  return motionRecipeSchema.parse({ ...recipe, version: 2, provider: 'motionbricks', model: 'MotionBricks-G1-v1', purpose: 'clip', primitive: recipe.state, retargetRevision: 'g1-humanoid-1.2.0',
    provenance: { provider: 'motionbricks', modelRevision: motionbricksRelease.model, sourceRevision: motionbricksRelease.source, skeleton: 'g1skel34', adapter: motionbricksRelease.adapter, validation: ANIMATION_VERSION },
  })
}
