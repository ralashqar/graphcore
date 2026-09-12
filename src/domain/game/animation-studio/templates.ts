import { STUDIO_VERSION, parseGraph, type StudioGraph, type MotionNode } from './graph.ts'

export function studioTemplate(sword = true): StudioGraph {
  const stances: StudioGraph['stances'] = [{ id: 'upright', label: 'Upright', equipment: 'none', description: 'Relaxed, balanced upright posture with a natural gait.', guardHeight: 0, torsoTurn: 0, handedness: 'right' }]
  if (sword) stances.push({ id: 'sword', label: 'Sword combat', equipment: 'one_handed_sword', description: 'Alert right-handed swordsman, knees softly bent, steady one-handed guard and balanced footwork.', guardHeight: 0, torsoTurn: .12, handedness: 'right' })
  const roles = ['idle','walk','run','backward','strafe_left','strafe_right'] as const
  const nodes: MotionNode[] = stances.flatMap(s => roles.map(role => ({
    id: `${s.id}.${role}`, group: s.id, kind: 'locomotion' as const, role, label: role.replaceAll('_',' '),
    description: `${role.replaceAll('_',' ')} with ${s.description.toLowerCase()}`,
    duration: role === 'idle' ? 3 : 2, loop: true, speed: role === 'idle' ? 0 : role === 'run' ? 4 : 1.5,
    entry: `${s.id}.guard`, exit: `${s.id}.guard`, impact: .4, clipId: null, contractHash: null,
  })))
  const transitions: StudioGraph['transitions'] = []
  if (sword) {
    const descriptions = ['Forward diagonal forehand slash from guard; finish across the body with weight on the front foot.', 'Returning backhand slash from the preceding forehand follow-through; unwind the torso and transfer weight smoothly.', 'Strong advancing finishing strike from the backhand exit posture; decelerate and recover to the sword guard.']
    descriptions.forEach((description, i) => nodes.push({ id: `sword.strike_${i+1}`, group: 'sword', kind: 'action', role: 'sword_strike', label: ['Forehand','Backhand','Advancing finisher'][i], description,
      duration: [1.1,1.15,1.5][i], loop: false, speed: 0, entry: i ? `sword.boundary_${i}` : 'sword.guard', exit: i === 2 ? 'sword.guard' : `sword.boundary_${i+1}`, impact: .4, clipId: null, contractHash: null }))
    const edge = (from: string, to: string, event: StudioGraph['transitions'][number]['event'], earliest = 0, priority = 10) => transitions.push({ id: `${from}.${event}`, from, to, event, earliest, latest: 1, blendSeconds: .12, priority })
    for (const role of roles) { edge(`upright.${role}`, `sword.${role}`, 'toggle_combat'); edge(`sword.${role}`, `upright.${role}`, 'toggle_combat'); edge(`sword.${role}`, 'sword.strike_1', 'attack') }
    for (let i = 1; i <= 3; i++) { edge(`sword.strike_${i}`, 'sword.idle', 'finished', 1, 0); if (i < 3) edge(`sword.strike_${i}`, `sword.strike_${i+1}`, 'attack', .65, 20) }
  }
  return parseGraph({ version: 2, catalog: STUDIO_VERSION, name: sword ? 'Sword locomotion & combo' : 'Neutral locomotion', prompt: '', rig: 'humanoid.fabric-ybot.v1', entry: 'upright.idle', stances, nodes, transitions, dependencies: [], gaps: [], inputs: { attack: 'KeyF', toggle_combat: 'KeyC' } })
}
