// Isolated runtime acceptance only. Does not accept/bind any project candidate.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {manifestSchema} from '../src/domain/game/v3/spec.ts'
const base='output/game-motionbricks-compatibility',fabric=process.argv.includes('--fabric'),directory=`${base}/${fabric?'runtime-fabric':'runtime'}`
const caseName=state=>fabric?`fabric-${state}-1-2`:`${state}-retargeted`
mkdirSync(directory,{recursive:true})
const previous=JSON.parse(readFileSync('output/game-animation-locomotion-browser/candidate.json','utf8'))
const rig=JSON.parse(readFileSync(`${base}/${caseName('walk')}/rig.json`,'utf8'))
const assets=[],assetUrls={}
for(const state of ['idle','walk']){
 const result=JSON.parse(readFileSync(`${base}/${caseName(state)}/hosted-review.json`,'utf8'))
 const clip=result.candidates[0]?.clip
 if(!clip?.validation.accepted||clip.retargetRevision!==(fabric?'g1-humanoid-1.2.0':'g1-soma-1.1.0')||clip.rigRevision!==rig.revision)throw Error('Hosted validated compatible clip required')
 const recipeKey=`animation.${state}`
 assets.push({...clip,recipeKey});assetUrls[recipeKey]=`/staged/${state}.glb`
 copyFileSync(`${base}/${caseName(state)}/output.glb`,`${directory}/${state}.glb`)
}
const graph={...previous.manifest.animations.graphs[0],rigRevision:rig.revision,bindings:assets.map(a=>({state:a.state,clipRevision:a.id})),transitions:[{from:'idle',to:'walk',blendSeconds:.2,event:'movement'},{from:'walk',to:'idle',blendSeconds:.2,event:'movement'}]}
const manifest=manifestSchema.parse({...previous.manifest,id:randomUUID(),assets,animations:{version:1,rigs:[rig],graphs:[graph]}})
writeFileSync(`${directory}/candidate.json`,JSON.stringify({manifest,assetUrls}))
console.log(directory)
