import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
import { chromium } from 'playwright'
import { acceptModuleGame } from './game-module-browser.mjs'
import { acceptUnifiedGame } from './game-unified-browser.mjs'
import { acceptMechanicGame } from './game-mechanic-browser-acceptance.mjs'

const directory = resolve(process.argv[2] ?? ''), runtime = resolve('dist-game')
if (!process.argv[2]) throw new Error('Candidate directory is required')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' }
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const root = path === '/candidate.json' || path.startsWith('/staged/') ? directory : runtime
    const relative = path === '/' ? 'index.html' : path.replace(/^\/staged\//, '').replace(/^\//, '')
    const file = resolve(root, relative)
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return }
    const data = await readFile(file)
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(data)
  } catch { response.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`, reports = [], errors = []
let browser, page
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(message.text()) })
  await page.goto(`${origin}/?acceptance=1`)
  await page.waitForFunction(() => window.__gameAcceptance?.ready || window.__gameAcceptance?.error, undefined, { timeout: 45000 })
  const loadError = await page.evaluate(() => window.__gameAcceptance?.error)
  if (loadError) throw new Error(loadError)
  if (await page.evaluate(() => window.__gameAcceptance.version === 3)) {
    const candidate = JSON.parse(await readFile(resolve(directory, 'candidate.json'), 'utf8'))
    await acceptUnifiedGame(page,reports,candidate.manifest.design)
    await acceptMechanicGame(page,reports,candidate.manifest.design)
    if (process.argv.includes('--locomotion') || process.argv.includes('--partial-locomotion')) {
      await page.locator('#restart').click()
      await page.locator('canvas').focus()
      const hold = async (keys, ms) => {
        try { for (const key of keys) await page.keyboard.down(key); await page.waitForTimeout(ms) }
        finally { for (const key of [...keys].reverse()) await page.keyboard.up(key) }
        await page.waitForTimeout(200)
      }
      for (let i = 0; i < 3; i++) {
        await hold(['w'], 1800)
        await hold(['AltLeft', 's'], 1800)
        await hold(['ShiftLeft', 'w'], 900)
        await hold(['AltLeft', 's'], 2400)
        await hold(['AltLeft', 'a'], 1800)
        await hold(['AltLeft', 'd'], 1800)
      }
      await page.waitForTimeout(4500)
      const metrics = await page.evaluate(() => window.__gameAcceptance.metrics())
      const requiredStates = process.argv.includes('--partial-locomotion')
        ? [...new Set(candidate.manifest.animations.graphs.flatMap(g=>g.bindings.map(b=>b.state)))]
        : ['idle', 'walk', 'run', 'backward', 'strafe_left', 'strafe_right']
      for (const state of requiredStates) {
        const key = `${candidate.manifest.design.player}:${state}`
        reports.push({ nodeKey: `animations.loop.${state}`, passed: (metrics.animationLoops?.[key] ?? 0) >= 2, message: 'Real-keyboard movement repeatedly played the baked loop', measured: { loops: metrics.animationLoops?.[key] ?? 0 } })
      }
      if (process.argv.includes('--partial-locomotion')) {
        await page.locator('#save').click()
        const saved = await page.evaluate(()=>{const s=window.__gameAcceptance.state();return s.actors.find(a=>a.id===s.player).position})
        await page.reload()
        await page.waitForFunction(()=>window.__gameAcceptance?.ready,undefined,{timeout:45000})
        await page.locator('#load').click()
        const loaded = await page.evaluate(()=>{const s=window.__gameAcceptance.state();return s.actors.find(a=>a.id===s.player).position})
        reports.push({nodeKey:'animations.offline_restore',passed:Math.hypot(saved.x-loaded.x,saved.z-loaded.z)<.02,message:'Fresh-page checkpoint restoration with every external origin blocked',measured:{saved,loaded}})
      }
    }
    if (candidate.manifest.animations) {
      const metrics = await page.evaluate(() => window.__gameAcceptance.metrics())
      reports.push({ nodeKey: 'animations.load', passed: !metrics.animationLoadFailed && metrics.animationBindings === metrics.expectedAnimationBindings, message: 'Frozen animation bindings loaded on the supported rig', measured: metrics })
    }
  } else if (await page.evaluate(() => window.__gameAcceptance.version === 2)) {
    const candidate = JSON.parse(await readFile(resolve(directory, 'candidate.json'), 'utf8'))
    await acceptModuleGame(page, reports, candidate.manifest.design)
  } else {
  reports.push({ nodeKey: 'runtime', passed: true, message: 'Babylon scene and all bound GLBs loaded in isolated Chromium' })
  await page.locator('canvas').click({ position: { x: 650, y: 550 } })
  const state = () => page.evaluate(() => window.__gameAcceptance.state())
  const walk = async role => {
    const path = await page.evaluate(role => window.__gameAcceptance.pathTo(role), role)
    if (!path) throw new Error(`No path to ${role}`)
    const turns = path.filter((p, i) => i === 0 || i === path.length - 1 || ((p.x - path[i-1].x) !== (path[i+1].x - p.x) || (p.z - path[i-1].z) !== (path[i+1].z - p.z)))
    for (const point of turns) {
      const deadline = Date.now() + 12000
      let previous = ''
      try {
        while (Date.now() < deadline) {
          const s = await state(), dx = point.x - s.position.x, dz = point.z - s.position.z
          if (Math.hypot(dx, dz) < .15) break
          const code = Math.abs(dx) > Math.abs(dz) ? dx > 0 ? 'd' : 'a' : dz > 0 ? 'w' : 's'
          if (code !== previous) { if (previous) await page.keyboard.up(previous); await page.keyboard.down(code); previous = code }
          await page.waitForTimeout(35)
        }
        if (Date.now() >= deadline) throw new Error(`Player stuck on route to ${role}: target=${JSON.stringify(point)} state=${JSON.stringify(await state())}`)
      } finally { if (previous) await page.keyboard.up(previous) }
    }
    await page.keyboard.press('e'); await page.waitForTimeout(100)
  }
  await walk('door')
  reports.push({ nodeKey: 'quest', passed: !(await state()).doorOpen, message: 'Real input cannot unlock gate without key' })
  await walk('key'); await walk('door'); await walk('goal')
  reports.push({ nodeKey: 'quest', passed: (await state()).complete, message: 'Keyboard playthrough completed objective through collision-aware traversal' })
  const measured = await page.evaluate(() => ({ ...window.__gameAcceptance.metrics(), boundPlayer: window.__gameAcceptance.boundPlayer }))
  reports.push({ nodeKey: 'presentation', passed: measured.meshes <= 300 && measured.vertices <= 1000000, message: 'Desktop geometry budget', measured })
  if (measured.boundPlayer) reports.push({ nodeKey: 'player', passed: ['player.Idle', 'player.Walk'].every(clip => measured.playedClips.includes(clip)), message: 'Imported template rig played Idle and Walk clips' })
  await page.locator('#save').click(); await page.locator('#restart').click()
  const reset = !(await state()).complete
  await page.locator('#load').click()
  reports.push({ nodeKey: 'persistence', passed: reset && (await state()).complete, message: 'Browser save, restart and load restore the completed game' })
  }
  await page.screenshot({ path: resolve(directory, 'playthrough.png') })
  reports.push({ nodeKey: 'runtime', passed: errors.length === 0, message: errors.length ? errors.join('\n') : 'No browser runtime errors' })
} catch (error) { reports.push({ nodeKey: 'runtime', passed: false, message: String(error) }); await page?.screenshot({ path: resolve(directory, 'playthrough.png') }).catch(() => {}) }
finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); await writeFile(resolve(directory, 'report.json'), JSON.stringify({ reports }, null, 2)) }
if (reports.some(r => !r.passed)) process.exitCode = 1
