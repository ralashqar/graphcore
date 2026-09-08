import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
const directory = 'output/game-workspace-smoke'
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = []
page.on('pageerror', e => errors.push(e.message))
try {
  await page.goto(`${process.env.GAME_APP_ORIGIN ?? 'http://localhost:5173'}/app/game`)
  await page.getByRole('button', { name: 'Explore the adventure template' }).waitFor({ timeout: 90000 })
  await page.getByRole('button', { name: 'Explore the adventure template' }).click()
  await page.screenshot({ path: `${directory}/overview.png` })
  await page.getByRole('button', { name: 'Systems', exact: true }).click()
  await page.getByText('Movement & camera', { exact: false }).first().click()
  await page.getByRole('button', { name: 'Open workflow' }).click()
  await page.screenshot({ path: `${directory}/systems.png` })
  await page.getByRole('button', { name: 'Levels', exact: true }).click()
  await page.screenshot({ path: `${directory}/levels.png` })
  await page.getByRole('button', { name: 'Assets', exact: true }).click()
  await page.screenshot({ path: `${directory}/assets.png` })
  if (errors.length) throw new Error(errors.join('\n'))
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` })
  await writeFile(`${directory}/failure.txt`, (await page.locator('body').innerText()).slice(0, 10000))
  throw error
} finally { await browser.close() }
