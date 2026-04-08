import type {
  ArchetypeDefinition,
  AssetDefinition,
  Diagnostic,
  DefinitionBase,
  GameSystemBundle,
  GraphDefinition,
  ProjectSnapshot,
} from './graphcore'
import { graphNodeTemplatesByKey } from './nodeLibrary'
import { PRESET_CATALOG_VERSION } from './presetCatalog'

function isLikelyReferenceKey(value: string) {
  return /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/i.test(value)
}

function getComponent<TType extends DefinitionBase['components'][number]['type']>(
  definition: DefinitionBase,
  type: TType,
) {
  return definition.components.find((component) => component.type === type) as Extract<DefinitionBase['components'][number], { type: TType }> | undefined
}

function pushDiagnostic(diagnostics: Diagnostic[], diagnostic: Diagnostic) {
  diagnostics.push(diagnostic)
}

export function compileBundle(snapshot: ProjectSnapshot): GameSystemBundle {
  const graphKeys = new Set<string>()
  const diagnostics = [
    ...validateDefinitions(snapshot.definitions, snapshot.archetypes, snapshot.assets, snapshot.graphs, snapshot.gameSpec),
    ...snapshot.graphs.flatMap((graph) => {
      const duplicateGraphKey = graphKeys.has(graph.key)
      graphKeys.add(graph.key)
      return [
        ...(duplicateGraphKey
          ? [{
              level: 'error' as const,
              code: 'duplicate_graph_key',
              message: `Duplicate graph key "${graph.key}".`,
              graphKey: graph.key,
              nodeKey: null,
            }]
          : []),
        ...validateGraph(graph, snapshot.graphs, snapshot.definitions, snapshot.assets),
      ]
    }),
  ]

  const definitionsByKind = snapshot.definitions.reduce<Record<string, string[]>>((acc, definition) => {
    acc[definition.kind] ??= []
    acc[definition.kind].push(definition.key)
    return acc
  }, {})

  const definitionsByArchetype = snapshot.definitions.reduce<Record<string, string[]>>((acc, definition) => {
    const archetypeKey = definition.archetypeKey ?? 'untyped'
    acc[archetypeKey] ??= []
    acc[archetypeKey].push(definition.key)
    return acc
  }, {})

  const archetypesByKind = snapshot.archetypes.reduce<Record<string, string[]>>((acc, archetype) => {
    acc[archetype.appliesToKind] ??= []
    acc[archetype.appliesToKind].push(archetype.key)
    return acc
  }, {})

  const graphEntryNodes = snapshot.graphs.reduce<Record<string, string | null>>((acc, graph) => {
    acc[graph.key] = graph.entryNodeKey
    return acc
  }, {})

  const assetKeysByKind = snapshot.assets.reduce<Record<string, string[]>>((acc, asset) => {
    acc[asset.kind] ??= []
    acc[asset.kind].push(asset.key)
    return acc
  }, {})

  return {
    bundleVersion: 1,
    manifest: {
      workspaceSlug: snapshot.workspace.slug,
      projectSlug: snapshot.project.slug,
      draftId: snapshot.draft.id,
      generatedAt: new Date().toISOString(),
      definitionCount: snapshot.definitions.length,
      graphCount: snapshot.graphs.length,
      archetypeCount: snapshot.archetypes.length,
      assetCount: snapshot.assets.length,
    },
    archetypes: snapshot.archetypes,
    gameSpec: snapshot.gameSpec,
    definitions: snapshot.definitions,
    graphs: snapshot.graphs,
    assets: snapshot.assets,
    lookupIndices: {
      definitionsByKind,
      definitionsByArchetype,
      archetypesByKind,
      graphEntryNodes,
      assetKeysByKind,
    },
    diagnostics,
  }
}

