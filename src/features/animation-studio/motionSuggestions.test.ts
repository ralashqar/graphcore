import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blankGraph, clipNode, type FlexTransition } from '../../domain/game/animation-studio/flexible.ts'
import { studioSuggestions } from './motionSuggestions.ts'

const transition:FlexTransition={id:'greet',from:'idle',to:'bow',event:'greet',completion:false,conditions:[],earliest:0,latest:1,blendSeconds:.2,priority:0}
test('suggestions distinguish intentional endings and standalone states',()=>{
  const graph={...blankGraph(),entry:'idle',nodes:[{...clipNode('idle'),loop:true},clipNode('bow'),clipNode('dance')],transitions:[transition]}
  const before=JSON.stringify(graph)
  assert.ok(studioSuggestions(graph).some(s=>s.id==='ending.bow'))
  assert.ok(studioSuggestions(graph).some(s=>s.id==='unreachable.dance'))
  assert.equal(JSON.stringify(graph),before)
  graph.nodes[1].tags=['terminal'];graph.nodes[2].tags=['standalone']
  assert.equal(studioSuggestions(graph).some(s=>s.kind==='gap'),false)
  assert.ok(studioSuggestions(graph).some(s=>s.kind==='motions'&&s.choices.length===0))
})
test('machine entry, parent transitions and blend samples are reachable',()=>{
  const graph={...blankGraph(),entry:'mode',nodes:[{...clipNode('mode'),kind:'machine' as const,entry:'idle'},{...clipNode('idle'),parent:'mode',loop:true}, {...clipNode('blend'),kind:'blend' as const,samples:[{node:'sample',x:0,y:0}]}, {...clipNode('sample'),loop:true}],transitions:[{...transition,from:'mode',to:'blend'}]}
  assert.equal(studioSuggestions(graph).some(s=>s.id.startsWith('unreachable')),false)
})
test('entry and declared capability gaps offer graph edits without generation',()=>{
  const graph={...blankGraph(),nodes:[clipNode('idle')],gaps:['Moving props are unsupported']}
  const questions=studioSuggestions(graph)
  assert.ok(questions.find(s=>s.id==='entry')?.choices[0].prompt.includes('Set the graph entry'))
  assert.ok(questions.some(s=>s.question===graph.gaps[0]))
  assert.deepEqual(studioSuggestions(blankGraph()),[])
})
