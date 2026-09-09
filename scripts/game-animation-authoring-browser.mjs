// Browser component acceptance with an explicitly isolated, in-memory command API.
// Hosted ownership and command behavior are verified separately by SQL/live tests.
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
const directory='output/game-animation-authoring-browser'
const stylesheet=await readFile('src/styles/features/game-builder.css','utf8')
await mkdir(directory,{recursive:true})
const fixture=JSON.parse(await readFile('output/game-animation-locomotion-browser/candidate.json','utf8'))
const data={rig:fixture.manifest.animations.rigs[0],enabled:false,reservationCents:100,recipes:[],jobs:[],graphs:[],reviews:[],candidates:fixture.manifest.assets.map(clip=>({id:clip.id,job_id:clip.id,clip,diagnostics:{failures:[],metrics:clip.validation.metrics}})),urls:Object.fromEntries(fixture.manifest.assets.map(c=>[c.id,`/${c.state}.glb`]))}
await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {AnimationsWorkspace} from './src/features/game-builder/AnimationsWorkspace';createRoot(document.getElementById('root')).render(React.createElement(AnimationsWorkspace,{projectId:${JSON.stringify(fixture.manifest.projectId)},draftId:${JSON.stringify(fixture.manifest.draftId)},revision:1,design:${JSON.stringify(fixture.manifest.design)},onChanged:async()=>{}}));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',outfile:`${directory}/app.js`,jsx:'automatic',plugins:[{name:'isolated-command-fixture',setup(b){
 b.onLoad({filter:/src[\\/]data[\\/](auth|gameRepository)\.ts$/},args=>({loader:'js',contents:args.path.endsWith('auth.ts')?`export async function getCurrentSession(){return {user:{id:'fixture-user'},access_token:'local-fixture-only'}}`:`const data=${JSON.stringify(data)};window.fixtureCommands=[];export async function invokeGame(name,command){if(name==='get-game-workspace')return structuredClone(data);window.fixtureCommands.push(command);if(command.action==='generate_animation')throw Error('Paid generation prohibited in fixture');if(command.action==='accept_animation'||command.action==='reject_animation')data.reviews.push({candidate_id:command.candidateId,decision:command.action==='accept_animation'?'accepted':'rejected'});if(command.graph)data.graphs=[{actor_definition:command.graph.actorDefinition,graph:command.graph}];return {revision:1};}`}))
}}]})
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path==='/'){res.setHeader('Content-Type','text/html');res.end(`<style>${stylesheet}</style><div id="root" class="game-workspace"></div><script type="module" src="/app.js"></script>`);return}const file=path==='/app.js'?`${directory}/app.js`:`output/game-animation-locomotion-browser/${path.slice(1)}`;if(!['/app.js',...fixture.manifest.assets.map(c=>`/${c.state}.glb`)].includes(path)){res.writeHead(404).end();return}res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'model/gltf-binary');res.end(await readFile(file))}catch{res.writeHead(500).end()}})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({headless:true}), page=await browser.newPage({viewport:{width:1400,height:1100}}),errors=[]
page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`)
 await page.getByLabel('Motion provider').selectOption('motionbricks')
 if(!await page.getByRole('button',{name:'Generate candidate',exact:true}).isDisabled())throw Error('Unvalidated MotionBricks generation enabled')
 await page.getByLabel('Motion',{exact:true}).selectOption('roll')
 if(await page.getByLabel('Motion provider').inputValue()!=='kimodo')throw Error('Unsupported MotionBricks mechanic selected')
 await page.getByLabel('Motion',{exact:true}).selectOption('idle')
 await page.getByRole('button',{name:/idle · Pending review/}).click()
 await page.getByRole('button',{name:'Pause',exact:true}).click()
 await page.getByLabel('Scrub',{exact:true}).fill('0.5')
 await page.getByLabel(/^Speed/).fill('0.5')
 await page.getByLabel('Contact and root-path overlays').check()
 await page.getByRole('button',{name:'Accept',exact:true}).click()
 await page.getByRole('button',{name:'Bind accepted clip',exact:true}).click()
 await page.getByRole('button',{name:/walk · Pending review/}).click()
 await page.getByRole('button',{name:'Accept & bind',exact:true}).click()
 await page.getByLabel('Compare with').selectOption(data.candidates[0].id)
 await page.getByRole('button',{name:'Set locomotion crossfades',exact:true}).click()
 await page.getByRole('button',{name:'Save transitions',exact:true}).click()
 await page.getByRole('button',{name:/run · Pending review/}).click()
 await page.getByRole('button',{name:'Reject candidate',exact:true}).click()
 const result=await page.evaluate(()=>window.fixtureCommands)
 if(result.some(c=>c.action==='generate_animation')||!result.some(c=>c.action==='reject_animation')||errors.length)throw Error(JSON.stringify({errors,result}))
 await page.screenshot({path:resolve(directory,'review.png'),fullPage:true})
 await writeFile(`${directory}/report.json`,JSON.stringify({passed:true,commands:result.map(c=>c.action),errors},null,2))
 console.log('Animation preview, acceptance, binding, rejection, comparison and graph editing passed; zero inference commands.')
}finally{await browser.close();server.close()}