export function validateDefinitions(
  definitions: DefinitionBase[],
  archetypes: ArchetypeDefinition[],
  assets: AssetDefinition[],
  graphs: GraphDefinition[],
  gameSpec: ProjectSnapshot['gameSpec'],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const seenKeys = new Set<string>()
  const assetKeys = new Set(assets.map((asset) => asset.key))
  const archetypesByKey = new Map(archetypes.map((archetype) => [archetype.key, archetype]))
  const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]))
  const graphKeys = new Set(graphs.map((graph) => graph.key))
  const meshAssetKeys = new Set(assets.filter((asset) => asset.kind === 'mesh').map((asset) => asset.key))
  const imageAssetKeys = new Set(assets.filter((asset) => asset.kind === 'image').map((asset) => asset.key))

  if (gameSpec && gameSpec.presetCatalogVersion !== PRESET_CATALOG_VERSION) {
    diagnostics.push({
      level: 'warning',
      code: 'stale_preset_catalog',
      message: `Game spec expects preset catalog "${gameSpec.presetCatalogVersion}" but the editor uses "${PRESET_CATALOG_VERSION}".`,
      graphKey: null,
      nodeKey: null,
    })
  }

  for (const definition of definitions) {
    if (seenKeys.has(definition.key)) {
      diagnostics.push({
        level: 'error',
        code: 'duplicate_definition_key',
        message: `Duplicate definition key "${definition.key}".`,
        graphKey: null,
        nodeKey: null,
      })
    }

    seenKeys.add(definition.key)

    if (definition.kind === 'item' && definition.tags.includes('shadow_token') && !definition.tags.includes('hidden')) {
      diagnostics.push({
        level: 'warning',
        code: 'shadow_token_visibility',
        message: `Shadow token item "${definition.key}" should also carry the "hidden" tag.`,
        graphKey: null,
        nodeKey: null,
      })
    }

    if (definition.iconAssetKey && !assetKeys.has(definition.iconAssetKey)) {
      diagnostics.push({
        level: 'error',
        code: 'missing_definition_icon',
        message: `Definition "${definition.key}" references missing icon asset "${definition.iconAssetKey}".`,
        graphKey: null,
        nodeKey: null,
      })
    }

    if (definition.archetypeKey) {
      const archetype = archetypesByKey.get(definition.archetypeKey)

      if (!archetype) {
        diagnostics.push({
          level: 'error',
          code: 'missing_archetype',
          message: `Definition "${definition.key}" references missing archetype "${definition.archetypeKey}".`,
          graphKey: null,
          nodeKey: null,
        })
        continue
      }

      if (archetype.appliesToKind !== definition.kind) {
        diagnostics.push({
          level: 'error',
          code: 'archetype_kind_mismatch',
          message: `Definition "${definition.key}" uses archetype "${definition.archetypeKey}" for kind "${archetype.appliesToKind}".`,
          graphKey: null,
          nodeKey: null,
        })
      }

      const knownFields = new Set([
        ...archetype.fields.map((field) => field.key),
        ...definition.customFields.map((field) => field.key),
      ])

      for (const fieldValue of definition.fieldValues) {
        if (!knownFields.has(fieldValue.fieldKey)) {
          diagnostics.push({
            level: 'warning',
            code: 'unknown_field_value',
            message: `Definition "${definition.key}" has value for unknown field "${fieldValue.fieldKey}".`,
            graphKey: null,
            nodeKey: null,
          })
        }
      }
    }

    if (definition.kind === 'character') {
      const inventoryComponent = getComponent(definition, 'inventory')
      const loadoutComponent = getComponent(definition, 'ability_loadout')
      const profileComponent = getComponent(definition, 'character_profile')
      const animationBinding = getComponent(definition, 'animation_binding')
      const logicBinding = getComponent(definition, 'logic_state_machine_binding')
      const renderBinding = getComponent(definition, 'render_3d_binding')
      const controlledBy = profileComponent?.config.controlMode
        ?? (typeof definition.metadata.controlledBy === 'string' ? definition.metadata.controlledBy : null)

      if (!inventoryComponent) {
        pushDiagnostic(diagnostics, {
          level: 'warning',
          code: 'character_missing_inventory',
          message: `Character "${definition.key}" should include an inventory component.`,
          graphKey: null,
          nodeKey: null,
        })
      }

      if (!profileComponent) {
        pushDiagnostic(diagnostics, {
          level: 'warning',
          code: 'character_missing_profile',
          message: `Character "${definition.key}" should include a character profile component. Older drafts default to subtype "humanoid".`,
          graphKey: null,
          nodeKey: null,
        })
      }

      if (loadoutComponent?.type === 'ability_loadout') {
        for (const entry of loadoutComponent.config.entries) {
          const ability = definitionsByKey.get(entry.abilityKey)
          if (!ability || ability.kind !== 'ability') {
            diagnostics.push({
              level: 'error',
              code: 'missing_character_ability',
              message: `Character "${definition.key}" references missing ability "${entry.abilityKey}".`,
              graphKey: null,
              nodeKey: null,
            })
          }

          if (entry.unlockTokenKey && !definitionsByKey.has(entry.unlockTokenKey)) {
            diagnostics.push({
              level: 'error',
              code: 'missing_character_unlock_token',
              message: `Character "${definition.key}" references missing unlock token "${entry.unlockTokenKey}".`,
              graphKey: null,
              nodeKey: null,
            })
          }

          if (entry.inputBinding && controlledBy !== 'player' && !definition.tags.includes('player_controlled')) {
            diagnostics.push({
              level: 'warning',
              code: 'character_input_binding_scope',
              message: `Character "${definition.key}" uses input bindings without being marked player-controlled.`,
              graphKey: null,
              nodeKey: null,
            })
          }
        }
      }

      if (animationBinding?.type === 'animation_binding') {
        if (animationBinding.config.defaultAnimationGraphKey && !isLikelyReferenceKey(animationBinding.config.defaultAnimationGraphKey)) {
          pushDiagnostic(diagnostics, {
            level: 'warning',
            code: 'invalid_animation_graph_ref',
            message: `Character "${definition.key}" uses an invalid animation graph key "${animationBinding.config.defaultAnimationGraphKey}".`,
            graphKey: null,
            nodeKey: null,
          })
        }

        for (const animationSetKey of animationBinding.config.animationSetKeys) {
          if (!isLikelyReferenceKey(animationSetKey)) {
            pushDiagnostic(diagnostics, {
              level: 'warning',
              code: 'invalid_animation_set_ref',
              message: `Character "${definition.key}" uses an invalid animation set key "${animationSetKey}".`,
              graphKey: null,
              nodeKey: null,
            })
          }
        }
      }

      if (logicBinding?.type === 'logic_state_machine_binding') {
        if (logicBinding.config.stateMachineKey && !isLikelyReferenceKey(logicBinding.config.stateMachineKey)) {
          pushDiagnostic(diagnostics, {
            level: 'warning',
            code: 'invalid_state_machine_ref',
            message: `Character "${definition.key}" uses an invalid state machine key "${logicBinding.config.stateMachineKey}".`,
            graphKey: null,
            nodeKey: null,
          })
        }

        if (logicBinding.config.defaultStateKey && !isLikelyReferenceKey(logicBinding.config.defaultStateKey)) {
          pushDiagnostic(diagnostics, {
            level: 'warning',
            code: 'invalid_state_key_ref',
            message: `Character "${definition.key}" uses an invalid default state key "${logicBinding.config.defaultStateKey}".`,
            graphKey: null,
            nodeKey: null,
          })
        }
      }

      if (renderBinding?.type === 'render_3d_binding') {
        if (renderBinding.config.primaryMeshAssetKey && !meshAssetKeys.has(renderBinding.config.primaryMeshAssetKey)) {
          pushDiagnostic(diagnostics, {
            level: 'error',
            code: 'missing_character_mesh_asset',
            message: `Character "${definition.key}" references missing mesh asset "${renderBinding.config.primaryMeshAssetKey}".`,
            graphKey: null,
            nodeKey: null,
          })
        }

        if (renderBinding.config.previewImageAssetKey && !imageAssetKeys.has(renderBinding.config.previewImageAssetKey)) {
          pushDiagnostic(diagnostics, {
            level: 'error',
            code: 'missing_character_preview_image',
            message: `Character "${definition.key}" references missing preview image asset "${renderBinding.config.previewImageAssetKey}".`,
            graphKey: null,
            nodeKey: null,
          })
        }
      }
    }

    if (definition.kind === 'ability') {
      const profile = definition.components.find((component) => component.type === 'ability_profile')
      if (profile?.type === 'ability_profile') {
        if (profile.config.resourceCostItemKey) {
          const resource = definitionsByKey.get(profile.config.resourceCostItemKey)
          if (!resource || resource.kind !== 'item') {
            diagnostics.push({
              level: 'error',
              code: 'missing_ability_resource_item',
              message: `Ability "${definition.key}" references missing resource item "${profile.config.resourceCostItemKey}".`,
              graphKey: null,
              nodeKey: null,
            })
          }
        }
      }
    }

    if (definition.kind === 'market') {
      const inventory = definition.components.find((component) => component.type === 'market_inventory')
      if (inventory?.type === 'market_inventory') {
        for (const trade of inventory.config.trades) {
          const offerItem = definitionsByKey.get(trade.offerItemKey)
          const costItem = definitionsByKey.get(trade.costItemKey)

          if (!offerItem || offerItem.kind !== 'item') {
            diagnostics.push({
              level: 'error',
              code: 'missing_market_offer_item',
              message: `Market "${definition.key}" references missing offered item "${trade.offerItemKey}".`,
              graphKey: null,
              nodeKey: null,
            })
          }

          if (!costItem || costItem.kind !== 'item') {
            diagnostics.push({
              level: 'error',
              code: 'missing_market_cost_item',
              message: `Market "${definition.key}" references missing cost item "${trade.costItemKey}".`,
              graphKey: null,
              nodeKey: null,
            })
          }

          if (trade.unlockTokenKey && !definitionsByKey.has(trade.unlockTokenKey)) {
            diagnostics.push({
              level: 'error',
              code: 'missing_market_unlock_token',
              message: `Market "${definition.key}" references missing unlock token "${trade.unlockTokenKey}".`,
              graphKey: null,
              nodeKey: null,
            })
          }
        }
      }
    }

    if (definition.kind === 'location') {
      const locationState = getComponent(definition, 'location_state')
      if (locationState?.type === 'location_state') {
        for (const linkedGraphKey of locationState.config.linkedGraphKeys) {
          if (!graphKeys.has(linkedGraphKey)) {
            diagnostics.push({
              level: 'error',
              code: 'missing_location_graph',
              message: `Location "${definition.key}" references missing graph "${linkedGraphKey}".`,
              graphKey: null,
              nodeKey: null,
            })
          }
        }

        for (const linkedMarketKey of locationState.config.linkedMarketKeys) {
          const linkedMarket = definitionsByKey.get(linkedMarketKey)
          if (!linkedMarket || linkedMarket.kind !== 'market') {
            diagnostics.push({
              level: 'error',
              code: 'missing_location_market',
              message: `Location "${definition.key}" references missing market "${linkedMarketKey}".`,
              graphKey: null,
              nodeKey: null,
            })
          }
        }

        if (locationState.config.environmentKey) {
          const linkedEnvironment = definitionsByKey.get(locationState.config.environmentKey)
          if (!linkedEnvironment || linkedEnvironment.kind !== 'environment') {
            pushDiagnostic(diagnostics, {
              level: 'error',
              code: 'missing_location_environment',
              message: `Location "${definition.key}" references missing environment "${locationState.config.environmentKey}".`,
              graphKey: null,
              nodeKey: null,
            })
          }
        }

        if (locationState.config.unlockTokenKey && !definitionsByKey.has(locationState.config.unlockTokenKey)) {
          diagnostics.push({
            level: 'error',
            code: 'missing_location_unlock_token',
            message: `Location "${definition.key}" references missing unlock token "${locationState.config.unlockTokenKey}".`,
            graphKey: null,
            nodeKey: null,
          })
        }
      }
    }

    if (definition.kind === 'environment') {
      const profile = getComponent(definition, 'environment_profile')
      const renderBinding = getComponent(definition, 'environment_render_binding')
      const navigation = getComponent(definition, 'environment_navigation')
      const spawnRules = getComponent(definition, 'environment_spawn_rules')

      if (!profile) {
        pushDiagnostic(diagnostics, {
          level: 'warning',
          code: 'environment_missing_profile',
          message: `Environment "${definition.key}" should include an environment profile component.`,
          graphKey: null,
          nodeKey: null,
        })
      }

      if (!navigation) {
        pushDiagnostic(diagnostics, {
          level: 'warning',
          code: 'environment_missing_navigation',
          message: `Environment "${definition.key}" should include an environment navigation component.`,
          graphKey: null,
          nodeKey: null,
        })
      }

      if (profile?.type === 'environment_profile') {
        if (profile.config.worldModelKey) {
          const linkedWorld = definitionsByKey.get(profile.config.worldModelKey)
          if (!linkedWorld || linkedWorld.kind !== 'world_model') {
            pushDiagnostic(diagnostics, {
              level: 'error',
              code: 'missing_environment_world_model',
              message: `Environment "${definition.key}" references missing world model "${profile.config.worldModelKey}".`,
              graphKey: null,
              nodeKey: null,
            })
          }
        }

        for (const linkedLocationKey of profile.config.linkedLocationKeys) {
          const linkedLocation = definitionsByKey.get(linkedLocationKey)
          if (!linkedLocation || linkedLocation.kind !== 'location') {
            pushDiagnostic(diagnostics, {
              level: 'error',
              code: 'missing_environment_location',
              message: `Environment "${definition.key}" references missing location "${linkedLocationKey}".`,
              graphKey: null,
              nodeKey: null,
            })
          }
        }
      }

      if (renderBinding?.type === 'environment_render_binding') {
        if (renderBinding.config.primaryMeshAssetKey && !meshAssetKeys.has(renderBinding.config.primaryMeshAssetKey)) {
          pushDiagnostic(diagnostics, {
            level: 'error',
            code: 'missing_environment_mesh_asset',
            message: `Environment "${definition.key}" references missing mesh asset "${renderBinding.config.primaryMeshAssetKey}".`,
            graphKey: null,
            nodeKey: null,
          })
        }

        if (renderBinding.config.previewImageAssetKey && !imageAssetKeys.has(renderBinding.config.previewImageAssetKey)) {
          pushDiagnostic(diagnostics, {
            level: 'error',
            code: 'missing_environment_preview_image',
            message: `Environment "${definition.key}" references missing preview image asset "${renderBinding.config.previewImageAssetKey}".`,
            graphKey: null,
            nodeKey: null,
          })
        }
      }

      if (spawnRules?.type === 'environment_spawn_rules') {
        for (const characterKey of spawnRules.config.characterKeys) {
          const character = definitionsByKey.get(characterKey)
          if (!character || character.kind !== 'character') {
            pushDiagnostic(diagnostics, {
              level: 'error',
              code: 'missing_environment_spawn_character',
              message: `Environment "${definition.key}" references missing spawn character "${characterKey}".`,
              graphKey: null,
              nodeKey: null,
            })
          }
        }

        for (const itemKey of spawnRules.config.itemKeys) {
          const item = definitionsByKey.get(itemKey)
          if (!item || item.kind !== 'item') {
            pushDiagnostic(diagnostics, {
              level: 'error',
              code: 'missing_environment_spawn_item',
              message: `Environment "${definition.key}" references missing spawn item "${itemKey}".`,
              graphKey: null,
              nodeKey: null,
            })
          }
        }
      }
    }

    if (definition.kind === 'world_model') {
      const profile = getComponent(definition, 'world_profile')
      const environmentIndex = getComponent(definition, 'world_environment_index')
      const renderBinding = getComponent(definition, 'world_render_binding')

      if (!profile) {
        pushDiagnostic(diagnostics, {
          level: 'warning',
          code: 'world_model_missing_profile',
          message: `World model "${definition.key}" should include a world profile component.`,
          graphKey: null,
          nodeKey: null,
        })
      }

      if (!environmentIndex) {
        pushDiagnostic(diagnostics, {
          level: 'warning',
          code: 'world_model_missing_environment_index',
          message: `World model "${definition.key}" should include a world environment index component.`,
          graphKey: null,
          nodeKey: null,
        })
      }

      if (environmentIndex?.type === 'world_environment_index') {
        for (const environmentKey of environmentIndex.config.environmentKeys) {
          const environment = definitionsByKey.get(environmentKey)
          if (!environment || environment.kind !== 'environment') {
            pushDiagnostic(diagnostics, {
              level: 'error',
              code: 'missing_world_environment',
              message: `World model "${definition.key}" references missing environment "${environmentKey}".`,
              graphKey: null,
              nodeKey: null,
            })
          }
        }

        if (environmentIndex.config.primaryEnvironmentKey && !environmentIndex.config.environmentKeys.includes(environmentIndex.config.primaryEnvironmentKey)) {
          pushDiagnostic(diagnostics, {
            level: 'warning',
            code: 'world_primary_environment_unindexed',
            message: `World model "${definition.key}" uses primary environment "${environmentIndex.config.primaryEnvironmentKey}" outside its environment index.`,
            graphKey: null,
            nodeKey: null,
          })
        }
      }

      if (renderBinding?.type === 'world_render_binding') {
        if (renderBinding.config.primaryMeshAssetKey && !meshAssetKeys.has(renderBinding.config.primaryMeshAssetKey)) {
          pushDiagnostic(diagnostics, {
            level: 'error',
            code: 'missing_world_mesh_asset',
            message: `World model "${definition.key}" references missing mesh asset "${renderBinding.config.primaryMeshAssetKey}".`,
            graphKey: null,
            nodeKey: null,
          })
        }

        if (renderBinding.config.previewImageAssetKey && !imageAssetKeys.has(renderBinding.config.previewImageAssetKey)) {
          pushDiagnostic(diagnostics, {
            level: 'error',
            code: 'missing_world_preview_image',
            message: `World model "${definition.key}" references missing preview image asset "${renderBinding.config.previewImageAssetKey}".`,
            graphKey: null,
            nodeKey: null,
          })
        }
      }
    }

    if (definition.kind === 'item') {
      const physicalProfile = getComponent(definition, 'physical_item_profile')
      const renderBinding = getComponent(definition, 'render_3d_binding')

      if (physicalProfile?.type === 'physical_item_profile' && renderBinding?.type === 'render_3d_binding') {
        if (renderBinding.config.primaryMeshAssetKey && !meshAssetKeys.has(renderBinding.config.primaryMeshAssetKey)) {
          pushDiagnostic(diagnostics, {
            level: 'error',
            code: 'missing_item_mesh_asset',
            message: `Item "${definition.key}" references missing mesh asset "${renderBinding.config.primaryMeshAssetKey}".`,
            graphKey: null,
            nodeKey: null,
          })
        }

        if (renderBinding.config.previewImageAssetKey && !imageAssetKeys.has(renderBinding.config.previewImageAssetKey)) {
          pushDiagnostic(diagnostics, {
            level: 'error',
            code: 'missing_item_preview_image',
            message: `Item "${definition.key}" references missing preview image asset "${renderBinding.config.previewImageAssetKey}".`,
            graphKey: null,
            nodeKey: null,
          })
        }
      }
    }
  }

  return diagnostics
}

