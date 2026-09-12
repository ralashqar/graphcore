// Read-only review of the imported, hosted Fabric candidates. No provider calls or acceptance writes.
import {build} from 'esbuild'
import {readFile,mkdir} from 'node:fs/promises'
import {createServer} from 'node:http'
import {resolve,extname,sep} from 'node:path'
const directory=resolve('output/game-fabric-kimodo'),runtime=resolve('dist-game')
const hosted=JSON.parse(await readFile(`${directory}/hosted-review.json`,'utf8'))
const clips=hosted.candidates.filter(c=>c.clip).map(c=>c.clip)
if(clips.length!==6)throw Error('All six hosted candidates must finish validation before opening this review')
await mkdir(directory,{recursive:true})
await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{AnimationPreview}from'./src/features/game-builder/AnimationPreview';
const clips=${JSON.stringify(clips)};
function Review(){const[state,setState]=useState('walk'),clip=clips.find(c=>c.state===state);return <main><span className="eyebrow">SynArc · Motion components</span><h1>Fabric locomotion review</h1><p>Six saved Kimodo motions, re-baked by the hosted asset worker for the Fabric mannequin. No new inference was requested.</p><nav>{clips.map(c=><button aria-pressed={state===c.state} key={c.id} onClick={()=>setState(c.state)}>{c.state.replaceAll('_',' ')}</button>)}</nav><section><h2>{state.replaceAll('_',' ')}</h2><AnimationPreview clip={clip} url={'/clips/'+state+'.glb'}/></section><p>Technical validation passed. These candidates await your review in the game builder; this page cannot accept or bind them.</p><div className="links"><a href="http://127.0.0.1:5196/?acceptance=1">Try sword locomotion</a><a href="http://127.0.0.1:5197/?acceptance=1">Try the procedural low vault</a><a href="http://localhost:5174/app/game">Open game builder</a></div><p>The playable previews use local acceptance fixtures. Movement: WASD, Shift to run, Alt + WASD to strafe. Vault: approach the low obstacle and press E. Generated vault motion remains unavailable.</p></main>};createRoot(document.getElementById('root')).render(<Review/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'esm',jsx:'automatic',outfile:`${directory}/review.js`})
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.json':'application/json','.wasm':'application/wasm'}
const server=createServer(async(req,res)=>{
 try{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
  if(path==='/'){
   res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fabric motion components · SynArc</title><style>body{margin:0;background:#13151a;color:#ebeaf0;font:15px/1.6 system-ui}main{max-width:1100px;margin:auto;padding:32px 24px}h1{font-size:32px;letter-spacing:-.03em}h2{text-transform:capitalize}p{color:#b2b4c0;max-width:80ch}.eyebrow{color:#bba5ec}section{background:#1d2028;border:1px solid #353944;border-radius:16px;padding:24px;margin:24px 0}nav,.links{display:flex;flex-wrap:wrap;gap:8px}button,a{color:#d4c5f5;border:1px solid #514b69;border-radius:8px;padding:8px 12px;background:#292536;cursor:pointer;text-decoration:none}button[aria-pressed=true]{background:#70539b;color:white}label{display:inline-block;margin:12px}canvas{touch-action:none}input{accent-color:#a98bd4}section button{margin:4px}section a{display:inline-block;margin:8px}</style><div id="root"></div><script type="module" src="/review.js"></script>`);return
  }
  let file
  if(path==='/review.js')file=`${directory}/review.js`
  else if(/^\/clips\/(idle|walk|run|backward|strafe_left|strafe_right)\.glb$/.test(path))file=`${directory}/${path.split('/')[2].slice(0,-4)}/hosted.glb`
  else{res.writeHead(404).end();return}
  res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(await readFile(file))
 }catch{res.writeHead(404).end('Preview asset unavailable')}
})
await new Promise(r=>server.listen(5195,'127.0.0.1',r))
console.log('Read-only hosted Fabric motion review: http://127.0.0.1:5195/')

for(const [port,mode] of [[5196,'runtime'],[5197,'vault']]){
 const player=createServer(async(req,res)=>{
  try{
   const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
   const root=path==='/candidate.json'||path.startsWith('/staged/')?resolve(directory,mode):runtime
   const file=resolve(root,path==='/'?'index.html':path.replace(/^\/staged\//,'').replace(/^\//,''))
   if(!file.startsWith(root+sep)){res.writeHead(403).end();return}
   res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(await readFile(file))
  }catch{res.writeHead(404).end()}
 })
 await new Promise(r=>player.listen(port,'127.0.0.1',r))
}
