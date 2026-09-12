// Isolated UI acceptance; provider traffic is blocked. Persistence is separately tested in SQL.
import {build} from 'esbuild'
import {chromium} from 'playwright'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import assert from 'node:assert/strict'
const directory='output/animation-studio-browser';await mkdir(directory,{recursive:true})
await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{LegacyAnimationStudio as AnimationStudio}from'./src/features/animation-studio/AnimationStudio';createRoot(document.getElementById('root')).render(<AnimationStudio snapshot={{project:{id:'11111111-1111-4111-8111-111111111111'},draft:{id:'22222222-2222-4222-8222-222222222222'}}} canRun={true} onBack={()=>{}}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',outfile:`${directory}/app.js`,jsx:'automatic',plugins:[{name:'isolated-studio',setup(b){
 b.onResolve({filter:/\.glb\?url$/},()=>({path:'fabric-mesh',namespace:'studio-fixture'}))
 b.onLoad({filter:/.*/,namespace:'studio-fixture'},()=>({contents:`export default '/mannequin.glb'`,loader:'js'}))
 b.onLoad({filter:/src[\\/]data[\\/]animationStudioRepository\.ts$/},()=>({contents:`let workspace=null;window.fixtureCommands=[];export async function readStudio(){return {library:workspace?[workspace]:[],workspace,jobs:[],candidates:[],reviews:[],sources:[],game:null}}export async function sendStudio(c){window.fixtureCommands.push(c);if(c.action!=='save')throw Error('Provider operations are blocked by the browser fixture');workspace={id:c.workspaceId,draft_id:c.draftId,revision:(workspace?.revision??0)+1,graph:c.graph};return {revision:workspace.revision}}export async function recoverStudio(){}`,loader:'js'}))
 b.onLoad({filter:/src[\\/]data[\\/]mechanicRepository\.ts$/},()=>({contents:`export async function sendMechanic(){throw Error('Provider operations blocked')}`,loader:'js'}))
}}]})
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost').pathname
 if(url==='/'){res.setHeader('Content-Type','text/html');res.end('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#101713;font-family:Arial,sans-serif;height:100vh}#root{height:100vh}</style><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script>');return}
 if(url==='/app.js'||url==='/app.css'){res.setHeader('Content-Type',url.endsWith('css')?'text/css':'text/javascript');res.end(await readFile(directory+url));return}
 if(url==='/mannequin.glb'){res.setHeader('Content-Type','model/gltf-binary');res.end(await readFile('workers/game/rigs/fabric-ybot-v1/mannequin.glb'));return}
 res.writeHead(404).end()
 }catch{res.writeHead(500).end()}})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[]
page.on('pageerror',e=>errors.push(e.message))
await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort())
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'})
 await page.getByRole('heading',{name:'Animation studio',exact:true}).waitFor()
 await page.getByRole('button',{name:'Save revision',exact:true}).click()
 await page.getByText('Saved immutable graph revision').waitFor()
 const canvas=page.getByRole('generic',{name:'Animation sandbox. Focus to use movement and action keys'})
 const preview=page.locator('canvas[aria-label^="Animation sandbox"]');await preview.scrollIntoViewIfNeeded();await preview.focus()
 await page.keyboard.press('c');await page.waitForTimeout(250)
 await page.keyboard.press('f');await page.waitForTimeout(250)
 assert.ok((await page.locator('.studio-preview').innerText()).includes('Forehand'))
 await page.waitForTimeout(1400)
 assert.ok((await page.locator('.studio-preview').innerText()).includes('idle'))
 await preview.focus();await page.keyboard.down('w');await page.waitForTimeout(350)
 assert.ok((await page.locator('.studio-preview').innerText()).includes('walk'))
 await page.keyboard.up('w');await page.getByLabel('Motion description',{exact:true}).fill('A deliberate diagonal forehand slash, with controlled weight transfer and smooth recovery.')
 await page.getByRole('button',{name:'Save revision',exact:true}).click();await page.getByText('Saved immutable graph revision').waitFor()
 assert.equal((await page.evaluate(()=>window.fixtureCommands)).length,2)
 await page.locator('.animation-studio').evaluate(e=>e.scrollTop=0)
 await page.screenshot({path:`${directory}/desktop.png`,fullPage:true})
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${directory}/mobile.png`,fullPage:true})
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false)
 assert.deepEqual(errors,[])
 await writeFile(`${directory}/report.json`,JSON.stringify({passed:true,checks:['load','save revision','combat toggle','attack','recovery','movement','edit/save','mobile overflow','console'],errors},null,2))
 console.log('Animation studio browser acceptance passed')
}catch(error){await page.screenshot({path:directory+'/failure.png',fullPage:true});await writeFile(directory+'/failure.txt',await page.locator('body').innerText());throw error}finally{await browser.close();await new Promise(r=>server.close(r))}
