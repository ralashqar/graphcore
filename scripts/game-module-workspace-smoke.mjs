import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
const directory = 'output/game-module-workspace'
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = []
page.on('pageerror', (e) => errors.push(e.message))
try {
  await page.goto(
    `${process.env.GAME_APP_ORIGIN ?? 'http://localhost:5174'}/app/game`,
  )
  await page
    .getByRole('button', { name: 'Open combat & traversal', exact: true })
    .waitFor({ timeout: 90000 })
  await page
    .getByRole('button', { name: 'Open combat & traversal', exact: true })
    .click()
  await page.getByRole('heading', { name: 'Prove the game loop.' }).waitFor()
  await page.screenshot({ path: `${directory}/overview.png` })
  await page.getByRole('button', { name: 'Inspect an ability' }).click()
  await page.getByLabel('Node view').selectOption('Behavior')
  await page.screenshot({ path: `${directory}/behavior.png` })
  await page.getByLabel('Node view').selectOption('Pose & Sockets')
  await page.getByLabel('Action phase').fill('0.7')
  await page.screenshot({ path: `${directory}/pose.png` })
  await page.getByRole('button', { name: 'Levels', exact: true }).click()
  await page.screenshot({ path: `${directory}/levels.png` })
  await page.getByRole('button',{name:'Overview',exact:true}).click()
  await page.getByRole('button',{name:'Add interaction playground',exact:true}).click()
  await page.getByLabel('Interaction target').selectOption('entity.horse')
  await page.getByLabel('Interaction phase').selectOption('2')
  await page.getByText('All contact targets are reachable.').waitFor()
  await page.screenshot({path:`${directory}/interactions.png`})
  await page.getByRole('button',{name:'Edit interaction graph',exact:true}).click()
  await page.getByLabel('Node view').selectOption('Behavior')
  await page.screenshot({path:`${directory}/interaction-behavior.png`})
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(
    'Module overview, behavior graph, pose laboratory and level views passed',
  )
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` })
  await writeFile(
    `${directory}/failure.txt`,
    (await page.locator('body').innerText()).slice(0, 6000),
  )
  throw error
} finally {
  await browser.close()
}
