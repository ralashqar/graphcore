// Local acceptance manifest only; never reviews or binds a project candidate.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs'
import {randomUUID,createHash} from 'node:crypto'
import {fabricMannequin} from '../src/domain/game/v3/mannequin.ts'
import {compile} from '../src/domain/game/v3/compiler.ts'
import {hashGameValue} from '../src/domain/game/compiler.ts'
import {manifestSchema,of} from '../src/domain/game/v3/spec.ts'
import {defaultMotionProfile} from '../src/domain/game/v3/motionProfile.ts'
import {makeMotionSet,motionSetRevision,validateMotionSet} from '../src/domain/game/v3/motionSets.ts'
import {clipRevisionSchema} from '../src/domain/game/v3/animation.ts'
const vault=process.argv.includes('--vault'),blocked=process.argv.includes('--blocked'),unbound=process.argv.includes('--unbound'),directory=`output/game-fabric-kimodo/${unbound?'unbound':blocked?'vault-blocked':vault?'vault':'runtime'}`;mkdirSync(directory,{recursive:true})
const previous=JSON.parse(readFileSync('output/game-animation-locomotion-browser/candidate.json')),rig=await fabricMannequin()
const design=previous.manifest.design,actor=of(design,'actor_definition').find(a=>a.id===of(design,'actor_instance').find(i=>i.id===design.player).definition)
actor.motionProfile={...defaultMotionProfile,equipment:'one_handed_sword'}
if(vault){
  of(design,'actor_instance').find(a=>a.id===design.player).position={x:8,y:0,z:7.2}
  of(design,'world')[0].boxes.push({id:'vault.box',position:{x:8,y:.4,z:8},size:{x:2,y:.8,z:.5},ramp:false})
  if(blocked)of(design,'world')[0].boxes.push({id:'vault.roof',position:{x:8,y:2.2,z:8},size:{x:3,y:.2,z:3},ramp:false})
  design.mechanics={...(design.mechanics??{version:1,packages:[],surfaces:[]}),traversal:[{version:1,id:'vault.low',kind:'low_vault',actorDefinition:actor.id,collider:'vault.box',profile:'vault-0.8x0.5-v1'}]}
}
const set=makeMotionSet(design,actor.id,rig.revision,actor.motionProfile),assets=[],assetUrls={}
for(const state of set.states){
 const folder=`output/game-fabric-kimodo/${state}`,recipe=JSON.parse(readFileSync(folder+'/recipe.json')),p=JSON.parse(readFileSync(folder+'/process.json')),validation=JSON.parse(readFileSync(folder+'/validate.json'))
 const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex')
 const clip=clipRevisionSchema.parse({version:1,id:randomUUID(),recipeHash:await hashGameValue(recipe),rigRevision:rig.revision,sourceHash:sha(folder+'/source.json'),glbHash:sha(folder+'/output.glb'),retargetRevision:'soma-fabric-1.0.0',storagePath:`fixture/${state}.glb`,state,duration:p.duration,fps:30,loop:recipe.loop,naturalSpeed:p.naturalSpeed,rootMode:recipe.rootMode,rootCurve:p.rootCurve,contacts:p.contacts,validation:{policy:validation.policy,accepted:validation.accepted,metrics:validation.metrics}})
 assets.push({...clip,recipeKey:`animation.${state}`});assetUrls[`animation.${state}`]=`/staged/${state}.glb`;copyFileSync(folder+'/output.glb',`${directory}/${state}.glb`)
}
const failures=validateMotionSet(set,assets);if(failures.length)throw Error(failures.join('; '))
const graph={version:1,id:`animation.${actor.id}`,actorDefinition:actor.id,rigRevision:rig.revision,bindings:assets.map(a=>({state:a.state,clipRevision:a.id})),transitions:set.states.flatMap(from=>set.states.filter(to=>to!==from).map(to=>({from,to,event:'movement',blendSeconds:.18}))),motionSets:[{version:1,setId:set.id,revision:await motionSetRevision(set),profile:set.profile,requiredStates:set.states}]}
const base=await compile(design,{id:randomUUID(),projectId:previous.manifest.projectId,draftId:previous.manifest.draftId,sourceRevision:previous.manifest.sourceRevision})
const animations={version:1,rigs:[rig],graphs:[graph]}
const manifest=manifestSchema.parse(unbound?base:{...base,assets,animations,sourceHash:await hashGameValue({base:base.sourceHash,assets,animations})})
writeFileSync(`${directory}/candidate.json`,JSON.stringify({manifest,assetUrls}));console.log(directory)
