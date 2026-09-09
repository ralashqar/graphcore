import { chromium } from 'playwright'
import { mkdir,writeFile } from 'node:fs/promises'
import { acceptUnifiedGame } from './game-unified-browser.mjs'
import { acceptMechanicGame } from './game-mechanic-browser-acceptance.mjs'
const id=process.argv[2]
if(!/^[a-f0-9-]{36}$/.test(id??''))throw Error('Supply an accepted published build UUID')
const directory='output/game-animation-release-browser';await mkdir(directory,{recursive:true})
const endpoint='https://znwdatidqdkzidempvkt.supabase.co/functions/v1/get-game-release'
const release=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({buildId:id})}).then(r=>{if(!r.ok)throw Error(`Release HTTP ${r.status}`);return r.json()})
if(release.manifest.animations?.graphs[0]?.bindings.length!==6)throw Error('Published animation snapshot is missing')
const browser=await chromium.launch({headless:true}),context=await browser.newContext(),page=await context.newPage(),errors=[],providerCalls=[]
await context.route(/(runpod\.(ai|io)|fal\.(ai|run))/,route=>{providerCalls.push(route.request().url().split('?')[0]);return route.abort()})
page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto(`https://graphcore-game-preview.fly.dev/?release=${id}&acceptance=1`)
 await page.waitForFunction(()=>window.__gameAcceptance?.ready,{},{timeout:90000})
 const reports=[];await acceptUnifiedGame(page,reports,release.manifest.design)
 await acceptMechanicGame(page,reports,release.manifest.design)
 const metrics=await page.evaluate(()=>window.__gameAcceptance.metrics())
 await page.reload();await page.waitForFunction(()=>window.__gameAcceptance?.ready,{},{timeout:90000})
 await page.locator('#load').click()
 const restored=await page.evaluate(()=>window.__gameAcceptance.state().complete)
 const passed=restored&&reports.every(r=>r.passed)&&!errors.length&&!providerCalls.length&&metrics.animationBindings===6&&!metrics.animationLoadFailed
 await page.screenshot({path:`${directory}/published.png`})
 await writeFile(`${directory}/report.json`,JSON.stringify({passed,buildId:id,restored,reports,metrics,errors,providerCalls},null,2))
 if(!passed)throw Error('Published motion acceptance failed; inspect report')
 console.log('Published six-clip gameplay and fresh-page checkpoint restoration passed without inference access.')
}finally{await browser.close()}
