import type { DefinitionBase } from '../../domain/graphcore'

export function DefinitionComponentsEditor({
  definition,
  definitions,
  graphKeys,
  onUpdateComponent,
}: {
  definition: DefinitionBase
  definitions: DefinitionBase[]
  graphKeys: string[]
  onUpdateComponent: (componentType: DefinitionBase['components'][number]['type'], config: Record<string, unknown>) => void
}) {
  const marketInventory = definition.components.find((component) => component.type === 'market_inventory')
  const abilityLoadout = definition.components.find((component) => component.type === 'ability_loadout')
  const abilityProfile = definition.components.find((component) => component.type === 'ability_profile')
  const locationState = definition.components.find((component) => component.type === 'location_state')
  const characterProfile = definition.components.find((component) => component.type === 'character_profile')
  const animationBinding = definition.components.find((component) => component.type === 'animation_binding')
  const logicBinding = definition.components.find((component) => component.type === 'logic_state_machine_binding')
  const environmentProfile = definition.components.find((component) => component.type === 'environment_profile')
  const environmentRenderBinding = definition.components.find((component) => component.type === 'environment_render_binding')
  const environmentNavigation = definition.components.find((component) => component.type === 'environment_navigation')
  const environmentSpawnRules = definition.components.find((component) => component.type === 'environment_spawn_rules')
  const worldProfile = definition.components.find((component) => component.type === 'world_profile')
  const worldEnvironmentIndex = definition.components.find((component) => component.type === 'world_environment_index')
  const worldRenderBinding = definition.components.find((component) => component.type === 'world_render_binding')
  const physicalItemProfile = definition.components.find((component) => component.type === 'physical_item_profile')
  const render3dBinding = definition.components.find((component) => component.type === 'render_3d_binding')
  const itemOptions = definitions.filter((entry) => entry.kind === 'item')
  const abilityOptions = definitions.filter((entry) => entry.kind === 'ability')
  const marketOptions = definitions.filter((entry) => entry.kind === 'market')
  const environmentOptions = definitions.filter((entry) => entry.kind === 'environment')
  const worldModelOptions = definitions.filter((entry) => entry.kind === 'world_model')
  const locationOptions = definitions.filter((entry) => entry.kind === 'location')
  const characterOptions = definitions.filter((entry) => entry.kind === 'character')

  function renderJsonEditor(componentType: DefinitionBase['components'][number]['type'], value: unknown, rows = 6) {
    return (
      <textarea
        key={`${definition.key}-${componentType}`}
        rows={rows}
        defaultValue={JSON.stringify(value, null, 2)}
        onBlur={(event) => {
          try {
            onUpdateComponent(componentType, JSON.parse(event.target.value) as Record<string, unknown>)
          } catch {
            // Ignore invalid JSON until the author corrects it.
          }
        }}
      />
    )
  }

  return (
    <div className="detail-stack">
      {definition.kind === 'market' ? (
        <div className="editor-grid">
          <label className="field-block full-width">
            <span>Trade Rows</span>
            <textarea
              key={`${definition.key}-market_inventory`}
              rows={6}
              defaultValue={JSON.stringify(marketInventory?.config ?? { trades: [] }, null, 2)}
              onBlur={(event) => {
                try {
                  onUpdateComponent('market_inventory', JSON.parse(event.target.value) as Record<string, unknown>)
                } catch {
                  // Ignore invalid JSON until the author corrects it.
                }
              }}
            />
          </label>
          <div className="inline-note">Use valid item keys for `offerItemKey` and `costItemKey`. Available items: {itemOptions.map((item) => item.key).join(', ') || 'none'}.</div>
        </div>
      ) : null}

      {definition.kind === 'character' ? (
        <div className="editor-grid">
          <label className="field-block">
            <span>Subtype</span>
            <select
              value={String((characterProfile?.config as { subtype?: string } | undefined)?.subtype ?? 'humanoid')}
              onChange={(event) =>
                onUpdateComponent('character_profile', {
                  bodyClass: 'humanoid',
                  controlMode: 'ai',
                  scaleProfile: 'medium',
                  ...(characterProfile?.config ?? {}),
                  subtype: event.target.value,
                })
              }
            >
              <option value="humanoid">Humanoid</option>
              <option value="beast">Beast</option>
              <option value="construct">Construct</option>
              <option value="undead">Undead</option>
              <option value="vehicle">Vehicle</option>
              <option value="spirit">Spirit</option>
            </select>
          </label>
          <label className="field-block">
            <span>Control Mode</span>
            <select
              value={String((characterProfile?.config as { controlMode?: string } | undefined)?.controlMode ?? 'ai')}
              onChange={(event) =>
                onUpdateComponent('character_profile', {
                  subtype: 'humanoid',
                  bodyClass: 'humanoid',
                  scaleProfile: 'medium',
                  ...(characterProfile?.config ?? {}),
                  controlMode: event.target.value,
                })
              }
            >
              <option value="player">Player</option>
              <option value="ai">AI</option>
              <option value="scripted">Scripted</option>
              <option value="neutral">Neutral</option>
            </select>
          </label>
          <label className="field-block full-width">
            <span>Ability Loadout</span>
            {renderJsonEditor('ability_loadout', abilityLoadout?.config ?? { entries: [] })}
          </label>
          <label className="field-block full-width">
            <span>Animation Binding</span>
            {renderJsonEditor('animation_binding', animationBinding?.config ?? {
              defaultAnimationGraphKey: null,
              animationSetKeys: [],
              slotBindings: [],
              locomotionMode: 'grounded',
            })}
          </label>
          <label className="field-block full-width">
            <span>Logic State Machine</span>
            {renderJsonEditor('logic_state_machine_binding', logicBinding?.config ?? {
              stateMachineKey: null,
              defaultStateKey: null,
              controlMode: 'ai',
            })}
          </label>
          <label className="field-block full-width">
            <span>Render Binding</span>
            {renderJsonEditor('render_3d_binding', render3dBinding?.config ?? {
              primaryMeshAssetKey: null,
              previewImageAssetKey: null,
              generationPrompt: null,
              generationStyle: null,
            })}
          </label>
          <div className="inline-note">Available abilities: {abilityOptions.map((ability) => ability.key).join(', ') || 'none'}.</div>
        </div>
      ) : null}

      {definition.kind === 'ability' ? (
        <div className="editor-grid">
          <label className="field-block">
            <span>Target Mode</span>
            <select
              value={String((abilityProfile?.config as { targetMode?: string } | undefined)?.targetMode ?? 'enemy')}
              onChange={(event) =>
                onUpdateComponent('ability_profile', {
                  ...(abilityProfile?.config ?? {}),
                  targetMode: event.target.value,
                })
              }
            >
              <option value="self">Self</option>
              <option value="ally">Ally</option>
              <option value="enemy">Enemy</option>
              <option value="area">Area</option>
              <option value="passive">Passive</option>
            </select>
          </label>
          <label className="field-block">
            <span>Cooldown Seconds</span>
            <input
              type="number"
              value={String((abilityProfile?.config as { cooldownSeconds?: number } | undefined)?.cooldownSeconds ?? 0)}
              onChange={(event) =>
                onUpdateComponent('ability_profile', {
                  ...(abilityProfile?.config ?? {}),
                  cooldownSeconds: Number(event.target.value || 0),
                })
              }
            />
          </label>
          <label className="field-block">
            <span>Cast Time</span>
            <input
              type="number"
              value={String((abilityProfile?.config as { castTimeSeconds?: number } | undefined)?.castTimeSeconds ?? 0)}
              onChange={(event) =>
                onUpdateComponent('ability_profile', {
                  ...(abilityProfile?.config ?? {}),
                  castTimeSeconds: Number(event.target.value || 0),
                })
              }
            />
          </label>
          <label className="field-block">
            <span>Resource Item</span>
            <select
              value={String((abilityProfile?.config as { resourceCostItemKey?: string | null } | undefined)?.resourceCostItemKey ?? '')}
              onChange={(event) =>
                onUpdateComponent('ability_profile', {
                  ...(abilityProfile?.config ?? {}),
                  resourceCostItemKey: event.target.value || null,
                })
              }
            >
              <option value="">None</option>
              {itemOptions.map((item) => (
                <option key={item.key} value={item.key}>{item.key}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {definition.kind === 'location' ? (
        <div className="editor-grid">
          <label className="field-block">
            <span>Region</span>
            <input
              value={String((locationState?.config as { region?: string } | undefined)?.region ?? '')}
              onChange={(event) =>
                onUpdateComponent('location_state', {
                  ...(locationState?.config ?? {}),
                  region: event.target.value,
                })
              }
            />
          </label>
          <label className="field-block">
            <span>Unlocked By Default</span>
            <select
              value={String(Boolean((locationState?.config as { isUnlockedByDefault?: boolean } | undefined)?.isUnlockedByDefault))}
              onChange={(event) =>
                onUpdateComponent('location_state', {
                  ...(locationState?.config ?? {}),
                  isUnlockedByDefault: event.target.value === 'true',
                })
              }
            >
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          </label>
          <label className="field-block full-width">
            <span>Linked Graph Keys</span>
            <input
              value={((locationState?.config as { linkedGraphKeys?: string[] } | undefined)?.linkedGraphKeys ?? []).join(', ')}
              onChange={(event) =>
                onUpdateComponent('location_state', {
                  ...(locationState?.config ?? {}),
                  linkedGraphKeys: event.target.value.split(',').map((value) => value.trim()).filter(Boolean),
                })
              }
              placeholder={graphKeys.join(', ')}
            />
          </label>
          <label className="field-block full-width">
            <span>Linked Markets</span>
            <input
              value={((locationState?.config as { linkedMarketKeys?: string[] } | undefined)?.linkedMarketKeys ?? []).join(', ')}
              onChange={(event) =>
                onUpdateComponent('location_state', {
                  ...(locationState?.config ?? {}),
                  linkedMarketKeys: event.target.value.split(',').map((value) => value.trim()).filter(Boolean),
                })
              }
              placeholder={marketOptions.map((market) => market.key).join(', ')}
            />
          </label>
          <label className="field-block">
            <span>Environment</span>
            <select
              value={String((locationState?.config as { environmentKey?: string | null } | undefined)?.environmentKey ?? '')}
              onChange={(event) =>
                onUpdateComponent('location_state', {
                  region: 'frontier',
                  isUnlockedByDefault: true,
                  linkedGraphKeys: [],
                  linkedMarketKeys: [],
                  unlockTokenKey: null,
                  ...(locationState?.config ?? {}),
                  environmentKey: event.target.value || null,
                })
              }
            >
              <option value="">None</option>
              {environmentOptions.map((environment) => (
                <option key={environment.key} value={environment.key}>{environment.key}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {definition.kind === 'environment' ? (
        <div className="editor-grid">
          <label className="field-block">
            <span>Subtype</span>
            <select
              value={String((environmentProfile?.config as { subtype?: string } | undefined)?.subtype ?? 'exterior')}
              onChange={(event) =>
                onUpdateComponent('environment_profile', {
                  biome: '',
                  traversalType: 'walk',
                  isInterior: false,
                  scaleTier: 'site',
                  worldModelKey: null,
                  linkedLocationKeys: [],
                  ...(environmentProfile?.config ?? {}),
                  subtype: event.target.value,
                })
              }
            >
              <option value="interior">Interior</option>
              <option value="exterior">Exterior</option>
              <option value="dungeon">Dungeon</option>
              <option value="settlement">Settlement</option>
              <option value="wilderness">Wilderness</option>
              <option value="structure">Structure</option>
              <option value="biome">Biome</option>
              <option value="poi">POI</option>
            </select>
          </label>
          <label className="field-block">
            <span>World Model</span>
            <select
              value={String((environmentProfile?.config as { worldModelKey?: string | null } | undefined)?.worldModelKey ?? '')}
              onChange={(event) =>
                onUpdateComponent('environment_profile', {
                  subtype: 'exterior',
                  biome: '',
                  traversalType: 'walk',
                  isInterior: false,
                  scaleTier: 'site',
                  linkedLocationKeys: [],
                  ...(environmentProfile?.config ?? {}),
                  worldModelKey: event.target.value || null,
                })
              }
            >
              <option value="">None</option>
              {worldModelOptions.map((worldModel) => (
                <option key={worldModel.key} value={worldModel.key}>{worldModel.key}</option>
              ))}
            </select>
          </label>
          <label className="field-block full-width">
            <span>Environment Profile</span>
            {renderJsonEditor('environment_profile', environmentProfile?.config ?? {
              subtype: 'exterior',
              biome: '',
              traversalType: 'walk',
              isInterior: false,
              scaleTier: 'site',
              worldModelKey: null,
              linkedLocationKeys: [],
            })}
          </label>
          <label className="field-block full-width">
            <span>Render Binding</span>
            {renderJsonEditor('environment_render_binding', environmentRenderBinding?.config ?? {
              primaryMeshAssetKey: null,
              previewImageAssetKey: null,
              lightingProfile: '',
              generationPrompt: null,
              generationStyle: null,
            })}
          </label>
          <label className="field-block full-width">
            <span>Navigation</span>
            {renderJsonEditor('environment_navigation', environmentNavigation?.config ?? {
              entryAnchors: [],
              regionMarkers: [],
              navigationNotes: '',
            })}
          </label>
          <label className="field-block full-width">
            <span>Spawn Rules</span>
            {renderJsonEditor('environment_spawn_rules', environmentSpawnRules?.config ?? {
              characterKeys: [],
              itemKeys: [],
              resourceNodeKeys: [],
            })}
          </label>
          <div className="inline-note">Locations: {locationOptions.map((location) => location.key).join(', ') || 'none'}. Characters: {characterOptions.map((character) => character.key).join(', ') || 'none'}.</div>
        </div>
      ) : null}

      {definition.kind === 'world_model' ? (
        <div className="editor-grid">
          <label className="field-block full-width">
            <span>World Profile</span>
            {renderJsonEditor('world_profile', worldProfile?.config ?? {
              subtype: 'region_set',
              theme: '',
              scaleTier: 'regional',
              generationStyle: 'hand_authored',
            })}
          </label>
          <label className="field-block full-width">
            <span>Environment Index</span>
            {renderJsonEditor('world_environment_index', worldEnvironmentIndex?.config ?? {
              environmentKeys: [],
              primaryEnvironmentKey: null,
              regionGroups: [],
            })}
          </label>
          <label className="field-block full-width">
            <span>Render Binding</span>
            {renderJsonEditor('world_render_binding', worldRenderBinding?.config ?? {
              primaryMeshAssetKey: null,
              previewImageAssetKey: null,
              generationPrompt: null,
              generationStyle: null,
            })}
          </label>
          <div className="inline-note">Available environments: {environmentOptions.map((environment) => environment.key).join(', ') || 'none'}.</div>
        </div>
      ) : null}

      {definition.kind === 'item' ? (
        <div className="editor-grid">
          <label className="field-block full-width">
            <span>Physical Item Profile</span>
            {renderJsonEditor('physical_item_profile', physicalItemProfile?.config ?? {
              physicalSubtype: 'pickup',
              worldPlacementRole: '',
              pickupContext: '',
            })}
          </label>
          <label className="field-block full-width">
            <span>Render Binding</span>
            {renderJsonEditor('render_3d_binding', render3dBinding?.config ?? {
              primaryMeshAssetKey: null,
              previewImageAssetKey: null,
              generationPrompt: null,
              generationStyle: null,
            })}
          </label>
        </div>
      ) : null}

      {!['market', 'character', 'ability', 'location', 'environment', 'world_model', 'item'].includes(definition.kind) ? (
        <div className="inline-note">No specialized component editor for this definition kind yet.</div>
      ) : null}
    </div>
  )
}
