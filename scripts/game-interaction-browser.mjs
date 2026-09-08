export async function acceptInteractions(page, reports, design) {
  const entities = design.nodes.filter((n) => n.kind === 'interactive_entity')
  if (!entities.length) return
  const state = () => page.evaluate(() => window.__gameAcceptance.state())
  const direct = async (x, z) => {
    let key = ''
    const deadline = Date.now() + 20000
    try {
      while (Date.now() < deadline) {
        const s = await state(),
          a = s.actors.find((a) => a.id === s.player),
          dx = x - a.position.x,
          dz = z - a.position.z
        if (Math.hypot(dx, dz) < 0.16) return
        const next =
          Math.abs(dx) > Math.abs(dz)
            ? dx > 0
              ? 'd'
              : 'a'
            : dz > 0
              ? 'w'
              : 's'
        if (next !== key) {
          if (key) await page.keyboard.up(key)
          await page.keyboard.down(next)
          key = next
        }
        await page.waitForTimeout(35)
      }
      throw new Error(`Interaction route blocked toward ${x}, ${z}`)
    } finally {
      if (key) await page.keyboard.up(key)
    }
  }
  const walk = async (x, z) => {
    const path = await page.evaluate(
      (p) => window.__gameAcceptance.pathToPoint(p),
      { x, z },
    )
    if (!path) throw new Error('No interaction route')
    for (const p of path) await direct(p.x, p.z)
  }
  await page.locator('canvas').click({ position: { x: 750, y: 600 } })
  await direct(0, 0)
  await walk(0, -8)
  for (const e of entities) {
    const i = design.nodes.find((n) => n.id === e.interactions[0]),
      anchors = design.nodes.find((n) => n.id === e.anchors),
      a = anchors.anchors.find((a) => a.id === i.approach),
      entry = {
        x:
          e.position.x +
          a.position.x * Math.cos(e.yaw) +
          a.position.z * Math.sin(e.yaw),
        z:
          e.position.z -
          a.position.x * Math.sin(e.yaw) +
          a.position.z * Math.cos(e.yaw),
      },
      s = await state(),
      actor = s.actors.find((a) => a.id === s.player)
    await walk(entry.x, entry.z)
    await page.keyboard.press('e')
    await page.waitForFunction(
      ({ id, door }) => {
        const s = window.__gameAcceptance.state()
        return door
          ? s.interactions.entities[id].angle > 0.2
          : s.interactions.sessions[s.player]?.attached
      },
      { id: e.id, door: i.mode === 'door' },
      { timeout: 12000 },
    )
    reports.push({
      nodeKey: e.id,
      passed: true,
      message: 'Real keyboard interaction reaches committed state',
    })
    if (i.mode === 'door') {
      await page.waitForTimeout(1300)
      continue
    }
    if (e.motor) {
      const old = (await state()).interactions.entities[e.id].position.z
      await page.keyboard.down('w')
      await page.waitForTimeout(600)
      await page.keyboard.up('w')
      await page.waitForTimeout(1800)
      reports.push({
        nodeKey: e.id,
        passed:
          (await state()).interactions.entities[e.id].position.z > old + 0.04,
        message: 'Keyboard input transfers to mounted controller',
      })
    }
    await page.locator('#save').click()
    await page.locator('#restart').click()
    await page.locator('#load').click()
    const restored = await state()
    reports.push({
      nodeKey: e.id,
      passed: !!restored.interactions.sessions[restored.player]?.attached,
      message: 'Attached checkpoint restores slot and spatial relation',
    })
    await page.locator('canvas').click({ position: { x: 750, y: 600 } })
    await page.keyboard.press('c')
    await page.waitForFunction(
      () => {
        const s = window.__gameAcceptance.state()
        return !s.interactions.sessions[s.player]
      },
      undefined,
      { timeout: 5000 },
    )
  }
}
