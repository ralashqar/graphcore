// Browser UI acceptance against an isolated in-memory command adapter.
import {build} from 'esbuild'
import {chromium} from 'playwright'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createServer} from 'node:http'
const directory='output/game-motion-sets-browser';await mkdir(directory,{recursive:true})
const fixture=JSON.parse(await readFile('output/game-fabric-kimodo/runtime/candidate.json','utf8'))
const data={rigs:fixture.manifest.animations.rigs,sets:[],runs:[],children:[]}
const css=await readFile('src/styles/features/game-builder.css','utf8')
await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{MotionSetsWorkspace}from'./src/features/game-builder/MotionSetsWorkspace';import{motionSetRevision}from'./src/domain/game/v3/motionSets';
window.fixtureData=${JSON.stringify(data)};window.fixtureCommands=[];window.fixtureRevision=1;function App(){const [revision,setRevision]=useState(1);return <MotionSetsWorkspace projectId=${JSON.stringify(fixture.manifest.projectId)} draftId=${JSON.stringify(fixture.manifest.draftId)} revision={revision} design={${JSON.stringify(fixture.manifest.design)}} actor=${JSON.stringify(fixture.manifest.animations.graphs[0].actorDefinition)} data={window.fixtureData} accepted={[]} graphs={[]} providers={{kimodo:{enabled:false,reservationCents:100},motionbricks:{enabled:false,reservationCents:100}}} jobs={[]} onChanged={async()=>setRevision(++window.fixtureRevision)} onInspect={()=>{}}/>}createRoot(document.getElementById('root')).render(<App/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'esm',outfile:`${directory}/app.js`,jsx:'automatic',plugins:[{name:'fixture-api',setup(b){b.onLoad({filter:/src[\\/]data[\\/](auth|gameRepository)\.ts$/},args=>({loader:'js',contents:args.path.endsWith('auth.ts')?`export async function getCurrentSession(){return{user:{id:'ui-fixture'}}}`:`import{motionSetRevision}from'../domain/game/v3/motionSets';export async function invokeGame(_,command){window.fixtureCommands.push(command);if(command.action==='generate_animation_set')throw Error('Paid request forbidden');if(command.action==='save_motion_set')window.fixtureData={...window.fixtureData,sets:[...window.fixtureData.sets,{definition:command.definition,revision:await motionSetRevision(command.definition)}]};return {revision:window.fixtureRevision+1}}`,resolveDir:new URL('../src/data',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')}))}}]})
const server=createServer(async(req,res)=>{if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(`${directory}/app.js`));return}res.setHeader('Content-Type','text/html');res.end(`<meta charset="utf-8"><style>${css}</style><div class="game-workspace" id="root"></div><script type="module" src="/app.js"></script>`)})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[]
page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`)
 await page.getByLabel('Equipment',{exact:true}).selectOption('one_handed_sword')
 await page.getByRole('button',{name:'Save locomotion component',exact:true}).click()
 await page.waitForFunction(()=>window.fixtureCommands.some(c=>c.action==='save_motion_set'))
 if(await page.getByRole('button',{name:'Activate reviewed set'}).first().isEnabled())throw Error('Unreviewed set can activate')
 await page.getByRole('button',{name:'Select available missing motions'}).first().click()
 if(await page.getByRole('button',{name:/Generate selected/}).first().isEnabled())throw Error('Disabled provider admits generation')
 await page.getByLabel('Gait style',{exact:true}).selectOption('zombie')
 if(!await page.getByText('This archetype gait has no validated target-rig adapter').first().isVisible())throw Error('Style capability gap hidden')
 await page.setViewportSize({width:390,height:780});await page.getByText('Setup allowance:',{exact:false}).scrollIntoViewIfNeeded()
 if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1))throw Error('Mobile layout overflows horizontally')
 await page.screenshot({path:`${directory}/mobile.png`,fullPage:true})
 const commands=await page.evaluate(()=>window.fixtureCommands);if(commands.some(c=>c.action==='generate_animation_set')||errors.length)throw Error(JSON.stringify({commands,errors}))
 await writeFile(`${directory}/report.json`,JSON.stringify({passed:true,commands:commands.map(c=>c.action),errors},null,2));console.log('Motion-set save, review gates, provider gates, capability gaps and mobile scrolling passed.')
}catch(e){console.error(JSON.stringify({errors,body:await page.locator('body').innerText()}));throw e}finally{await browser.close();server.close()}
