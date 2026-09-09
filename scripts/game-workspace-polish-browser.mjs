import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const directory = 'output/game-polish'
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1360, height: 800 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto(process.env.GAME_WORKSPACE_URL ?? 'http://127.0.0.1:5192/app/game')
  await page.getByRole('button', { name: 'Open unified builder' }).click()
  await page.getByRole('button', { name: 'Prompt an ability', exact: true }).click()
  await page.getByLabel('Mechanic prompt').waitFor()
  await page.screenshot({ path: `${directory}/mechanics-desktop.png` })
  const desktop = await page.locator('.workspace-stage').evaluate(element => {
    element.scrollTop = element.scrollHeight
    return { scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, height: element.clientHeight, overflow: getComputedStyle(element).overflowY }
  })
  if (desktop.scrollTop <= 0 || desktop.overflow !== 'auto') throw Error('Desktop scroll failed')
  await page.getByRole('button', { name: 'Play primitives' }).click()
  await page.getByRole('region', { name: 'Author mechanics while playing' }).waitFor({ timeout: 30000 })
  await page.getByText('Connecting playable build').waitFor({ state: 'hidden', timeout: 40000 })
  await page.locator('.workspace-stage').evaluate(element => element.scrollTop = 0)
  await page.screenshot({ path: `${directory}/build-desktop.png` })
  await page.getByLabel('Mechanic prompt').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${directory}/sandbox-desktop.png` })
  await page.setViewportSize({ width: 640, height: 640 })
  await page.getByLabel('Mechanic prompt').scrollIntoViewIfNeeded()
  const narrow = await page.locator('.workspace-stage').evaluate(element => ({ scrollTop: element.scrollTop, width: element.clientWidth, scrollWidth: element.scrollWidth }))
  if (narrow.scrollTop <= 0 || narrow.scrollWidth > narrow.width + 1) throw Error('Narrow scrolling/overflow failed')
  await page.screenshot({ path: `${directory}/sandbox-narrow.png` })
  await writeFile(`${directory}/ui-report.json`, JSON.stringify({ desktop, narrow, errors }, null, 2))
  console.log(JSON.stringify({ desktop, narrow, errors }))
  if (errors.length) throw Error('Browser errors')
} catch (error) {
  console.log((await page.locator('body').innerText()).slice(-4500))
  throw error
} finally {
  await browser.close()
}
