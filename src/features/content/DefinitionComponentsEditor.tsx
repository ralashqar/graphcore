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
  const itemOptions = definitions.filter((entry) => entry.kind === 'item')
  const abilityOptions = definitions.filter((entry) => entry.kind === 'ability')
  const marketOptions = definitions.filter((entry) => entry.kind === 'market')

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
          <label className="field-block full-width">
            <span>Ability Loadout</span>
            <textarea
              key={`${definition.key}-ability_loadout`}
              rows={6}
              defaultValue={JSON.stringify(abilityLoadout?.config ?? { entries: [] }, null, 2)}
              onBlur={(event) => {
                try {
                  onUpdateComponent('ability_loadout', JSON.parse(event.target.value) as Record<string, unknown>)
                } catch {
                  // Ignore invalid JSON until the author corrects it.
                }
              }}
            />
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
        </div>
      ) : null}

      {!['market', 'character', 'ability', 'location'].includes(definition.kind) ? (
        <div className="inline-note">No specialized component editor for this definition kind yet.</div>
      ) : null}
    </div>
  )
}
