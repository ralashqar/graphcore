import {build} from 'esbuild'

import {chromium} from 'playwright'

import {readFile,writeFile,mkdir} from 'node:fs/promises'

import {createServer} from 'node:http'

import assert from 'node:assert/strict'

import {blankGraph,clipNode} from '../src/domain/game/animation-studio/flexible.ts'

import {defaultLocomotion,processingProfile} from '../src/domain/game/animation-studio/locomotionProfile.ts'

const directory='output/animation-locomotion-browser';await mkdir(directory,{recursive:true})

const graph=blankGraph(),clips=[]

for(const [i,kind]of ['walk','run'].entries()){

 const base=`output/animation-locomotion-bake/custom_${kind}`,p=JSON.parse(await readFile(base+'/process.json','utf8')),rig=JSON.parse(await readFile(base+'/rig.json','utf8'))

 const profile={...defaultLocomotion(),gait:kind},id=`33333333-3333-4333-8333-33333333333${i}`

 graph.nodes.push({...clipNode(kind),loop:true,locomotion:profile,clipId:id})

 clips.push({url:`/${kind}.glb`,clip:{id,state:'custom',rigRevision:rig.revision,glbHash:kind,duration:p.duration,loop:true,naturalSpeed:p.naturalSpeed,rootCurve:p.rootCurve,contacts:p.contacts,locomotion:processingProfile(profile)}})

}

graph.entry='walk';graph.events=[{id:'switch',label:'Switch gait',key:'KeyG',bufferSeconds:.2}]

graph.transitions=['walk','run'].map((from,i)=>({id:from,from,to:i?'walk':'run',event:'switch',completion:false,conditions:[],earliest:0,latest:1,blendSeconds:.35,priority:0}))

await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{FlexiblePreview}from'./src/features/animation-studio/FlexiblePreview';import{LocomotionEditor}from'./src/features/animation-studio/LocomotionEditor';import './src/styles/features/animation-studio.css';const clips=${JSON.stringify(clips)};function App(){const[g,set]=React.useState(${JSON.stringify(graph)});return <main className="animation-studio"><LocomotionEditor node={g.nodes[0]} graph={g} onChange={patch=>set({...g,nodes:g.nodes.map((n,i)=>i?n:{...n,...patch})})}/><FlexiblePreview graph={g} clips={clips} selected="walk" onActive={id=>window.activeMotion=id}/></main>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',outfile:directory+'/app.js',jsx:'automatic',plugins:[{name:'mesh',setup(b){b.onResolve({filter:/\.glb\?url$/},()=>({path:'mesh',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export default '/mannequin.glb'`,loader:'js'}))}}]})

const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<meta charset="utf-8"><style>body{background:#101713;color:white;font-family:Arial}main{display:grid;grid-template-columns:280px 1fr;height:900px}.studio-preview{height:850px}</style><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script>');return}let file;if(path==='/app.js'||path==='/app.css'){file=directory+path;res.setHeader('Content-Type',path.endsWith('js')?'text/javascript':'text/css')}else if(path==='/mannequin.glb')file='workers/game/rigs/fabric-ybot-v1/mannequin.glb';else if(['/walk.glb','/run.glb'].includes(path))file=`output/animation-locomotion-bake/custom_${path.slice(1,-4)}/output.glb`;if(!file){res.writeHead(404).end();return}res.end(await readFile(file))}catch(e){res.writeHead(500).end(String(e))}})

await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[]

page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort())

try{

 await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'})

 await page.getByText('Synchronized',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>window.activeMotion),'walk')

 await page.getByText(/^Locked: (left_foot|right_foot)/).waitFor();
 const canvas=page.locator('canvas');const a=await canvas.screenshot();await page.waitForTimeout(500);assert.equal(a.equals(await canvas.screenshot()),false)

 for(let i=0;i<6;i++){await page.getByRole('button',{name:'Switch gait'}).click();await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>window.activeMotion),i%2?'walk':'run')}

 await page.getByRole('checkbox',{name:'Bounded transition foot locking'}).uncheck();await page.getByRole('checkbox',{name:'Bounded transition foot locking'}).check()

 await page.getByRole('button',{name:'Pause',exact:true}).click();await page.waitForTimeout(150);const paused=await canvas.screenshot();await page.waitForTimeout(250);assert.equal(paused.equals(await canvas.screenshot()),true)

 await page.screenshot({path:directory+'/preview.png',fullPage:true});assert.deepEqual(errors,[]);await writeFile(directory+'/report.json',JSON.stringify({passed:true,transitions:6,errors},null,2));console.log('Saved locomotion playback, repeated transitions, editor controls and pause passed')

}catch(error){await writeFile(directory+'/failure.txt',JSON.stringify({errors,body:await page.locator('body').innerText()}));await page.screenshot({path:directory+'/failure.png'});throw error}finally{await browser.close();await new Promise(r=>server.close(r))}
