import { providerRequest } from '../v3/animationProviders.ts'
import { inferenceRequestSchema } from '../v3/animationTransport.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { blankGraph,clipNode,freezeFlexible,applyGraphEdit,graphEditSchema,flexibleProblems,convertLegacy } from './flexible.ts'
import { initialFlexible,advanceFlexible,blendWeights } from './flexibleRuntime.ts'
import { flexibleRecipe } from './flexibleRecipes.ts'
import { studioTemplate } from './templates.ts'
const emptyEdit=()=>graphEditSchema.parse({summary:'Edit graph',nodes:{upsert:[],remove:[]},transitions:{upsert:[],remove:[]},styles:{upsert:[],remove:[]},parameters:{upsert:[],remove:[]},events:{upsert:[],remove:[]},props:{upsert:[],remove:[]},anchors:{upsert:[],remove:[]},dependencies:null,name:null,entry:null,changeEntry:false,gaps:null})
test('arbitrary sequence works without locomotion, combat or recovery',()=>{
 const g=blankGraph();g.nodes=[clipNode('wave'),clipNode('bow')];g.entry='wave';g.transitions=[{id:'finish',from:'wave',to:'bow',event:null,completion:true,conditions:[],earliest:1,latest:1,blendSeconds:.2,priority:0}]
 assert.deepEqual(flexibleProblems(g),[]);let s=initialFlexible(g);for(let i=0;i<70;i++)s=advanceFlexible(g,s,[],.1);assert.equal(s.node,'bow')
})
test('nested entry and leaf transition precedence are deterministic',()=>{
 const g=blankGraph();g.nodes=[{...clipNode('mode'),kind:'machine',entry:'idle'}, {...clipNode('idle'),parent:'mode',loop:true},clipNode('wave'),clipNode('bow')];g.entry='mode';g.events=[{id:'greet',label:'Greet',key:null,bufferSeconds:0}]
 const t={id:'leaf',from:'idle',to:'wave',event:'greet',completion:false,conditions:[],earliest:0,latest:1,blendSeconds:.2,priority:0};g.transitions=[t,{...t,id:'parent',from:'mode',to:'bow',priority:99}]
 assert.equal(initialFlexible(g).node,'idle');assert.equal(advanceFlexible(g,initialFlexible(g),['greet'],.01).node,'wave')
})
test('1D and 2D blends normalize and hit authored samples',()=>{
 const n={...clipNode('blend'),kind:'blend' as const,axes:['speed'],samples:[{node:'idle',x:0,y:0},{node:'walk',x:1,y:0}]}
 assert.deepEqual(blendWeights(n,{speed:.25}),{idle:.75,walk:.25});n.axes=['x','y'];assert.deepEqual(blendWeights(n,{x:1,y:0}),{walk:1});assert.equal(Object.values(blendWeights(n,{x:.4,y:.2})).reduce((a,b)=>a+b,0),1)
})
test('prompt edits preserve clips for labels and transitions, invalidate changed motion',async()=>{
 let g=blankGraph();g.nodes=[clipNode('wave')];g.entry='wave';g=await freezeFlexible(g);g.nodes[0].clipId=crypto.randomUUID()
 const e=emptyEdit();e.nodes.upsert=[{...g.nodes[0],label:'Friendly wave',clipId:null,contractHash:null}];let result=await applyGraphEdit(g,e);assert.equal(result.graph.nodes[0].clipId,g.nodes[0].clipId)
 e.nodes.upsert[0].description='A humanoid waves slowly with their left hand.';result=await applyGraphEdit(g,e);assert.equal(result.graph.nodes[0].clipId,null)
})
test('scope expansion cannot silently modify siblings or shared state',async()=>{
 const g=blankGraph();g.nodes=[clipNode('wave'),clipNode('bow')];const e=emptyEdit();e.nodes.remove=['bow'];const result=await applyGraphEdit(g,e,['wave']);assert.deepEqual(result.scopeExpansion,['bow'])
})
test('rejects recursive hierarchy, dependency cycles and invalid parameter types',()=>{
 const g=blankGraph();g.nodes=[{...clipNode('a'),kind:'machine',parent:'a',entry:'a'}];assert.ok(flexibleProblems(g).length)
 g.nodes=[clipNode('a'),clipNode('b')];g.dependencies=[{node:'a',predecessor:'b',candidateId:null},{node:'b',predecessor:'a',candidateId:null}];assert.ok(flexibleProblems(g).some(e=>e.includes('acyclic')))
})
test('generic compiler preserves arbitrary text and world anchor coordinates',async()=>{
 let g=blankGraph();g.nodes=[clipNode('wave','Friendly wave')];g.entry='wave';g.props=[{id:'chair',label:'Chair',shape:'box',position:[1,0,2],size:[1,1,1]}];g.anchors=[{id:'hand',prop:'chair',position:[.2,1,0]}];g.nodes[0].contacts=[{anchor:'hand',effector:'right_hand',start:0,end:1,hips:[0,1,0],leftHip:[-.1,.9,0],rightHip:[.1,.9,0]}];g=await freezeFlexible(g)
 const {recipe}=await flexibleRecipe(g,'wave');assert.equal(recipe.state,'custom');assert.equal(inferenceRequestSchema.parse(providerRequest(recipe)).recipe.state,'custom');assert.match(recipe.prompt,/Friendly wave/);assert.deepEqual(recipe.contacts[0].position,[1.2,1,2]);assert.equal(recipe.retargetRevision,'soma-fabric-flexible-1.0.0')
})
test('legacy conversion preserves original graph and creates independent revision data',()=>{const old=studioTemplate(),before=JSON.stringify(old),g=convertLegacy(old);assert.equal(JSON.stringify(old),before);assert.equal(g.version,3);assert.deepEqual(flexibleProblems(g),[])})
