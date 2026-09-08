import type { InteractionNode, Anchors } from './spec.ts'
export function interactionTemplate(): InteractionNode[] {
  const base = (id: string, label: string) => ({
    id,
    label,
    version: 1 as const,
  })
  const nodes: InteractionNode[] = [
    {
      ...base('body.rider', 'Humanoid rider'),
      kind: 'body',
      family: 'humanoid',
      height: 1.8,
      width: 0.5,
      length: 0.4,
      legLength: 0.84,
    },
    {
      ...base('body.horse', 'Quadruped mount'),
      kind: 'body',
      family: 'quadruped',
      height: 1.7,
      width: 0.65,
      length: 1.8,
      legLength: 0.85,
    },
    {
      ...base('body.chair', 'Chair'),
      kind: 'body',
      family: 'rigid',
      height: 0.6,
      width: 0.7,
      length: 0.7,
      legLength: 0.1,
    },
    {
      ...base('body.car', 'Vehicle'),
      kind: 'body',
      family: 'rigid',
      height: 0.65,
      width: 1.4,
      length: 2.3,
      legLength: 0.1,
    },
    {
      ...base('body.door', 'Door frame'),
      kind: 'body',
      family: 'rigid',
      height: 2,
      width: 1,
      length: 0.12,
      legLength: 0.1,
    },
    {
      ...base('motor.horse', 'Quadruped locomotion'),
      kind: 'locomotor',
      type: 'quadruped',
      maxSpeed: 3,
      acceleration: 3,
      braking: 6,
      turnRate: 2,
    },
    {
      ...base('motor.car', 'Vehicle steering'),
      kind: 'locomotor',
      type: 'vehicle',
      maxSpeed: 4,
      acceleration: 2,
      braking: 7,
      turnRate: 1.2,
    },
    {
      ...base('mechanism.door', 'Hinged door'),
      kind: 'mechanism',
      type: 'hinge',
      size: { x: 1, y: 2, z: 0.12 },
      openAngle: 1.57,
      seconds: 0.8,
      locked: false,
    },
  ]
  for (const [name, mode, position, seat] of [
    ['chair', 'seat', { x: -7, y: 0, z: -5 }, 1],
    ['horse', 'ride', { x: 6, y: 0, z: -5 }, 1.65],
    ['car', 'drive', { x: 7, y: 0, z: 3 }, 1],
    ['door', 'door', { x: -7, y: 0, z: 0 }, 0.88],
  ] as const) {
    const y = seat,
      anchors: Anchors['anchors'] = [
        {
          id: 'approach',
          role: 'approach',
          position: { x: -1.55, y: 0, z: 0 },
          yaw: Math.PI / 2,
        },
        {
          id: 'exit.left',
          role: 'exit',
          position: { x: -1.7, y: 0, z: 0 },
          yaw: -Math.PI / 2,
        },
        {
          id: 'exit.right',
          role: 'exit',
          position: { x: 1.7, y: 0, z: 0 },
          yaw: Math.PI / 2,
        },
        { id: 'seat', role: 'pelvis', position: { x: 0, y, z: 0 }, yaw: 0 },
        {
          id: 'step.pelvis',
          role: 'pelvis',
          position: { x: -0.5, y: y + 0.1, z: 0 },
          yaw: 0,
        },
        {
          id: 'hand.left',
          role: 'contact',
          position: { x: -0.2, y: y + 0.48, z: 0.42 },
          yaw: 0,
        },
        {
          id: 'hand.right',
          role: 'contact',
          position: { x: 0.2, y: y + 0.48, z: 0.42 },
          yaw: 0,
        },
        {
          id: 'foot.left',
          role: 'contact',
          position: { x: -0.3, y: y - 0.55, z: 0.3 },
          yaw: 0,
        },
        {
          id: 'foot.right',
          role: 'contact',
          position: { x: 0.3, y: y - 0.55, z: 0.3 },
          yaw: 0,
        },
      ]
    if (name === 'door') {
      anchors.find((a) => a.id === 'approach')!.position = {
        x: 0.4,
        y: 0,
        z: -1.3,
      }
      anchors.find((a) => a.id === 'approach')!.yaw = 0
      anchors.find((a) => a.id === 'seat')!.position = {
        x: 0.4,
        y: 0.88,
        z: -0.6,
      }
      anchors.find((a) => a.id === 'step.pelvis')!.position = {
        x: 0.4,
        y: 0.88,
        z: -0.8,
      }
      anchors.push({
        id: 'handle',
        role: 'contact',
        position: { x: 0.8, y: 1, z: -0.1 },
        yaw: 0,
      })
    }
    nodes.push({
      ...base(`anchors.${name}`, `${name} spatial anchors`),
      kind: 'anchor_set',
      anchors,
    })
    const contacts =
      mode === 'door'
        ? [{ joint: 'rightHand' as const, anchor: 'handle', tolerance: 0.12 }]
        : (['leftHand', 'rightHand', 'leftFoot', 'rightFoot'] as const).map(
            (joint) => ({
              joint,
              anchor: `${joint.includes('Hand') ? 'hand' : 'foot'}.${joint.startsWith('left') ? 'left' : 'right'}`,
              tolerance: 0.12,
            }),
          )
    nodes.push({
      ...base(
        `contact.${name}.settle`,
        `${name} ${mode === 'door' ? 'reach' : 'seated'} pose`,
      ),
      kind: 'contact_pose',
      body: 'body.rider',
      anchors: `anchors.${name}`,
      pelvis: 'seat',
      contacts,
    })
    nodes.push({
      ...base(`contact.${name}.step`, `${name} transition pose`),
      kind: 'contact_pose',
      body: 'body.rider',
      anchors: `anchors.${name}`,
      pelvis: 'step.pelvis',
      contacts:
        name === 'horse'
          ? [
              { joint: 'leftHand', anchor: 'hand.left', tolerance: 0.12 },
              { joint: 'leftFoot', anchor: 'foot.left', tolerance: 0.12 },
            ]
          : [],
    })
    nodes.push({
      ...base(
        `interaction.${name}`,
        mode === 'door' ? 'Open / close door' : `Use ${name}`,
      ),
      kind: 'interaction',
      body: 'body.rider',
      anchors: `anchors.${name}`,
      slot: 'primary',
      mode,
      approach: 'approach',
      exits: ['exit.left', 'exit.right'],
      maxDistance: 2,
      targetMotionTolerance: 0.12,
      phases: [
        { id: 'align', seconds: 0.3, pose: null, op: 'align' },
        {
          id: 'step',
          seconds: 0.4,
          pose: `contact.${name}.step`,
          op: 'contact',
        },
        {
          id: 'settle',
          seconds: 0.5,
          pose: `contact.${name}.settle`,
          op: mode === 'door' ? 'actuate' : 'attach',
        },
      ],
    })
    nodes.push({
      ...base(
        `entity.${name}`,
        name === 'horse'
          ? 'Rideable horse'
          : name === 'car'
            ? 'Drivable vehicle'
            : name === 'door'
              ? 'Hinged door'
              : 'Chair',
      ),
      kind: 'interactive_entity',
      body: `body.${name}`,
      anchors: `anchors.${name}`,
      interactions: [`interaction.${name}`],
      motor:
        name === 'horse' ? 'motor.horse' : name === 'car' ? 'motor.car' : null,
      mechanism: name === 'door' ? 'mechanism.door' : null,
      position: { ...position },
      yaw: 0,
      enabled: true,
    })
  }
  return nodes
}
