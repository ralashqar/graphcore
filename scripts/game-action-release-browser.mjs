import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { acceptActionGame } from './game-action-browser-acceptance.mjs'

const id = process.argv[2]
if (!/^[a-f0-9-]{36}$/.test(id ?? '')) throw Error('Supply a published build UUID')
const directory = process.argv.includes('--motion')?'output/game-motion-release-browser':'output/game-action-release-browser'
await mkdir(directory, { recursive: true })
const response = await fetch('https://znwdatidqdkzidempvkt.supabase.co/functions/v1/get-game-release', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buildId: id }),
})
if (!response.ok) throw Error(`Release HTTP ${response.status}`)
const { manifest } = await response.json()
if (!['gameplay-3.3.0','gameplay-3.4.0'].includes(manifest.runtimeVersion) || manifest.design.mechanics?.actions?.length !== 2) throw Error('Expected published combo/dash fixture')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext(), page = await context.newPage(), errors = [], providerCalls = [], reports = []
await context.route(/(runpod\.(ai|io)|fal\.(ai|run))/, route => { providerCalls.push(route.request().url().split('?')[0]); return route.abort() })
page.on('pageerror', e => errors.push(e.message))
try {
  await page.goto(`https://graphcore-game-preview.fly.dev/?release=${id}&acceptance=1`)
  await page.waitForFunction(() => window.__gameAcceptance?.ready, undefined, { timeout: 90000 })
  await acceptActionGame(page, reports, manifest.design)
  const presentation=await page.evaluate(()=>window.__gameAcceptance.metrics())
  if(manifest.runtimeVersion==='gameplay-3.4.0'&&(!presentation.somaActors?.includes(manifest.design.player)||!presentation.proceduralFrames))throw Error('SOMA procedural presentation did not run')
  const before = await page.evaluate(() => window.__gameAcceptance.state())
  await page.locator('#save').click()
  await page.reload()
  await page.waitForFunction(() => window.__gameAcceptance?.ready, undefined, { timeout: 90000 })
  await page.locator('#load').click()
  const after = await page.evaluate(() => window.__gameAcceptance.state()), metrics = await page.evaluate(() => window.__gameAcceptance.metrics())
  const a = after.actors.find(a => a.id === after.player), b = before.actors.find(a => a.id === before.player)
  const restored = after.buildId === id && JSON.stringify(after.mission) === JSON.stringify(before.mission) && Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) < .01
  const passed = restored && reports.every(r => r.passed) && !errors.length && !providerCalls.length && metrics.animationBindings === 6 && !metrics.animationLoadFailed
  await page.screenshot({ path: `${directory}/published.png` })
  await writeFile(`${directory}/report.json`, JSON.stringify({ passed, buildId: id, restored, reports, metrics, presentation, errors, providerCalls }, null, 2))
  if (!passed) throw Error('Published action playback/checkpoint acceptance failed')
  console.log('Published combo/dash, six existing clip bindings and fresh-page checkpoint restoration passed with inference blocked.')
} finally { await browser.close() }