export function validateGraph(
  graph: GraphDefinition,
  graphs: GraphDefinition[],
  definitions: DefinitionBase[],
  assets: AssetDefinition[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const definitionKeys = new Set(definitions.map((definition) => definition.key))
  const assetKeys = new Set(assets.map((asset) => asset.key))
  const graphKeys = new Set(graphs.map((item) => item.key))
  const nodeKeys = new Set<string>()
  const startNodes = graph.nodes.filter((node) => node.type === 'start')
  const endNodes = graph.nodes.filter((node) => node.type === 'end')

  if (startNodes.length !== 1) {
    diagnostics.push({
      level: 'error',
      code: 'graph_start_count',
      message: `Graph "${graph.key}" must have exactly one start node.`,
      graphKey: graph.key,
      nodeKey: null,
    })
  }

  if (endNodes.length === 0) {
    diagnostics.push({
      level: 'warning',
      code: 'graph_missing_end',
      message: `Graph "${graph.key}" should include at least one end node.`,
      graphKey: graph.key,
      nodeKey: null,
    })
  }

  if (graph.entryNodeKey && !graph.nodes.some((node) => node.key === graph.entryNodeKey)) {
    diagnostics.push({
      level: 'error',
      code: 'graph_missing_entry',
      message: `Graph "${graph.key}" entry node "${graph.entryNodeKey}" is missing.`,
      graphKey: graph.key,
      nodeKey: null,
    })
  }

  for (const node of graph.nodes) {
    if (nodeKeys.has(node.key)) {
      diagnostics.push({
        level: 'error',
        code: 'duplicate_node_key',
        message: `Graph "${graph.key}" has duplicate node key "${node.key}".`,
        graphKey: graph.key,
        nodeKey: node.key,
      })
    }

    nodeKeys.add(node.key)
  }

  for (const edge of graph.edges) {
    if (!nodeKeys.has(edge.source.nodeKey) || !nodeKeys.has(edge.target.nodeKey)) {
      diagnostics.push({
        level: 'error',
        code: 'edge_missing_endpoint',
        message: `Edge "${edge.key}" points to a missing node.`,
        graphKey: graph.key,
        nodeKey: null,
      })
    }
  }

  for (const node of graph.nodes) {
    const template = node.templateKey ? graphNodeTemplatesByKey.get(node.templateKey) : null

    if (node.templateKey && !template) {
      diagnostics.push({
        level: 'warning',
        code: 'missing_node_template',
        message: `Node "${node.key}" references unknown template "${node.templateKey}".`,
        graphKey: graph.key,
        nodeKey: node.key,
      })
    }

    if (template && !template.compatibleGraphTypes.includes(graph.graphType)) {
      diagnostics.push({
        level: 'warning',
        code: 'template_graph_type_mismatch',
        message: `Node "${node.key}" uses template "${template.key}" outside compatible graph types.`,
        graphKey: graph.key,
        nodeKey: node.key,
      })
    }

    if (node.body.imageAssetKey && !assetKeys.has(node.body.imageAssetKey)) {
      diagnostics.push({
        level: 'error',
        code: 'missing_image_asset',
        message: `Node "${node.key}" references missing image asset "${node.body.imageAssetKey}".`,
        graphKey: graph.key,
        nodeKey: node.key,
      })
    }

    if (node.body.audioAssetKey && !assetKeys.has(node.body.audioAssetKey)) {
      diagnostics.push({
        level: 'error',
        code: 'missing_audio_asset',
        message: `Node "${node.key}" references missing audio asset "${node.body.audioAssetKey}".`,
        graphKey: graph.key,
        nodeKey: node.key,
      })
    }

    if (node.type === 'choice') {
      if (node.body.choices.length === 0) {
        diagnostics.push({
          level: 'warning',
          code: 'choice_missing_options',
          message: `Choice node "${node.key}" should contain at least one choice.`,
          graphKey: graph.key,
          nodeKey: node.key,
        })
      }

      const choiceIds = new Set<string>()
      for (const choice of node.body.choices) {
        if (choiceIds.has(choice.id)) {
          diagnostics.push({
            level: 'error',
            code: 'duplicate_choice_id',
            message: `Choice node "${node.key}" has duplicate choice id "${choice.id}".`,
            graphKey: graph.key,
            nodeKey: node.key,
          })
        }
        choiceIds.add(choice.id)
      }
    }

    if (node.type === 'call_subgraph') {
      const subgraphKey = typeof node.metadata.subgraphGraphKey === 'string' ? node.metadata.subgraphGraphKey : null
      if (subgraphKey && !graphKeys.has(subgraphKey)) {
        diagnostics.push({
          level: 'error',
          code: 'missing_subgraph_target',
          message: `Call subgraph node "${node.key}" references missing graph "${subgraphKey}".`,
          graphKey: graph.key,
          nodeKey: node.key,
        })
      }
    }

    for (const effect of node.effects) {
      if ('itemKey' in effect && !definitionKeys.has(effect.itemKey)) {
        diagnostics.push({
          level: 'error',
          code: 'missing_effect_item',
          message: `Node "${node.key}" references missing item "${effect.itemKey}".`,
          graphKey: graph.key,
          nodeKey: node.key,
        })
      }

      if ('statKey' in effect && !definitionKeys.has(effect.statKey)) {
        diagnostics.push({
          level: 'error',
          code: 'missing_effect_stat',
          message: `Node "${node.key}" references missing stat "${effect.statKey}".`,
          graphKey: graph.key,
          nodeKey: node.key,
        })
      }
    }
  }

  const unreachableNodeKeys = findUnreachableNodes(graph)

  for (const nodeKey of unreachableNodeKeys) {
    diagnostics.push({
      level: 'warning',
      code: 'unreachable_node',
      message: `Node "${nodeKey}" is unreachable from the graph entry point.`,
      graphKey: graph.key,
      nodeKey,
    })
  }

  return diagnostics
}

function findUnreachableNodes(graph: GraphDefinition): string[] {
  if (!graph.entryNodeKey) {
    return graph.nodes.map((node) => node.key)
  }

  const adjacency = graph.edges.reduce<Record<string, string[]>>((acc, edge) => {
    acc[edge.source.nodeKey] ??= []
    acc[edge.source.nodeKey].push(edge.target.nodeKey)
    return acc
  }, {})

  const visited = new Set<string>()
  const queue = [graph.entryNodeKey]

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current || visited.has(current)) {
      continue
    }

    visited.add(current)

    for (const next of adjacency[current] ?? []) {
      if (!visited.has(next)) {
        queue.push(next)
      }
    }
  }

  return graph.nodes.map((node) => node.key).filter((key) => !visited.has(key))
}
