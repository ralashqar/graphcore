import test from 'node:test'
import assert from 'node:assert/strict'
import { blankGraph,clipNode,freezeFlexible } from './flexible.ts'
import { flexibleMotionPrompt } from './motionPrompt.ts'
import { flexibleRecipe } from './flexibleRecipes.ts'
import { assemblePreflight,currentPreflight,deterministicPreflight } from './preflight.ts'

test('loop flags reach recipes and toggling invalidates readiness without changing one-shot prompts',async()=>{
 const g=blankGraph();g.nodes=[clipNode('wave')];g.entry='wave'
 const plain=flexibleMotionPrompt(g,g.nodes[0]);assert.match(plain,/Action to generate:/)
 const report=await assemblePreflight(g,{nodes:[{nodeId:'wave',requirements:[{capability:'humanoid_motion',evidence:g.nodes[0].description}],issues:[]}]})
 g.nodes[0].loop=true
 assert.equal(await currentPreflight(g,[report]),null)
 const frozen=await freezeFlexible(g),{recipe}=await flexibleRecipe(frozen,'wave')
 assert.equal(recipe.loop,true);assert.match(recipe.prompt,/continuous repeating motion/);assert.match(recipe.prompt,/without accumulating horizontal root travel/)
 g.nodes[0].loop=false;assert.equal(flexibleMotionPrompt(g,g.nodes[0]),plain)
})
test('travel cycles do not close world paths and neighboring actions are excluded',()=>{
 const g=blankGraph(),n=clipNode('walk');n.loop=true;n.rootMode='controller_curve';g.nodes=[n,clipNode('stop')]
 g.transitions=[{id:'stop',from:'walk',to:'stop'} as typeof g.transitions[number]]
 const prompt=flexibleMotionPrompt(g,n)
 assert.match(prompt,/do not return to the starting world position/);assert.doesNotMatch(prompt,/A humanoid performs stop/)
 n.rootMode='anchor_relative';assert.match(flexibleMotionPrompt(g,n),/respecting contact constraints/)
 n.kind='machine';assert.doesNotMatch(flexibleMotionPrompt(g,n),/continuous repeating motion/)
})
test('cyclic guidance counts toward provider length and is never silently truncated',async()=>{
 const g=blankGraph();g.nodes=[{...clipNode('idle'),loop:true,description:'a'.repeat(1300)}];g.entry='idle'
 assert.ok(deterministicPreflight(g)[0].findings.some(f=>f.code==='prompt_too_long'))
 await assert.rejects(flexibleRecipe(await freezeFlexible(g),'idle'),/exceeds provider limit/)
})


test('wave to bow sends only the bow action and its own posture boundaries',async()=>{
 const g=blankGraph(),wave=clipNode('wave'),bow=clipNode('bow'),idle=clipNode('idle');
 wave.description='Raise the right hand and wave three times.';idle.description='Stand breathing quietly.';
 bow.description='Bend forward at the waist, pause, then straighten up with arms lowered.';
 bow.entryDescription='Upright, both arms by the sides.';bow.exitDescription='Upright with arms lowered.';
 g.nodes=[wave,bow,idle];g.entry='wave';
 g.transitions=[{id:'wave-bow',from:'wave',to:'bow'},{id:'bow-idle',from:'bow',to:'idle'}].map(t=>({...t,event:null,completion:true,conditions:[],earliest:0,latest:1,blendSeconds:.1,priority:0}));
 const prompt=flexibleMotionPrompt(g,bow);
 assert.match(prompt,/Bend forward at the waist/);assert.match(prompt,/Starting pose: Upright/);
 assert.doesNotMatch(prompt,/wave three times|breathing quietly|Previous:|Next:/);
 const recipe=await flexibleRecipe(await freezeFlexible(g),'bow');assert.equal(recipe.recipe.prompt,prompt);
 wave.description='Jump and spin while waving.';assert.equal(flexibleMotionPrompt(g,bow),prompt);
})

test('old prompt-policy reports cannot admit new requests',async()=>{
 const g=blankGraph();g.nodes=[clipNode('wave')];g.entry='wave';
 const report=await assemblePreflight(g,{nodes:[{nodeId:'wave',requirements:[{capability:'humanoid_motion',evidence:g.nodes[0].description}],issues:[]}]});
 const {hashGameValue}=await import('../compiler.ts');const {graphIntent,PREFLIGHT_VERSION}=await import('./preflight.ts');
 const old={...report,fingerprint:await hashGameValue({version:PREFLIGHT_VERSION,promptPolicy:'animation-loop-prompt-1.0.0',graph:graphIntent(g)})};
 assert.equal(await currentPreflight(g,[old]),null);assert.ok(await currentPreflight(g,[report]));
})
