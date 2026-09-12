import test from 'node:test'
import assert from 'node:assert/strict'
import { studioTemplate } from './templates.ts'
import { freezeGraph, graphDiff, validateGraph } from './graph.ts'
import { advanceStudio, initialStudioState, emptyStudioInput, studioWeights } from './runtime.ts'
import { studioRecipe } from './recipes.ts'
import { providerRequest } from '../v3/animationProviders.ts'
import { validateTransitions, type BoundaryEvidence } from './validation.ts'

test('proposal review exposes transition and input changes without node edits',()=>{
 const before=studioTemplate(),after=structuredClone(before)
 after.transitions[0].blendSeconds=.2;after.inputs.attack='KeyG'
 assert.deepEqual(graphDiff(before,after),['transitions','inputs'])
})

test('combo review rejects an incompatible pose inside the transition window',()=>{
 const graph=studioTemplate(),positions=Array.from({length:77},()=>[0,0,0]),rotations=Array.from({length:77},()=>[0,0,0,1])
 const boundary:BoundaryEvidence={start:positions,end:positions,startVelocity:positions,endVelocity:positions,startRotations:rotations,endRotations:rotations,samples:Array.from({length:30},()=>({positions:structuredClone(positions),rotations}))}
 const evidence=Object.fromEntries(graph.nodes.map(n=>[n.id,structuredClone(boundary)]))
 assert.equal(validateTransitions(graph,evidence).accepted,true)
 evidence['sword.strike_1'].samples![23].positions[10][0]=.4
 assert.equal(validateTransitions(graph,evidence).accepted,false)
 assert.equal(validateTransitions(graph,{}).accepted,false)
})

test('template has separate stance locomotion, named sword strikes, recovery and reachable states',()=>{
 const graph=studioTemplate();assert.deepEqual(validateGraph(graph),[]);assert.equal(graph.nodes.length,15)
 assert.equal(graph.nodes.filter(n=>n.role==='walk').length,2)
 assert.equal(graph.nodes.find(n=>n.id==='sword.strike_2')!.entry,graph.nodes.find(n=>n.id==='sword.strike_1')!.exit)
})
test('diagonal locomotion weights normalize and stance changes preserve movement',()=>{
 const g=studioTemplate();let s=initialStudioState(g)
 for(let i=0;i<30;i++)s=advanceStudio(g,s,{...emptyStudioInput(),x:1,z:1},1/60)
 assert.ok(Math.abs(Object.values(studioWeights(s)).reduce((a,b)=>a+b,0)-1)<1e-6)
 s=advanceStudio(g,s,{...emptyStudioInput(),x:1,z:1,toggleCombat:true},1/60)
 assert.ok(s.node.startsWith('sword.'));assert.ok(s.history.length)
})
test('buffered attacks advance within window; no input returns to guard',()=>{
 const g=studioTemplate();let s=initialStudioState(g)
 s=advanceStudio(g,s,{...emptyStudioInput(),toggleCombat:true},1/60)
 s=advanceStudio(g,s,{...emptyStudioInput(),attack:true},1/60)
 assert.equal(s.node,'sword.strike_1')
 for(let i=0;i<35;i++)s=advanceStudio(g,s,emptyStudioInput(),1/60)
 s=advanceStudio(g,s,{...emptyStudioInput(),attack:true},1/60)
 for(let i=0;i<10;i++)s=advanceStudio(g,s,emptyStudioInput(),1/60)
 assert.equal(s.node,'sword.strike_2')
 for(let i=0;i<100;i++)s=advanceStudio(g,s,emptyStudioInput(),1/60)
 assert.equal(s.node,'sword.idle')
})
test('rejects dependency cycles, conflicting keys, unknown endpoints and missing recovery',()=>{
 const g=studioTemplate();g.dependencies=[{node:'sword.strike_1',predecessor:'sword.strike_2',candidateId:crypto.randomUUID()},{node:'sword.strike_2',predecessor:'sword.strike_1',candidateId:crypto.randomUUID()}]
 assert.ok(validateGraph(g).some(e=>e.includes('acyclic')))
 g.inputs.attack='KeyW';g.transitions[0].to='missing';g.transitions=g.transitions.filter(t=>t.event!=='finished')
 assert.ok(validateGraph(g).some(e=>e.includes('movement keys')));assert.ok(validateGraph(g).some(e=>e.includes('recovery')))
})
test('changed stance invalidates affected bindings and preserves unrelated clips',async()=>{
 let g=await freezeGraph(studioTemplate())
 const id=crypto.randomUUID();g.nodes=g.nodes.map(n=>({...n,clipId:id}))
 g.stances[1].description+=' Keep the guard higher.'
 g=await freezeGraph(g)
 assert.equal(g.nodes.find(n=>n.id==='sword.walk')!.clipId,null)
 assert.equal(g.nodes.find(n=>n.id==='upright.walk')!.clipId,id)
})
test('recipe compiles canonical full-body constraints and keeps target poses CPU-only',async()=>{
 const g=await freezeGraph(studioTemplate()),a=await studioRecipe(g,'sword.strike_1'),b=await studioRecipe(g,'sword.strike_2')
 assert.equal(a.recipe.fullBody?.length,3)
 assert.deepEqual(a.recipe.fullBody?.at(-1)?.positions,b.recipe.fullBody?.[0].positions)
 assert.ok(a.recipe.targetFullBody?.length)
 assert.equal('targetFullBody' in providerRequest(a.recipe).recipe,false)
 assert.equal(a.recipe.motionContract,g.nodes.find(n=>n.id==='sword.strike_1')!.contractHash)
})
