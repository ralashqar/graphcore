import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
import { acceptModuleGame } from './game-module-browser.mjs'
const directory='output/game-interactions-live',status=JSON.parse(await readFile(`${directory}/status.json`,'utf8'))
if(!status.activeBuildId||status.nodeCount!==47)throw new Error('No accepted interaction fixture')
const url=`https://graphcore-game-preview.fly.dev/?release=${status.activeBuildId}`,reports=[],errors=[]
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
try{const page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon'))errors.push(m.text())})
 await page.goto(`${url}&acceptance=1`);await page.waitForFunction(()=>window.__gameAcceptance?.ready,undefined,{timeout:90000})
 await acceptModuleGame(page,reports,status.design);await page.screenshot({path:`${directory}/published.png`});await writeFile(`${directory}/published.json`,JSON.stringify({url,reports,errors},null,2));if(errors.length||reports.some(r=>!r.passed))throw new Error(JSON.stringify({reports,errors}));console.log(JSON.stringify({url,checks:reports.length,errors}))
}finally{await browser.close()}
