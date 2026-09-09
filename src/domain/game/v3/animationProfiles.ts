import { KIMODO_MODEL, motionRecipeSchema, type MotionRecipe } from './animation.ts'

/** Versioned experimental recipes. Availability never implies motion acceptance. */
export function animationRecipeProfile(state: MotionRecipe['state'], rigRevision: string, seed = 42): MotionRecipe {
  const descriptions: Record<MotionRecipe['state'], string> = {
    idle: 'A humanoid stands relaxed, breathing gently with both feet planted.',
    walk: 'A humanoid walks forward steadily with a natural repeating gait.',
    run: 'A humanoid runs forward steadily with a natural repeating gait.',
    backward: 'A humanoid walks backward, facing forward throughout.',
    strafe_left: 'A humanoid sidesteps left, facing forward throughout.',
    strafe_right: 'A humanoid sidesteps right, facing forward throughout.',
    takeoff: 'A humanoid bends the knees and pushes off both feet into a forward jump.',
    airborne: 'A humanoid holds a balanced airborne jumping pose with bent knees.',
    landing: 'A humanoid lands on both feet, bends the knees to absorb impact, then stands.',
    roll: 'A humanoid crouches, performs one forward shoulder roll, and recovers to standing.',
    catch: 'A humanoid catches a straight horizontal ledge with both hands and settles into hanging.',
    hang: 'A humanoid hangs still from a straight horizontal ledge with both hands supporting the body.',
    shimmy_left: 'A humanoid shimmies left along a straight ledge, alternating hand support.',
    shimmy_right: 'A humanoid shimmies right along a straight ledge, alternating hand support.',
    climb: 'A humanoid pulls up from hanging on a straight ledge, plants feet on top, and stands.',
  }
  const loop = ['idle','walk','run','backward','strafe_left','strafe_right','airborne','hang'].includes(state)
  const ledge = ['catch','hang','shimmy_left','shimmy_right','climb'].includes(state)
  const duration = state === 'takeoff' || state === 'landing' ? 1 : state === 'airborne' ? 2 : 4
  const recipe: MotionRecipe = {
    version:1,id:`humanoid.${state}.v1`,state,rigRevision,model:KIMODO_MODEL,prompt:descriptions[state],
    duration,candidates:1,seed,loop,targetSpeed:state==='run'?4:['walk','backward','strafe_left','strafe_right'].includes(state)?1.5:0,
    rootMode:ledge?'anchor_relative':state==='roll'?'controller_curve':'in_place',contacts:[],poses:[],path:[],
    thresholds:{version:1,maxContactError:.03,maxBoneLengthError:.005,maxSeamAngle:.1,maxSeamVelocity:.2,maxCorrection:.1},
  }
  // Canonical ledge: Y=1.8m, Z=.35m; rig origin is at floor level.
  // These constraints require measured bake validation before enabling a capability.
  if(ledge){
    const left: [number,number,number]=[-.25,1.8,.35], right: [number,number,number]=[.25,1.8,.35]
    const milestone=(time:number, x=0, y=.8)=>({time,joints:{Hips:[x,y,0] as [number,number,number],LeftLeg:[x-.1,y-.08,0] as [number,number,number],RightLeg:[x+.1,y-.08,0] as [number,number,number],LeftHand:left,RightHand:right}})
    if(state.startsWith('shimmy')){
      const shift=state==='shimmy_left'?-.35:.35
      const newLeft: [number,number,number]=[left[0]+shift,left[1],left[2]]
      const newRight: [number,number,number]=[right[0]+shift,right[1],right[2]]
      const first=milestone(0), second=milestone(1,shift/2), third=milestone(3,shift), last=milestone(4,shift)
      second.joints.LeftHand=newLeft;third.joints.LeftHand=newLeft;last.joints.LeftHand=newLeft
      third.joints.RightHand=newRight;last.joints.RightHand=newRight
      recipe.poses=[first,second,third,last]
      recipe.contacts=[{effector:'right_hand',start:0,end:1,position:right},{effector:'left_hand',start:1,end:4,position:newLeft},{effector:'right_hand',start:3,end:4,position:newRight}]
    }else{
      const start=state==='catch'?1:0, end=state==='climb'?2:duration
      recipe.poses=[milestone(start),milestone(end)]
      recipe.contacts=[{effector:'left_hand',start,end,position:left},{effector:'right_hand',start,end,position:right}]
      if(state==='climb')recipe.poses.push(milestone(duration,0,2.7))
    }
  }
  return motionRecipeSchema.parse(recipe)
}
