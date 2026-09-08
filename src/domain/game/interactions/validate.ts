import { interactionNodeSchema, type InteractionNode } from './spec.ts'
import { contactPoseAt } from './poses.ts'
export function validateInteractions(all: { id: string; kind: string }[]) {
  const nodes = all.filter(
      (n) => interactionNodeSchema.safeParse(n).success,
    ) as InteractionNode[],
    byId = new Map(all.map((n) => [n.id, n])),
    errors: { nodeKey: string; message: string }[] = []
  const fail = (id: string, message: string) =>
      errors.push({ nodeKey: id, message }),
    expect = (id: string, ref: string, kind: string) => {
      if (byId.get(ref)?.kind !== kind) fail(id, `Missing ${kind}: ${ref}`)
    }
  for (const n of nodes) {
    if (n.kind === 'contact_pose') {
      expect(n.id, n.body, 'body')
      expect(n.id, n.anchors, 'anchor_set')
      if (new Set(n.contacts.map((c) => c.joint)).size !== n.contacts.length)
        fail(n.id, 'Duplicate joint constraint')
    }
    if (
      n.kind === 'anchor_set' &&
      new Set(n.anchors.map((a) => a.id)).size !== n.anchors.length
    )
      fail(n.id, 'Duplicate anchor')
    if (
      n.kind === 'mechanism' &&
      Object.values(n.size).some((v) => v <= 0 || v > 4)
    )
      fail(n.id, 'Mechanism dimensions must be positive and bounded')
    if (n.kind === 'interaction') {
      expect(n.id, n.body, 'body')
      expect(n.id, n.anchors, 'anchor_set')
      const body = nodes.find((x) => x.id === n.body),
        a = nodes.find((x) => x.id === n.anchors)
      if (body?.kind === 'body' && body.family !== 'humanoid')
        fail(n.id, 'Current participant solver requires a humanoid body')
      if (new Set(n.phases.map((p) => p.id)).size !== n.phases.length)
        fail(n.id, 'Duplicate phase ID')
      if (
        n.phases[0].op !== 'align' ||
        n.phases.slice(1, -1).some((p) => p.op !== 'contact') ||
        n.phases.at(-1)?.op !== (n.mode === 'door' ? 'actuate' : 'attach')
      )
        fail(n.id, 'Interaction must align, contact, then commit exactly once')
      if (a?.kind === 'anchor_set') {
        for (const [id, role] of [
          [n.approach, 'approach'],
          ...n.exits.map((e) => [e, 'exit']),
        ])
          if (!a.anchors.some((x) => x.id === id && x.role === role))
            fail(n.id, `Missing ${role} anchor ${id}`)
        for (const phase of n.phases) {
          if (phase.op !== 'align' && !phase.pose)
            fail(n.id, 'Contact and commit phases need poses')
          if (!phase.pose) continue
          expect(n.id, phase.pose, 'contact_pose')
          const p = nodes.find((x) => x.id === phase.pose)
          if (p?.kind === 'contact_pose') {
            if(p.anchors!==n.anchors)fail(n.id,'Pose and interaction anchor sets differ')
            if (p.body !== n.body)
              fail(n.id, 'Pose and participant body differ')
            const refs = [p.pelvis, ...p.contacts.map((c) => c.anchor)]
            if (refs.some((id) => !a.anchors.some((x) => x.id === id)))
              fail(n.id, 'Pose references missing spatial anchors')
            else {
              try {
                const solved = contactPoseAt(
                  p,
                  a,
                  { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
                  body?.kind === 'body' ? body.height : 1.8,
                )
                for (const e of solved.errors) fail(n.id, e)
              } catch (e) {
                fail(n.id, String(e))
              }
            }
          }
        }
      }
    }
    if (n.kind === 'interactive_entity') {
      expect(n.id, n.body, 'body')
      expect(n.id, n.anchors, 'anchor_set')
      if (n.motor) expect(n.id, n.motor, 'locomotor')
      if (n.mechanism) expect(n.id, n.mechanism, 'mechanism')
      for (const id of n.interactions) {
        expect(n.id, id, 'interaction')
        const i = nodes.find((x) => x.id === id),
          motor = nodes.find((x) => x.id === n.motor),
          body = nodes.find((x) => x.id === n.body)
        if (i?.kind === 'interaction') {
          if (i.anchors !== n.anchors)
            fail(n.id, 'Entity and interaction anchors differ')
          if (i.mode === 'door' && !n.mechanism)
            fail(n.id, 'Door interaction needs a mechanism')
          if (
            i.mode === 'ride' &&
            (motor?.kind !== 'locomotor' ||
              motor.type !== 'quadruped' ||
              body?.kind !== 'body' ||
              body.family !== 'quadruped')
          )
            fail(n.id, 'Ride needs quadruped body and locomotor')
          if (
            i.mode === 'drive' &&
            (motor?.kind !== 'locomotor' || motor.type !== 'vehicle')
          )
            fail(n.id, 'Drive needs vehicle locomotor')
        }
      }
    }
  }
  return errors
}
