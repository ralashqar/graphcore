export async function acceptUnifiedGame(page, reports, design) {
  const playerDefinition=design.nodes.find(n=>n.id===design.nodes.find(a=>a.id===design.player)?.definition)
  const attackId=playerDefinition?.abilities.find(id=>design.nodes.some(n=>n.id===id&&n.op==='bolt'))??playerDefinition?.abilities.find(id=>design.nodes.some(n=>n.id===id&&n.op==='strike'))
  const attackSlot=playerDefinition?.abilities.indexOf(attackId)??-1
  const attackKey=design.mechanics?.actions?.some(p=>p.capability==='combo')&&attackSlot>=0?String(attackSlot+1):'f'
  const state = () => page.evaluate(() => window.__gameAcceptance.state())
  const idle = (ms) => page.waitForTimeout(ms)
  await page.locator('canvas').focus()
  const stop = async () => {
    for (const key of ['w', 'a', 's', 'd']) await page.keyboard.up(key)
  }
  async function direct(point, tolerance = 0.2) {
    const deadline = Date.now() + 25000
    let lastAttack = 0
    let previous = ''
    try {
      while (Date.now() < deadline) {
        const s = await state(),
          p = s.actors.find((a) => a.id === s.player),
          dx = point.x - p.position.x,
          dz = point.z - p.position.z
        if (Math.hypot(dx, dz) < tolerance) return
        if (
          Date.now() - lastAttack > 650 &&
          s.actors.some(
            (a) =>
              a.health > 0 &&
              design.nodes.some(
                (n) =>
                  n.kind === 'actor_instance' &&
                  n.id === a.id &&
                  design.nodes.some(
                    (d) => d.id === n.definition && d.team === 'hostile',
                  ),
              ) &&
              Math.hypot(
                a.position.x - p.position.x,
                a.position.z - p.position.z,
              ) < 12,
          )
        ) {
          await page.keyboard.press(attackKey)
          lastAttack = Date.now()
        }
        const key =
          Math.abs(dx) > Math.abs(dz)
            ? dx > 0
              ? 'd'
              : 'a'
            : dz > 0
              ? 'w'
              : 's'
        if (key !== previous) {
          if (previous) await page.keyboard.up(previous)
          await page.keyboard.down(key)
          previous = key
        }
        await idle(40)
      }
      throw new Error(
        `Route timeout to ${JSON.stringify(point)}; ${JSON.stringify((await state()).actors)}`,
      )
    } finally {
      await stop()
    }
  }
  async function walk(point) {
    const s = await state()
    if (s.interactions?.sessions[s.player]?.attached) {
      await direct(point, 1)
      await idle(800)
      return
    }
    const path = await page.evaluate(
      (p) => window.__gameAcceptance.pathToPoint(p),
      point,
    )
    if (!path) throw new Error(`No route to ${JSON.stringify(point)}`)
    const corners = path.filter(
      (p, i) =>
        i === 0 ||
        i === path.length - 1 ||
        p.x - path[i - 1].x !== path[i + 1].x - p.x ||
        p.z - path[i - 1].z !== path[i + 1].z - p.z,
    )
    for (const p of corners) await direct(p)
  }
  async function point(id) {
    const n = design.nodes.find((n) => n.id === id),
      s = await state()
    if (n.kind === 'dialogue') return point(n.actor)
    if (n.kind === 'actor_instance') {
      const a = s.actors.find((a) => a.id === id)
      return { ...a.position, z: a.position.z - 1.2 }
    }
    if (n.kind === 'interactive_entity') {
      const interaction = design.nodes.find((i) => i.id === n.interactions[0]),
        anchors = design.nodes.find((a) => a.id === n.anchors),
        anchor = anchors.anchors.find((a) => a.id === interaction.approach),
        t = s.interactions.entities[id],
        c = Math.cos(t.yaw),
        sin = Math.sin(t.yaw)
      return {
        x: t.position.x + anchor.position.x * c + anchor.position.z * sin,
        z: t.position.z - anchor.position.x * sin + anchor.position.z * c,
      }
    }
    return n.position
  }
  async function dismount() {
    const s = await state()
    if (s.interactions?.sessions[s.player]) {
      await idle(800)
      await page.keyboard.press('c')
      await idle(700)
      const next = await state()
      if (next.interactions.sessions[next.player])
        throw new Error('Exit blocked')
    }
  }
  const objectives = design.nodes.filter((n) => n.kind === 'objective')
  for (let attempt = 0; attempt < objectives.length * 2; attempt++) {
    const s = await state()
    if (s.complete) break
    const o = objectives.find(
      (o) =>
        !s.mission.completed.includes(o.id) &&
        o.prerequisites.every((p) => s.mission.completed.includes(p)),
    )
    if (!o) throw new Error('No next objective')
    if (o.op !== 'reach') await dismount()
    if (o.op === 'defeat') {
      const initial = (await state()).actors.find((a) => a.id === o.target)
      await walk({ x: initial.position.x, z: initial.position.z - 4 })
      for (let i = 0; i < 45; i++) {
        const s = await state(),
          enemy = s.actors.find((a) => a.id === o.target),
          player = s.actors.find((a) => a.id === s.player)
        if (enemy.health === 0) break
        if (player.health === 0) throw new Error('Player died')
        const dx = enemy.position.x - player.position.x,
          dz = enemy.position.z - player.position.z,
          d = Math.hypot(dx, dz)
        const desired = { w: dz > 0, s: dz < 0, d: dx > 0, a: dx < 0 }
        // Face via real movement, then fire; no aim/state-write probe.
        const keys = Object.entries(desired)
          .filter(
            ([k, v]) =>
              v &&
              (k === 'w' || k === 's'
                ? Math.abs(dz) > Math.abs(dx) * 0.4
                : Math.abs(dx) > Math.abs(dz) * 0.4),
          )
          .map(([k]) => k)
        if (d > 5) {
          for (const k of keys) await page.keyboard.down(k)
          await idle(180)
          await stop()
        }
        await page.keyboard.press(attackKey)
        await idle(650)
      }
    } else {
      await walk(await point(o.target))
      if (o.op !== 'reach') await page.keyboard.press('e')
      await idle(o.op === 'interact' ? 2300 : 300)
    }
    const passed = (await state()).mission.completed.includes(o.id)
    reports.push({
      nodeKey: o.id,
      passed,
      message: `Keyboard objective: ${o.label}`,
    })
    if (!passed)
      throw new Error(
        `Objective failed: ${o.id}: ${JSON.stringify((await state()).events.slice(-4))}`,
      )
  }
  for (const e of design.nodes.filter((n) => n.kind === 'interactive_entity')) {
    await dismount()
    if (!(await state()).mission.used.includes(e.id)) {
      await walk(await point(e.id))
      await page.keyboard.press('e')
      await idle(2300)
    }
    reports.push({
      nodeKey: e.id,
      passed: (await state()).mission.used.includes(e.id),
      message: 'Instanced recipe exercised',
    })
  }
  await dismount()
  await idle(1000)
  await page.locator('#save').click()
  await page.locator('#restart').click()
  const reset = !(await state()).complete
  await page.locator('#load').click()
  reports.push({
    nodeKey: 'checkpoint',
    passed: reset && (await state()).complete,
    message: 'Save/restart/load restores mission',
  })
}
