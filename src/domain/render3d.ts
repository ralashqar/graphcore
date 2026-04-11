import type { DefinitionBase } from './graphcore'
import { environmentAssemblyBindingDefaults, type EnvironmentGeometryBindingConfig } from './environmentAssembly'

export type DefinitionComponentType = DefinitionBase['components'][number]['type']
export type CharacterProfileComponent = Extract<DefinitionBase['components'][number], { type: 'character_profile' }>
export type EnvironmentProfileComponent = Extract<DefinitionBase['components'][number], { type: 'environment_profile' }>
export type EnvironmentGeometryBindingComponent = Extract<DefinitionBase['components'][number], { type: 'environment_geometry_binding' }>
export type Render3dBindingComponent = Extract<DefinitionBase['components'][number], { type: 'render_3d_binding' }>
export type EnvironmentRenderBindingComponent = Extract<DefinitionBase['components'][number], { type: 'environment_render_binding' }>
export type Render3dBindingConfig = Render3dBindingComponent['config']
export type EnvironmentRenderBindingConfig = EnvironmentRenderBindingComponent['config']
export type Definition3dBindingConfig =
  Render3dBindingConfig &
  Partial<Pick<EnvironmentRenderBindingConfig, 'lightingProfile'>>

export const defaultRender3dBindingConfig: Render3dBindingConfig = {
  primaryMeshAssetKey: null,
  previewImageAssetKey: null,
  conceptPrompt: null,
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

export function getEnvironmentProfile(definition: DefinitionBase) {
  return getDefinitionComponent(definition, 'environment_profile') as EnvironmentProfileComponent | undefined
}

export function getRender3dBinding(definition: DefinitionBase) {
  return getDefinitionComponent(definition, 'render_3d_binding') as Render3dBindingComponent | undefined
}

export function getEnvironmentRenderBinding(definition: DefinitionBase) {
  return getDefinitionComponent(definition, 'environment_render_binding') as EnvironmentRenderBindingComponent | undefined
}

export function getEnvironmentGeometryBinding(definition: DefinitionBase) {
  return getDefinitionComponent(definition, 'environment_geometry_binding') as EnvironmentGeometryBindingComponent | undefined
}

export function getResolvedRender3dBinding(definition: DefinitionBase): Render3dBindingConfig {
  return {
    ...defaultRender3dBindingConfig,
    ...(getRender3dBinding(definition)?.config ?? {}),
  }
}

export function getResolvedEnvironmentGeometryBinding(definition: DefinitionBase): EnvironmentGeometryBindingConfig {
  return {
    ...environmentAssemblyBindingDefaults,
    ...(getEnvironmentGeometryBinding(definition)?.config ?? {}),
    compileSettings: {
      ...environmentAssemblyBindingDefaults.compileSettings,
      ...(getEnvironmentGeometryBinding(definition)?.config.compileSettings ?? {}),
    },
  }
}

export function getResolvedDefinition3dBinding(definition: DefinitionBase): Definition3dBindingConfig {
  if (definition.kind === 'environment') {
    return {
      ...defaultRender3dBindingConfig,
      lightingProfile: '',
      ...(getEnvironmentRenderBinding(definition)?.config ?? {}),
    }
  }

  return getResolvedRender3dBinding(definition)
}

export function ensureRender3dBindingComponent(components: DefinitionBase['components']) {
  if (components.some((component) => component.type === 'render_3d_binding')) return components
  return [...components, { type: 'render_3d_binding', config: { ...defaultRender3dBindingConfig } }]
}
