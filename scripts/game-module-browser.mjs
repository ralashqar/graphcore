import { acceptInteractions } from './game-interaction-browser.mjs'
export async function acceptModuleGame(page, reports, design) {
  const state = () => page.evaluate(() => window.__gameAcceptance.state())
  await page.locator('canvas').click({ position: { x: 750, y: 600 } })
  const walk = async (target, limit = 15000) => {
    const deadline = Date.now() + limit
    let previous = ''
    try {
      while (Date.now() < deadline) {
        const s = await state(),
          p = s.actors.find((a) => a.id === s.player),
          dx = target.x - p.position.x,
          dz = target.z - p.position.z
        if (Math.hypot(dx, dz) < 0.18) return
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
        await page.waitForTimeout(35)
      }
      throw new Error('Keyboard route timed out')
    } finally {
      if (previous) await page.keyboard.up(previous)
    }
  }
  const enemyId = design.nodes.find(
    (n) => n.kind === 'actor' && n.role === 'enemy',
  ).id
  for (let i = 0; i < 24; i++) {
    const s = await state(),
      enemy = s.actors.find((a) => a.id === enemyId),
      player = s.actors.find((a) => a.id === s.player)
    if (enemy?.health === 0) break
    if (
      design.defaultActor === 'melee' &&
      Math.hypot(
        enemy.position.x - player.position.x,
        enemy.position.z - player.position.z,
      ) > 1.7
    ) {
      await page.keyboard.down('w')
      await page.waitForTimeout(200)
      await page.keyboard.up('w')
    }
    await page.keyboard.press('f')
    await page.waitForTimeout(700)
  }
  let s = await state()
  reports.push({
    nodeKey: 'combat',
    passed: s.actors.find((a) => a.id === enemyId)?.health === 0,
    message: 'Real keyboard ability input defeats the hostile',
  })
  await page.keyboard.press('q')
  await page.waitForTimeout(1000)
  const world = design.nodes.find((n) => n.kind === 'world'),
    ledge = world.ledges[0]
  await walk({ x: (ledge.start.x + ledge.end.x) / 2, z: ledge.start.z - 0.55 })
  await page.keyboard.down('w')
  await page.keyboard.press('Space')
  await page.keyboard.up('w')
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('e')
    await page.waitForTimeout(180)
    if ((await state()).climbed) break
  }
  reports.push({
    nodeKey: 'movement',
    passed: (await state()).climbed,
    message: 'Real keyboard jump, grip and climb',
  })
  await walk(world.objective)
  await page.keyboard.press('e')
  await page.waitForTimeout(300)
  reports.push({
    nodeKey: 'scenario',
    passed: (await state()).complete,
    message: 'Objective requires combat and climb',
  })
  await page.locator('#save').click()
  await page.locator('#restart').click()
  const reset = !(await state()).complete
  await page.locator('#load').click()
  reports.push({
    nodeKey: 'persistence',
    passed: reset && (await state()).complete,
    message: 'Checkpoint save/restart/load restores completion',
  })
  const metrics = await page.evaluate(() => window.__gameAcceptance.metrics())
  reports.push({
    nodeKey: 'presentation',
    passed: metrics.meshes < 300 && metrics.vertices < 1000000,
    message: 'Primitive scene remains within geometry budget',
    measured: metrics,
  })
  await acceptInteractions(page,reports,design)
}
