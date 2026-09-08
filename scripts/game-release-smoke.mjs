import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const status = JSON.parse(await readFile('output/game-live/status.json', 'utf8'))
const build = status.builds.filter(build => build.status === 'accepted').at(-1)
if (!build) throw new Error('No accepted fixture build')
const url = `https://graphcore-game-preview.fly.dev/?release=${build.id}`
const errors = [], assets = []
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(message.text()) })
  page.on('response', response => { if (new URL(response.url()).pathname.endsWith('.glb')) assets.push({ status: response.status() }) })
  await page.goto(url)
  await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Stamina'), undefined, { timeout: 90000 })
  await page.locator('canvas').click({ position: { x: 650, y: 550 } })
  await page.keyboard.down('w'); await page.waitForTimeout(700); await page.keyboard.up('w')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const saved = await page.evaluate(id => Boolean(localStorage.getItem(`graphcore.game.save.${id}`)), build.id)
  if (!saved || assets.length < 2 || assets.some(asset => asset.status !== 200) || errors.length) throw new Error(JSON.stringify({ saved, assets, errors }))
  await mkdir('output/game-live', { recursive: true })
  await page.screenshot({ path: 'output/game-live/published.png' })
  await writeFile('output/game-live/published.json', JSON.stringify({ url, saved, assets, errors }, null, 2))
  console.log(JSON.stringify({ url, saved, loadedAssets: assets.length, errors }))
} finally { await browser.close() }
