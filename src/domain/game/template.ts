import { gameDesignSchema, GAME_TEMPLATE, type GameDesignSpec, type SystemSpec } from './contracts.ts'

const input = (name: string, schema: string) => ({ name, schema, direction: 'input' as const })
const output = (name: string, schema: string) => ({ name, schema, direction: 'output' as const })
export const ADVENTURE_SYSTEMS: SystemSpec[] = [
  { key: 'movement', version: 1, module: 'adventure.movement', label: 'Movement & camera', owns: ['position', 'stamina'], ports: [output('position', 'position.v1')], dependencies: [], acceptance: ['Player remains inside the level and cannot cross closed colliders.'] },
  { key: 'interaction', version: 1, module: 'adventure.interaction', label: 'Interaction', owns: ['focus'], ports: [input('position', 'position.v1'), output('interact', 'interaction.v1')], dependencies: ['movement'], acceptance: ['Only nearby targets can be activated.'] },
  { key: 'inventory', version: 1, module: 'adventure.inventory', label: 'Inventory', owns: ['items'], ports: [input('interact', 'interaction.v1'), output('changed', 'inventory.v1')], dependencies: ['interaction'], acceptance: ['Repeated pickup does not duplicate an item; capacity is enforced.'] },
  { key: 'dialogue', version: 1, module: 'adventure.dialogue', label: 'Dialogue', owns: ['dialogue'], ports: [input('interact', 'interaction.v1'), input('items', 'inventory.v1'), output('spoken', 'dialogue.v1')], dependencies: ['interaction', 'inventory'], acceptance: ['NPC dialogue responds to player progress.'] },
  { key: 'quest', version: 1, module: 'adventure.quest', label: 'Quest & progression', owns: ['doorOpen', 'complete'], ports: [input('items', 'inventory.v1'), input('interact', 'interaction.v1'), output('progress', 'quest.v1')], dependencies: ['inventory', 'interaction'], acceptance: ['The objective requires unlocking the door with the key.'] },
  { key: 'presentation', version: 1, module: 'adventure.presentation', label: 'HUD & feedback', owns: ['message'], ports: [input('progress', 'quest.v1'), input('spoken', 'dialogue.v1')], dependencies: ['quest', 'dialogue'], acceptance: ['Objective, controls and interaction feedback remain visible.'] },
  { key: 'persistence', version: 1, module: 'adventure.persistence', label: 'Save & restart', owns: ['save'], ports: [input('items', 'inventory.v1'), input('progress', 'quest.v1'), input('position', 'position.v1')], dependencies: ['inventory', 'quest', 'movement'], acceptance: ['Save/load restores position and progress only for the same build.'] },
]

// Technical template fixtures are explicit; creative canon comes from the hosted planner.
export function createAdventureTemplate(title = 'Adventure template'): GameDesignSpec {
  const dimensions = { x: 1, y: 1, z: 1 }
  return gameDesignSchema.parse({
    schemaVersion: 1, template: GAME_TEMPLATE, title, brief: 'A compact exploration adventure with a key, a gate and a destination.',
    coreLoop: ['Explore the courtyard', 'Find the key', 'Unlock the gate', 'Reach the destination'], unsupportedMechanics: [], sourceEntityKeys: [],
    style: { version: 1, description: 'Stylized architectural forms, muted stone, warm brass and soft daylight.', ground: '#777b70', accent: '#c4a26c', sky: '#bac6c8' },
    target: 'desktop_web', engine: 'babylon', movement: { walkSpeed: 4, sprintSpeed: 6.5, staminaDrain: 15, staminaRecovery: 12 },
    inventory: { capacity: 5, keyItem: 'gate_key' },
    dialogue: { greeting: 'Find the key in the courtyard. The gate leads to your destination.', afterKey: 'You have the key. Open the gate ahead.', afterComplete: 'You made it through. Your journey is complete.' },
    quest: { title: 'Beyond the gate', objective: 'Find the key, unlock the gate and reach the marker.', completionText: 'Destination reached.' },
    systems: structuredClone(ADVENTURE_SYSTEMS),
    prefabs: [
      { key: 'player', entityKey: null, label: 'Player', role: 'player', assetRecipeKey: 'player_rig', size: { x: .8, y: 1.8, z: .7 }, color: '#405a62', collider: 'capsule' },
      { key: 'guide', entityKey: null, label: 'Guide', role: 'npc', assetRecipeKey: null, size: { x: .7, y: 1.8, z: .7 }, color: '#946f58', collider: 'capsule' },
      { key: 'key', entityKey: null, label: 'Gate key', role: 'key', assetRecipeKey: 'key_mesh', size: { x: .4, y: .4, z: .4 }, color: '#dbb856', collider: 'none' },
      { key: 'door', entityKey: null, label: 'Gate', role: 'door', assetRecipeKey: null, size: { x: 2.8, y: 3, z: .6 }, color: '#62554a', collider: 'box' },
      { key: 'goal', entityKey: null, label: 'Destination', role: 'goal', assetRecipeKey: null, size: dimensions, color: '#99be9a', collider: 'none' },
      { key: 'wall', entityKey: null, label: 'Courtyard wall', role: 'wall', assetRecipeKey: null, size: { x: 9.1, y: 3.5, z: .6 }, color: '#888c82', collider: 'box' },
    ],
    level: { key: 'courtyard', name: 'Courtyard', seed: 1, units: 'meters', width: 24, depth: 26, spawn: { x: 0, y: 0, z: -9 }, instances: [
      { key: 'guide_01', prefabKey: 'guide', position: { x: -3, y: 0, z: -7 }, rotationY: 0 },
      { key: 'key_01', prefabKey: 'key', position: { x: 5, y: 0, z: -4 }, rotationY: 0 },
      { key: 'gate_01', prefabKey: 'door', position: { x: 0, y: 0, z: 3 }, rotationY: 0 },
      { key: 'goal_01', prefabKey: 'goal', position: { x: 0, y: 0, z: 9 }, rotationY: 0 },
      { key: 'wall_left', prefabKey: 'wall', position: { x: -5.95, y: 0, z: 3 }, rotationY: 0 },
      { key: 'wall_right', prefabKey: 'wall', position: { x: 5.95, y: 0, z: 3 }, rotationY: 0 },
    ] },
    assets: [{ key: 'key_mesh', entityKey: null, subject: 'Gate key', revision: 1, styleVersion: 1, method: 'image_to_3d', prompt: 'One ornate brass key, isolated on a plain background, full object visible, no text, stylized clean geometry.', sourceImageAssetKey: null, dimensions: { x: .4, y: .4, z: .4 }, maxTriangles: 12000, maxBytes: 8000000 },
      { key: 'player_rig', entityKey: null, subject: 'Player template rig', revision: 1, styleVersion: 1, method: 'approved_rig', prompt: 'Versioned articulated humanoid with Idle and Walk clips.', sourceImageAssetKey: null, dimensions: { x: .8, y: 1.8, z: .7 }, maxTriangles: 12000, maxBytes: 8000000 }],
  })
}
