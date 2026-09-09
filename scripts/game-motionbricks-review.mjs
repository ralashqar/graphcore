// Local read-only review of the actual hosted diagnostic. No provider credentials.
import {build} from 'esbuild'
import {readFile,mkdir} from 'node:fs/promises'
import {createServer} from 'node:http'
const directory='output/game-motionbricks-compatibility'
const cases=[],files=new Map([['/review.js','review.js']])
for(const [key,label]of [['diagnostic','Idle → walk → turn → stop'],['idle','Derived idle loop'],['walk','Derived walk loop'],['walk-generated','Original retarget · steady walk'],['idle-retargeted','Revised idle loop'],['walk-retargeted','Revised walk loop']]){
 const prefix=key==='diagnostic'?'':`${key}/`
 let data;try{data=JSON.parse(await readFile(`${directory}/${prefix}hosted-review.json`,'utf8'))}catch(error){if(error.code==='ENOENT')continue;throw error}
 const candidate=data.candidates[0],diagnostic=candidate?.diagnostics
 if(!diagnostic?.preview||!diagnostic.motionbricksArtifacts?.native_export?.preview)continue
 cases.push({key,label,native:diagnostic.motionbricksArtifacts.native_export.preview,target:diagnostic.preview,valid:!!candidate.clip,failures:diagnostic.failures??[]})
 for(const file of ['native.glb','output.glb'])files.set(`/${key}/${file}`,`${prefix}${file}`)
}
for(const kind of ['soma','fabric'])for(const state of ['idle','walk']){
 const key=`${kind}-${state}-1-2`,prefix=`${directory}/${key}`
 let processed,validation;try{processed=JSON.parse(await readFile(`${prefix}/process.json`,'utf8'));validation=JSON.parse(await readFile(`${prefix}/validate.json`,'utf8'))}catch(error){if(error.code==='ENOENT')continue;throw error}
 const prior=cases.find(c=>c.key===(state==='idle'?'idle':'walk-generated'))
 if(!prior)continue
 cases.push({key,label:`${kind==='fabric'?'Fabric Y-Bot':'SOMA'} · corrected ${state}`,native:prior.native,target:{...processed,id:key,state},valid:validation.accepted,failures:validation.failures})
 files.set(`/${key}/native.glb`,`${state==='idle'?'idle':'walk-generated'}/native.glb`)
 files.set(`/${key}/output.glb`,`${key}/output.glb`)
}
if(!cases.length)throw Error('Motion previews are not ready')
await mkdir(directory,{recursive:true})
await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{AnimationPreview}from'./src/features/game-builder/AnimationPreview';const cases=${JSON.stringify(cases)};function Review(){const[key,setKey]=useState(cases.find(c=>c.key==='fabric-walk-1-2')?.key??cases[0].key),item=cases.find(c=>c.key===key);return <><h1>MotionBricks review</h1><label>Motion <select aria-label="Motion" value={key} onChange={e=>setKey(e.target.value)}>{cases.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</select></label><p>{item.valid?'Technical validation passed. Pending user review; no active binding has changed.':item.failures.length?'Validation failed: '+item.failures.join('; '):'Diagnostic only. Cannot be accepted or bound as a gameplay clip.'}</p><div className="grid"><section><h2>Native G1</h2><AnimationPreview clip={item.native} url={'/'+key+'/native.glb'} followRoot/></section><section><h2>{key.startsWith('fabric-')?'Fabric Y-Bot':'SOMA conversion'}</h2><AnimationPreview clip={item.target} url={'/'+key+'/output.glb'}/></section></div><p>Source and validation are preserved in the project animation workflow. Both previews support orbit, zoom, scrubbing and GLB download.</p></>};createRoot(document.getElementById('root')).render(<Review/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',outfile:`${directory}/review.js`,jsx:'automatic'})
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname
  if(path==='/'){
   res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>MotionBricks review</title><style>body{margin:0;padding:32px;background:#13151a;color:#ebeaf0;font:15px system-ui}h1{font-size:26px}p{color:#afb2bd}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(480px,100%),1fr));gap:24px}section{background:#1d2028;border:1px solid #353944;border-radius:16px;padding:20px}button,a{color:#c8b8ff;margin:8px;border:1px solid #514b69;border-radius:6px;padding:7px;background:#292536}label{display:inline-block;margin:8px}canvas{touch-action:none}</style><div id="root"></div><script type="module" src="/review.js"></script>');return
  }
  const file=files.get(path);if(!file){res.writeHead(404).end();return}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'model/gltf-binary');res.end(await readFile(`${directory}/${file}`))
 }catch{res.writeHead(500).end('Preview unavailable')}
})
await new Promise(resolve=>server.listen(5194,'127.0.0.1',resolve))
console.log('Read-only MotionBricks review: http://127.0.0.1:5194/')
