import test from 'node:test'
import assert from 'node:assert/strict'
import { presentPose } from './presentation.ts'

test('fixed-step presentation stays continuous at 144 Hz and snaps teleports', () => {
  let last = -1/60
  for(let frame=0;frame<144;frame++) {
    const time=frame/144,tick=Math.floor(time*60),alpha=time*60-tick
    const pose=(t:number)=>({position:{x:t/60,y:0,z:0},yaw:0})
    const shown=presentPose(pose(tick),pose(tick-1),alpha)
    if(frame)assert(Math.abs(shown.position.x-last-1/144)<1e-10)
    last=shown.position.x
  }
  const previous={position:{x:0,y:0,z:0},yaw:Math.PI-.01},current={position:{x:.1,y:0,z:0},yaw:-Math.PI+.01}
  assert(Math.abs(presentPose(current,previous,.5).yaw-Math.PI)<1e-10)
  const teleport={...current,position:{x:10,y:0,z:0}}
  assert.deepEqual(presentPose(teleport,previous,.5),teleport)
})
