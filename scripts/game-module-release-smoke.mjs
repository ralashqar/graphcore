import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const directory = 'output/game-module-live'
const status = JSON.parse(await readFile(`${directory}/status.json`, 'utf8'))
const buildId = status.activeBuildId
if (!buildId) throw new Error('No accepted module build')
const url = `https://graphcore-game-preview.fly.dev/?release=${buildId}`
const errors = []
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(message.text()) })
  await page.goto(url)
  await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Stamina'), undefined, { timeout: 90000 })
  await page.locator('canvas').click({ position: { x: 650, y: 550 } })
  // Saving requires a quiet grounded checkpoint, including NPC actions.
  for (let i = 0; i < 8; i++) { await page.keyboard.press('f'); await page.waitForTimeout(700) }
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const saved = await page.evaluate(id => Boolean(localStorage.getItem(`graphcore.game.save.${id}`)), buildId)
  if (!saved || errors.length) throw new Error(JSON.stringify({ saved, errors }))
  await mkdir(directory, { recursive: true })
  await page.screenshot({ path: `${directory}/published.png` })
  await writeFile(`${directory}/published.json`, JSON.stringify({ url, saved, errors }, null, 2))
  console.log(JSON.stringify({ url, saved, errors }))
} finally { await browser.close() }
