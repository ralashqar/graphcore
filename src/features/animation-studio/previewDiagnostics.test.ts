import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blankGraph, clipNode, type FlexTransition } from '../../domain/game/animation-studio/flexible.ts'
import { initialFlexible } from '../../domain/game/animation-studio/flexibleRuntime.ts'
import { transitionReason } from './previewDiagnostics.ts'

test('transition explanations distinguish source, completion, windows and conditions', () => {
  const graph = {...blankGraph(), entry:'idle', nodes:[clipNode('idle','Idle'),clipNode('wave','Wave')], parameters:[{id:'energy',label:'Energy',type:'number' as const,initial:0,min:0,max:1,options:[]}]}
  const state = initialFlexible(graph)
  const transition:FlexTransition={id:'wave',from:'idle',to:'wave',event:null,completion:false,conditions:[{parameter:'energy',operator:'gt',value:.5}],earliest:0,latest:1,blendSeconds:.2,priority:0}
  assert.equal(transitionReason(graph,state,{...transition,from:'wave'}),'Play Wave first')
  assert.equal(transitionReason(graph,state,{...transition,completion:true}),'Waiting for clip completion')
  assert.match(transitionReason(graph,state,{...transition,earliest:.5}),/Opens at 50%/)
  assert.match(transitionReason(graph,{...state,elapsed:2},{...transition,latest:.2}),/window has closed/)
  assert.equal(transitionReason(graph,state,transition),'Requires Energy > 0.5')
  assert.equal(transitionReason(graph,{...state,parameters:{energy:1}},transition),'Ready')
})
