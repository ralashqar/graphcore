import {acceptTraversalComponents} from './game-traversal-browser-acceptance.mjs'
import {createServer} from 'node:http'
import {readFile,writeFile} from 'node:fs/promises'
import {resolve,sep,extname} from 'node:path'
import {chromium} from 'playwright'
const directory = resolve(process.argv[2] ?? 'output/game-fabric-kimodo/vault'), runtime = resolve('dist-game')
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

const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1280,height:800}})
const blocked=process.argv.includes('--blocked')
page.on('pageerror',e=>errors.push(e.message))
try{
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort())
 await page.goto(origin+'/?acceptance=1');await page.waitForFunction(()=>window.__gameAcceptance?.ready)
 if(!blocked){const fixture=JSON.parse(await readFile(resolve(directory,'candidate.json'),'utf8'));await acceptTraversalComponents(page,reports,fixture.manifest.design);if(reports.some(r=>!r.passed))throw Error(JSON.stringify(reports));await page.locator('#restart').click()}
 await page.locator('canvas').focus();await page.keyboard.press('e')
 if(blocked){
  await page.waitForFunction(()=>window.__gameAcceptance.state().events.some(e=>e.type==='vault_blocked'))
  const s=await page.evaluate(()=>window.__gameAcceptance.state()),p=s.actors.find(a=>a.id===s.player)
  if(Math.abs(p.position.z-7.2)>.05)throw Error('Blocked vault moved through obstacle')
 }else{
  await page.waitForFunction(()=>{const a=window.__gameAcceptance;return a.metrics().equipmentStowed[a.state().player]===true})
  await page.screenshot({path:resolve(directory,'vault-stowed.png')})
  await page.waitForFunction(()=>window.__gameAcceptance.state().events.some(e=>e.type==='vault_completed'))
  await page.keyboard.down('w');await page.waitForTimeout(350);await page.keyboard.up('w');await page.waitForTimeout(250)
  const result=await page.evaluate(()=>({state:window.__gameAcceptance.state(),metrics:window.__gameAcceptance.metrics()})),p=result.state.actors.find(a=>a.id===result.state.player)
  if(p.position.z<=8.65||result.metrics.equipmentStowed[p.id])throw Error('Vault did not restore walking/sword')
  await page.locator('#save').click();await page.locator('#restart').click();await page.locator('#load').click()
  const loaded=await page.evaluate(()=>window.__gameAcceptance.state());if(Math.abs(loaded.actors.find(a=>a.id===loaded.player).position.z-p.position.z)>.05)throw Error('Vault checkpoint did not restore')
  await page.locator('#restart').click();await page.locator('canvas').focus();await page.keyboard.press('e');await page.waitForTimeout(200);await page.keyboard.press('c')
  await page.waitForFunction(()=>window.__gameAcceptance.state().events.some(e=>e.type==='vault_cancelled'))
 }
 if(errors.length)throw Error(errors.join('; '))
 await writeFile(resolve(directory,'vault-browser.json'),JSON.stringify({passed:true,blocked,errors}));console.log('Vault keyboard, collision and equipment acceptance passed: '+directory)
}finally{await browser.close();server.close()}
