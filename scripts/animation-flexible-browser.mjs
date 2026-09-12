// Isolated UI acceptance; provider traffic is blocked. Persistence is separately tested in SQL.
import {build} from 'esbuild'
import {chromium} from 'playwright'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import assert from 'node:assert/strict'
const directory='output/animation-flexible-browser';await mkdir(directory,{recursive:true})
await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{AnimationStudio}from'./src/features/animation-studio/AnimationStudio';createRoot(document.getElementById('root')).render(<AnimationStudio snapshot={{project:{id:'11111111-1111-4111-8111-111111111111'},draft:{id:'22222222-2222-4222-8222-222222222222'}}} canRun={true} onBack={()=>{}}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',outfile:`${directory}/app.js`,jsx:'automatic',plugins:[{name:'isolated-studio',setup(b){
 b.onResolve({filter:/\.glb\?url$/},()=>({path:'fabric-mesh',namespace:'studio-fixture'}))
 b.onLoad({filter:/.*/,namespace:'studio-fixture'},()=>({contents:`export default '/mannequin.glb'`,loader:'js'}))
 b.onLoad({filter:/src[\\/]data[\\/]animationStudioRepository\.ts$/},()=>({contents:`let workspace=null,history=[],jobs=[];window.fixtureCommands=[];export async function readStudio(){return {library:workspace?[workspace]:[],workspace,jobs,candidates:[],reviews:[],sources:[],game:null,revisions:[...history].reverse().map(h=>({revision:h.revision,created_at:'fixture'}))}}export async function sendStudio(c){window.fixtureCommands.push(c);let graph=c.graph;if(c.action==='restore')graph=history.find(h=>h.revision===c.revision).graph;else if(c.action==='plan'){graph=structuredClone(workspace.graph);const n=id=>({id,label:id,parent:null,kind:'clip',description:'A humanoid performs '+id,style:null,tags:[],duration:1,loop:false,rootMode:'in_place',entry:null,axes:[],samples:[],entryDescription:'',exitDescription:'',contacts:[],clipId:null,contractHash:null});if(!graph.nodes.some(n=>n.id==='wave')){graph.nodes=[{...n('idle'),loop:true},n('wave'),n('bow')];graph.entry='idle';graph.events=[{id:'greet',label:'Greet',key:'KeyG',bufferSeconds:.2}];graph.transitions=[{id:'greet',from:'idle',to:'wave',event:'greet',completion:false,conditions:[],earliest:0,latest:1,blendSeconds:.1,priority:0},{id:'bow',from:'wave',to:'bow',event:null,completion:true,conditions:[],earliest:1,latest:1,blendSeconds:.1,priority:0}];}else {graph.nodes.push(n('dance'));graph.props=[{id:'chair',label:'Chair reference',shape:'box',position:[1,.4,0],size:[.5,.8,.5]}];graph.parameters=[{id:'energy',label:'Energy',type:'number',initial:.5,min:0,max:1,options:[]}];}jobs=[{id:'fixture-plan',prompt:c.prompt,phase:'edit.applied',status:'completed',sourceRevision:c.expectedRevision,appliedRevision:workspace.revision+1,edit:{summary:'Applied graph edits',edits:{},scopeExpansion:[]}}]}else if(c.action!=='save')throw Error('Provider blocked');workspace={id:c.workspaceId,draft_id:c.draftId,revision:(workspace?.revision??0)+1,graph};history.push(structuredClone(workspace));return{revision:workspace.revision}}export async function recoverStudio(){}`,loader:'js'}))
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
 await page.getByRole('button',{name:'Apply prompt',exact:true}).click()
 await page.getByText('Applied graph edits',{exact:false}).waitFor()
 const preview=page.locator('canvas[aria-label="Flexible animation sandbox"]');await preview.scrollIntoViewIfNeeded();await preview.focus();await page.keyboard.press('g');await page.waitForTimeout(300)
 assert.ok((await page.locator('.studio-preview').innerText()).includes('wave'))
 await page.waitForTimeout(1400);assert.ok((await page.locator('.studio-preview').innerText()).includes('bow'))
 await page.getByLabel('Create or change your graph').fill('Add a dance state to the graph.')
 await page.getByRole('button',{name:'Apply prompt',exact:true}).click();await page.waitForTimeout(500)
 assert.ok((await page.evaluate(()=>window.fixtureCommands)).some(c=>c.action==='plan'&&c.prompt.includes('dance')))
 await page.getByLabel('Energy',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForTimeout(300)
 await page.getByRole('button',{name:'Redo',exact:true}).click();await page.waitForTimeout(300)
 assert.equal((await page.evaluate(()=>window.fixtureCommands)).filter(c=>c.action==='restore').length,2)
 await page.locator('.animation-studio').evaluate(e=>e.scrollTop=0)
 await page.screenshot({path:`${directory}/desktop.png`,fullPage:true})
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${directory}/mobile.png`,fullPage:true})
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false)
 assert.deepEqual(errors,[])
 await writeFile(`${directory}/report.json`,JSON.stringify({passed:true,checks:['empty graph','prompt applies','custom keyboard event','completion sequence','follow-up edit','undo redo','mobile overflow','console'],errors},null,2))
 console.log('Flexible studio browser acceptance passed')
}catch(error){await page.screenshot({path:directory+'/failure.png',fullPage:true});await writeFile(directory+'/failure.txt',await page.locator('body').innerText());throw error}finally{await browser.close();await new Promise(r=>server.close(r))}
