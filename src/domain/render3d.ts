import type { DefinitionBase } from './graphcore'

export type DefinitionComponentType = DefinitionBase['components'][number]['type']
export type CharacterProfileComponent = Extract<DefinitionBase['components'][number], { type: 'character_profile' }>
export type Render3dBindingComponent = Extract<DefinitionBase['components'][number], { type: 'render_3d_binding' }>
export type Render3dBindingConfig = Render3dBindingComponent['config']

export const defaultRender3dBindingConfig: Render3dBindingConfig = {
  primaryMeshAssetKey: null,
  previewImageAssetKey: null,
  generationPrompt: null,
  generationStyle: null,
}

export function getDefinitionComponent<TType extends DefinitionComponentType>(
  definition: DefinitionBase,
  type: TType,
) {
  return definition.components.find((component) => component.type === type) as Extract<DefinitionBase['components'][number], { type: TType }> | undefined
}

export function getCharacterProfile(definition: DefinitionBase) {
  return getDefinitionComponent(definition, 'character_profile') as CharacterProfileComponent | undefined
}

export function getRender3dBinding(definition: DefinitionBase) {
  return getDefinitionComponent(definition, 'render_3d_binding') as Render3dBindingComponent | undefined
}

export function getResolvedRender3dBinding(definition: DefinitionBase): Render3dBindingConfig {
  return {
    ...defaultRender3dBindingConfig,
    ...(getRender3dBinding(definition)?.config ?? {}),
  }
}

export function ensureRender3dBindingComponent(components: DefinitionBase['components']) {
  if (components.some((component) => component.type === 'render_3d_binding')) return components
  return [...components, { type: 'render_3d_binding', config: { ...defaultRender3dBindingConfig } }]
}
