import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
const directory = 'output/game-unified-workspace'
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = []
page.on('pageerror', (e) => errors.push(e.message))
try {
  await page.goto(
    `${process.env.GAME_APP_ORIGIN ?? 'http://127.0.0.1:5176'}/app/game`,
  )
  await page
    .getByRole('button', { name: 'Open unified builder', exact: true })
    .click({ timeout: 90000 })
  await page.getByRole('heading', { name: 'Describe the game loop' }).waitFor()
  await page.screenshot({ path: `${directory}/plan.png` })
  await page.getByRole('button', { name: 'Systems', exact: true }).click()
  await page
    .getByLabel('Game definition', { exact: true })
    .selectOption('movement')
  await page.getByRole('button', { name: 'behavior', exact: true }).click()
  await page.screenshot({ path: `${directory}/systems.png` })
  await page.getByRole('button', { name: 'Interactions', exact: true }).click()
  await page.getByLabel('Interaction target').selectOption('mount')
  await page.getByLabel('Interaction phase').selectOption('2')
  await page.getByText('All contact targets are reachable.').waitFor()
  await page.screenshot({ path: `${directory}/interactions.png` })
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(
    'Unified plan, behavior graph and contact laboratory passed without page errors',
  )
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` })
  await writeFile(
    `${directory}/failure.txt`,
    (await page.locator('body').innerText()).slice(0, 8000),
  )
  throw error
} finally {
  await browser.close()
}
