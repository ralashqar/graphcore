import { type Node, CATALOG } from './spec.ts'
export type ModuleContract = {
  version: string
  owns: string[]
  inputs: string[]
  outputs: string[]
  acceptance: string[]
}
export function contract(kind: Node['kind']): ModuleContract {
  const common = {
    version: CATALOG,
    acceptance: [
      'Typed dependencies resolve',
      'Parameters remain inside runtime bounds',
    ],
  }
  switch (kind) {
    case 'actor_instance':
      return {
        ...common,
        owns: ['transform', 'health', 'stamina', 'activation'],
        inputs: [
          'movement input',
          'ability request',
          'damage',
          'objective completion',
        ],
        outputs: ['actor state', 'damage', 'death'],
      }
    case 'objective':
      return {
        ...common,
        owns: ['completion'],
        inputs: [
          'prerequisite completion',
          'dialogue',
          'collection',
          'region entry',
          'death',
          'interaction',
          'delivery',
        ],
        outputs: ['objective completed', 'mission completed'],
      }
    case 'pickup':
    case 'item':
      return {
        ...common,
        owns: ['inventory quantities', 'collected instance IDs'],
        inputs: ['interact', 'capacity', 'prerequisites'],
        outputs: ['collected', 'inventory full'],
      }
    case 'dialogue':
      return {
        ...common,
        owns: ['conversation history'],
        inputs: ['interact', 'participant range', 'prerequisites'],
        outputs: ['dialogue', 'talk objective progress'],
      }
    case 'ability':
    case 'ability_effects':
    case 'effect':
      return {
        ...common,
        owns: ['action phases', 'cooldown', 'effect duration'],
        inputs: ['ability request', 'stamina', 'target', 'socket transform'],
        outputs: ['release', 'hit', 'resource change', 'projectile'],
      }
    case 'interaction':
    case 'interactive_entity':
      return {
        ...common,
        owns: ['exclusive slots', 'interaction phases', 'attachment'],
        inputs: [
          'interact',
          'cancel',
          'contact pose',
          'clearance',
          'actor state',
        ],
        outputs: ['attached', 'exited', 'cancelled', 'mechanism requested'],
      }
    case 'movement':
      return {
        ...common,
        owns: ['motor state', 'velocity'],
        inputs: ['direction', 'jump', 'grip', 'drop', 'collision'],
        outputs: ['transform', 'ground/air/hang/climb/dead'],
      }
    case 'lock':
      return {
        ...common,
        owns: ['unlocked'],
        inputs: ['key inventory', 'spatial admission'],
        outputs: ['unlocked', 'key consumed'],
      }
    default:
      return {
        ...common,
        owns: ['definition'],
        inputs: ['typed configuration'],
        outputs: [`${kind} definition`],
      }
  }
}
