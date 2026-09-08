import { chromium } from 'playwright'
import { readFile,writeFile } from 'node:fs/promises'
import { acceptUnifiedGame } from './game-unified-browser.mjs'
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
try{for(const preset of ['courier','observatory']){
  const directory=`output/game-unified-live-${preset}`,status=JSON.parse(await readFile(`${directory}/status.json`,'utf8')),buildId=status.workspace.active_build_id
  if(!buildId)throw new Error('Accepted build missing')
  const url=`https://graphcore-game-preview.fly.dev/?release=${buildId}`,reports=[],errors=[],page=await browser.newPage({viewport:{width:1280,height:800}})
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon'))errors.push(m.text())})
  try{await page.goto(`${url}&acceptance=1`);await page.waitForFunction(()=>window.__gameAcceptance?.ready,undefined,{timeout:90000});await acceptUnifiedGame(page,reports,status.workspace.design);await page.screenshot({path:`${directory}/published.png`});await writeFile(`${directory}/release-report.json`,JSON.stringify({url,reports,errors},null,2));if(errors.length||reports.some(r=>!r.passed))throw new Error(JSON.stringify({reports,errors}));console.log(JSON.stringify({preset,url,checks:reports.length,errors}))}finally{await page.close()}
}}finally{await browser.close()}
