// Isolated UI acceptance; provider traffic is blocked. Persistence is separately tested in SQL.
import {build} from 'esbuild'
import {chromium} from 'playwright'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import assert from 'node:assert/strict'
const savedMode=process.argv.includes('--saved-motion');let savedSources=[]
if(savedMode){const base='output/animation-flexible-bake/custom_wait',processed=JSON.parse(await readFile(base+'/process.json','utf8')),rig=JSON.parse(await readFile(base+'/rig.json','utf8'));savedSources=[{id:'33333333-3333-4333-8333-333333333333',url:'/saved.glb',clip:{id:'33333333-3333-4333-8333-333333333333',state:'custom',rigRevision:rig.revision,glbHash:'fixture-saved-motion',duration:processed.duration,loop:true,naturalSpeed:processed.naturalSpeed,rootCurve:processed.rootCurve,contacts:processed.contacts}}]}
const directory=savedMode?'output/animation-studio-ux-saved-browser':'output/animation-flexible-browser';await mkdir(directory,{recursive:true})
await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{AnimationStudio}from'./src/features/animation-studio/AnimationStudio';createRoot(document.getElementById('root')).render(<AnimationStudio snapshot={{project:{id:'11111111-1111-4111-8111-111111111111'},draft:{id:'22222222-2222-4222-8222-222222222222'}}} canRun={true} onBack={()=>{}}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',outfile:`${directory}/app.js`,jsx:'automatic',plugins:[{name:'isolated-studio',setup(b){
 b.onResolve({filter:/\.glb\?url$/},()=>({path:'fabric-mesh',namespace:'studio-fixture'}))
 b.onLoad({filter:/.*/,namespace:'studio-fixture'},()=>({contents:`export default '/mannequin.glb'`,loader:'js'}))
 b.onLoad({filter:/src[\\/]data[\\/]animationStudioRepository\.ts$/},()=>({contents:`const stored=JSON.parse(localStorage.getItem('animation-chat-fixture')??'null');let workspace=stored?.workspace??null,history=stored?.history??[],jobs=stored?.jobs??[];window.fixtureCommands=[];export async function readStudio(){return {library:workspace?[workspace]:[],workspace,jobs,candidates:${JSON.stringify(savedSources.map(s=>({...s,nodeId:"wave",diagnostics:{accepted:true}})))},reviews:[],sources:${JSON.stringify(savedSources)},game:null,revisions:[...history].reverse().map(h=>({revision:h.revision,created_at:'fixture'}))}}export async function sendStudio(c){window.fixtureCommands.push(c);let graph=c.graph;if(c.action==='restore')graph=history.find(h=>h.revision===c.revision).graph;else if(c.action==='plan'){graph=structuredClone(workspace.graph);const n=id=>({id,label:id,parent:null,kind:'clip',description:'A humanoid performs '+id,style:null,tags:[],duration:1,loop:false,rootMode:'in_place',entry:null,axes:[],samples:[],entryDescription:'',exitDescription:'',contacts:[],clipId:null,contractHash:null});if(c.prompt.includes('tag terminal')){graph.nodes=graph.nodes.map(n=>n.id==='bow'?{...n,tags:['terminal']}:n)}else if(!graph.nodes.some(n=>n.id==='wave')){graph.nodes=[{...n('idle'),loop:true},n('wave'),n('bow')];graph.entry='idle';graph.events=[{id:'greet',label:'Greet',key:'KeyG',bufferSeconds:.2}];graph.transitions=[{id:'greet',from:'idle',to:'wave',event:'greet',completion:false,conditions:[],earliest:0,latest:1,blendSeconds:.1,priority:0},{id:'bow',from:'wave',to:'bow',event:null,completion:true,conditions:[],earliest:1,latest:1,blendSeconds:.1,priority:0}];}else {graph.nodes.push({...n('dance'),parent:'gestures'},{...n('gestures'),kind:'machine',entry:'dance'});graph.props=[{id:'chair',label:'Chair reference',shape:'box',position:[1,.4,0],size:[.5,.8,.5]}];graph.parameters=[{id:'energy',label:'Energy',type:'number',initial:.5,min:0,max:1,options:[]}];}jobs=[{id:'fixture-plan-'+(workspace.revision+1),prompt:c.prompt,phase:'edit.applied',status:'completed',sourceRevision:c.expectedRevision,appliedRevision:workspace.revision+1,edit:{summary:'Applied graph edits',edits:{},scopeExpansion:[]}},...jobs]}else if(c.action!=='save')throw Error('Provider blocked');workspace={id:c.workspaceId,draft_id:c.draftId,revision:(workspace?.revision??0)+1,graph};history.push(structuredClone(workspace));localStorage.setItem('animation-chat-fixture',JSON.stringify({workspace,history,jobs}));return{revision:workspace.revision}}export async function recoverStudio(){}`,loader:'js'}))
 b.onLoad({filter:/src[\\/]data[\\/]mechanicRepository\.ts$/},()=>({contents:`export async function sendMechanic(){throw Error('Provider operations blocked')}`,loader:'js'}))
}}]})
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost').pathname
 if(url==='/'){res.setHeader('Content-Type','text/html');res.end('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#101713;font-family:Arial,sans-serif;height:100vh}#root{height:100vh}</style><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script>');return}
 if(url==='/app.js'||url==='/app.css'){res.setHeader('Content-Type',url.endsWith('css')?'text/css':'text/javascript');res.end(await readFile(directory+url));return}
 if(url==='/saved.glb'&&savedMode){res.setHeader('Content-Type','model/gltf-binary');res.end(await readFile('output/animation-flexible-bake/custom_wait/output.glb'));return}
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
 if(savedMode){await page.getByRole('button',{name:'Try saved motions',exact:true}).click();const demo=page.getByRole('complementary',{name:'Saved motion playground'});await demo.getByText('Generated clip playback.',{exact:false}).waitFor();const canvas=demo.locator('canvas');const first=await canvas.screenshot();await page.waitForTimeout(600);const second=await canvas.screenshot();assert.equal(first.equals(second),false,'Saved motion advances visibly');await page.getByRole('button',{name:'Close playground',exact:true}).click()}
 await page.getByRole('button',{name:'Apply prompt',exact:true}).click()
 await page.getByText('Applied graph edits',{exact:false}).waitFor()
 const preview=page.locator('canvas[aria-label="Flexible animation sandbox"]');await preview.scrollIntoViewIfNeeded();await preview.focus();await page.keyboard.press('g');await page.waitForTimeout(300)
 assert.ok((await page.locator('.studio-preview').innerText()).includes('wave'))
 await page.waitForTimeout(1400);assert.ok((await page.locator('.studio-preview').innerText()).includes('bow'))
 await page.getByRole('button',{name:'Hold the final pose',exact:true}).click()
 await page.waitForTimeout(300)
 assert.ok((await page.evaluate(()=>window.fixtureCommands)).some(c=>c.action==='plan'&&c.prompt.includes('tag terminal')&&c.nodeIds.includes('bow')))
 assert.equal(await page.getByRole('region',{name:'What should happen after bow?'}).count(),0)
 await page.reload({waitUntil:'networkidle'})
 await page.getByRole('log',{name:'Animation messages'}).getByText('Regarding “What should happen after bow?”:',{exact:false}).waitFor()
 assert.equal(await page.getByRole('log',{name:'Animation messages'}).locator('.world-prompt-row-user').count(),2)
 await page.getByRole('button',{name:'Write my own answer',exact:true}).click()
 assert.ok((await page.getByLabel('Create or change your graph').inputValue()).startsWith('Regarding'))
 await page.getByLabel('Create or change your graph').fill('Draft: add a relaxed listening gesture.')
 await page.reload({waitUntil:'networkidle'})
 await page.waitForFunction(()=>document.querySelector('#flex-prompt')?.value==='Draft: add a relaxed listening gesture.')
 await page.getByRole('button',{name:'Dismiss for this revision',exact:true}).last().click()
 await page.getByRole('button',{name:'Show dismissed suggestions',exact:true}).click()

 await page.getByRole('button',{name:'History',exact:true}).click()
 await page.getByRole('button',{name:'Close history',exact:true}).click()
 await page.getByRole('button',{name:'Motions & review',exact:true}).click()
 await page.getByLabel('Spending limit (USD)').fill('1.25')
 await page.getByRole('button',{name:'Close motions',exact:true}).click()
 await page.getByRole('button',{name:'Fit graph',exact:true}).click()
 await page.locator('.react-flow__node').filter({hasText:'Wave'}).click()
 if(savedMode){await page.getByRole('button',{name:'Motions & review',exact:true}).click();await page.getByLabel('Compare candidate poses').selectOption('entry');await page.getByRole('complementary',{name:'Motion generation and review'}).getByRole('button',{name:'Play',exact:true}).waitFor();assert.equal(await page.getByRole('complementary',{name:'Motion generation and review'}).getByLabel('Scrub',{exact:true}).inputValue(),'0');await page.getByLabel('Compare candidate poses').selectOption('exit');await page.getByRole('complementary',{name:'Motion generation and review'}).getByRole('button',{name:'Play',exact:true}).waitFor();assert.equal(await page.getByRole('complementary',{name:'Motion generation and review'}).getByLabel('Scrub',{exact:true}).inputValue(),'1');await page.getByRole('button',{name:'Close motions',exact:true}).click()}
 await page.getByLabel('Prompt scope',{exact:true}).selectOption('selected')
 await page.getByLabel('Create or change your graph').fill('Add a dance state to the graph.')
 await page.getByRole('button',{name:'Apply prompt',exact:true}).click();await page.waitForTimeout(500)
 assert.ok((await page.evaluate(()=>window.fixtureCommands)).some(c=>c.action==='plan'&&c.prompt.includes('dance')&&c.nodeIds.includes('wave')))
 await page.getByLabel('Energy',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForTimeout(300)
 await page.getByRole('button',{name:'Redo',exact:true}).click();await page.waitForTimeout(300)
 assert.equal((await page.evaluate(()=>window.fixtureCommands)).filter(c=>c.action==='restore').length,2)
 await page.getByRole('button',{name:'Fit graph',exact:true}).click()
 await page.getByRole('button',{name:'Collapse states',exact:true}).click()
 assert.equal(await page.locator('.react-flow__node[data-id="dance"]').count(),0)
 await page.getByRole('button',{name:'Expand states',exact:true}).click()
 await page.locator('.react-flow__node[data-id="dance"]').waitFor()
 await page.getByRole('button',{name:'Fit graph',exact:true}).click()
 await page.locator('.react-flow__edge[data-id="greet"]').click()
 await page.getByLabel('Blend duration (seconds)').fill('0.3')
 await page.getByRole('button',{name:'Save revision',exact:true}).click()
 assert.equal((await page.evaluate(()=>window.fixtureCommands)).at(-1).graph.transitions.find(t=>t.id==='greet').blendSeconds,.3)
 await page.getByRole('button',{name:'Close',exact:true}).click()
 await page.getByText('Test a transition',{exact:true}).click()
 await page.getByLabel('Transition to review',{exact:true}).selectOption('bow')
 await page.getByLabel('Repeat transition test',{exact:true}).check()
 await page.getByRole('button',{name:'Restart transition',exact:true}).click()
 await page.getByLabel('Transition to review',{exact:true}).selectOption('')
 await page.getByText('Test a transition',{exact:true}).click()
 await page.getByLabel('Graph view',{exact:true}).selectOption('dependencies')
 assert.equal(await page.locator('.react-flow__edge').count(),0)
 await page.getByLabel('Graph view',{exact:true}).selectOption('transitions')
 await page.getByRole('button',{name:'Fit graph',exact:true}).click()
 await page.locator('.animation-studio').evaluate(e=>e.scrollTop=0)
 await page.screenshot({path:`${directory}/desktop.png`,fullPage:true})
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${directory}/mobile.png`,fullPage:true})
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false)
 assert.deepEqual(errors,[])
 await writeFile(`${directory}/report.json`,JSON.stringify({passed:true,savedMotion:savedMode,checks:['empty graph','prompt applies','custom keyboard event','completion sequence','follow-up edit','undo redo','scoped prompt','choice reply','conversation reload','draft recovery','free-text choice','dismiss restore','terminal gap resolution','transition editing','nested machine collapse','transition review','dependency view','drawers','mobile overflow','console'],errors},null,2))
 console.log('Flexible studio browser acceptance passed')
}catch(error){await page.screenshot({path:directory+'/failure.png',fullPage:true});await writeFile(directory+'/failure.txt',await page.locator('body').innerText());throw error}finally{await browser.close();await new Promise(r=>server.close(r))}
