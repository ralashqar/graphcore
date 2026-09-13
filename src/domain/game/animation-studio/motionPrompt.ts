import type { FlexibleGraph,FlexNode } from './flexible.ts'
export const MOTION_PROMPT_POLICY='animation-action-prompt-1.1.0'
export function flexibleMotionPrompt(g:FlexibleGraph,n:FlexNode){
 const cyclic=n.kind==='clip'&&n.loop
 const guidance=cyclic?'Generate continuous repeating motion with complete cycles and consistent rhythm. The same activity is already ongoing at the start and continues at the end; no introductory or finishing gesture. Match body pose and motion smoothly across the cycle boundary.' : ''
 const root=cyclic?(n.rootMode==='controller_curve'?'Repeat the body cycle while maintaining travel direction; do not return to the starting world position.':n.rootMode==='in_place'?'Keep the cycle in place without accumulating horizontal root travel.':'Repeat around the authored anchor while respecting contact constraints.') : ''
 // Runtime transitions are not generation instructions. A selected predecessor's
 // ending pose is supplied separately by flexibleRecipe as a full-body constraint.
 return [
  `Action to generate: ${n.description}`,
  g.styles.find(s=>s.id===n.style)?.description?`Performance style: ${g.styles.find(s=>s.id===n.style)!.description}`:'',
  n.entryDescription?`Starting pose: ${n.entryDescription}`:'',
  n.exitDescription?`Ending pose: ${n.exitDescription}`:'',
  'Generate only this action. Starting and ending poses are boundary conditions, not additional actions.',
  guidance,root,
 ].filter(Boolean).join(' ')
}
