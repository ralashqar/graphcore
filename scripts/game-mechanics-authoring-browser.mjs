import { performanceRecipe } from '../src/domain/game/v3/performance.ts'
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile,writeFile,mkdir } from 'node:fs/promises'
import { createUnified } from '../src/domain/game/v3/recipes.ts'
import { of } from '../src/domain/game/v3/spec.ts'
import { actionRecipe } from '../src/domain/game/v3/actionMechanics.ts'
const performance=process.argv.includes('--performance')
const directory=performance?'output/game-performance-authoring':'output/game-mechanics-authoring',design=createUnified('exploration'),projectId=crypto.randomUUID(),draftId=crypto.randomUUID()
const stylesheet=await readFile('src/styles/features/game-builder.css','utf8')
of(design,'world')[0].boxes.push({id:'wall',position:{x:1,y:3,z:0},size:{x:1,y:6,z:12},ramp:false})
const proposal={version:1,sourceRevision:1,explanation:'Reviewed combo and dash proposal',unsupported:[],bundle:{version:1,packages:[],surfaces:[],actions:[actionRecipe('combo','character.player'),actionRecipe('dash','character.player')]}}
if(performance){proposal.bundle.performance=performanceRecipe('uppercut','character.player',['character.guard']);proposal.bundle.motionProfile='motion-1.0.0'}
await mkdir(directory,{recursive:true})
await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{MechanicsWorkspace}from'./src/features/game-builder/MechanicsWorkspace';import '@xyflow/react/dist/style.css';function App(){const[n,setN]=useState(0);return <MechanicsWorkspace projectId="${projectId}" draftId="${draftId}" revision={1} design={${JSON.stringify(design)}} blocked={false} credits={25} jobId={n?"${crypto.randomUUID()}":undefined} onChanged={async()=>setN(n+1)}/>};createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,format:'esm',outfile:`${directory}/app.js`,jsx:'automatic',plugins:[{name:'isolated-commands',setup(b){b.onLoad({filter:/src[\\/]data[\\/](auth|gameRepository|gameModuleRepository)\.ts$/},args=>({loader:'js',contents:args.path.endsWith('auth.ts')?`export async function getCurrentSession(){return{user:{id:'fixture-owner'}}}`:args.path.endsWith('gameModuleRepository.ts')?`export async function readSteps(){return{steps:[{node_id:'mechanic.review',status:'completed'}],plan:${JSON.stringify(proposal)}}}`:`window.commands=[];export async function invokeGame(name,command){window.commands.push(command);if(!['plan_mechanic','materialize_mechanic'].includes(command.action))throw Error('Unexpected action');return{revision:1}}`}))}}]})
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;try{if(path==='/'){res.setHeader('Content-Type','text/html');return res.end(`<link rel="stylesheet" href="/app.css"><style>body{margin:0;font-family:Arial,sans-serif}${stylesheet}</style><main id="root" class="game-workspace"></main><script type="module" src="/app.js"></script>`)}if(!['/app.js','/app.css'].includes(path))return res.writeHead(404).end();res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'text/css');res.end(await readFile(directory+path))}catch{res.writeHead(500).end()}})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1300,height:950}}),errors=[]
page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`)
 await page.getByLabel('Actor',{exact:true}).selectOption('character.player',{timeout:10000})
 await page.getByLabel('Mechanic prompt').fill('Give this character a three-hit tap combo and forward dash.')
 await page.getByRole('button',{name:'Plan mechanic · 25 design credits'}).click()
 await page.getByText('Reviewed combo and dash proposal',{exact:true}).waitFor()
 const before=await page.evaluate(()=>window.commands)
 if(before.length!==1||before[0].action!=='plan_mechanic'||before[0].surfaces.length)throw Error('Planning activated a mechanic')
 await page.getByLabel('Mechanic package').selectOption('action.dash')
 await page.getByText(performance?'accelerate → travel → brake':'fixed facing displacement',{exact:false}).first().waitFor()
 if(performance){await page.getByRole('button',{name:'Pause poses'}).click();await page.getByLabel('Pose timeline').fill('0.4');await page.getByLabel('Show effector targets and contacts').check();await page.getByText('Behavior and animation graph',{exact:true}).click();if(await page.getByRole('alert').count())throw Error('Pose validation failed in review')}
 await page.getByRole('button',{name:'Accept proposal into design'}).click()
 await page.waitForFunction(()=>window.commands.length===2)
 const commands=await page.evaluate(()=>window.commands)
 if(commands[1].action!=='materialize_mechanic'||errors.length)throw Error(JSON.stringify({commands,errors}))
 await page.screenshot({path:`${directory}/mechanics.png`,fullPage:true})
 await writeFile(`${directory}/report.json`,JSON.stringify({passed:true,actions:commands.map(c=>c.action),errors},null,2))
 console.log('Actual Mechanics workspace prompt, graph, review and materialization passed with an isolated command API; no GPU commands.')
}catch(error){console.error(JSON.stringify({errors,body:await page.locator('body').innerText()}));throw error}finally{await browser.close();await new Promise(r=>server.close(r))}
