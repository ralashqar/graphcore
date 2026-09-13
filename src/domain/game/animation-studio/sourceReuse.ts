import { motionFingerprint, type FlexibleGraph } from './flexible.ts'
// Source reuse may change processing, never the motion that was requested.
export async function reusableLocomotionSource(original:FlexibleGraph,current:FlexibleGraph,nodeId:string){
 const before=original.nodes.find(n=>n.id===nodeId),after=current.nodes.find(n=>n.id===nodeId)
 if(!before||!after?.locomotion||before.kind!=='clip'||after.kind!=='clip'||before.contacts.length||after.contacts.length||original.dependencies.some(d=>d.node===nodeId)||current.dependencies.some(d=>d.node===nodeId))return false
 const context=(g:FlexibleGraph)=>g.transitions.filter(t=>t.from===nodeId||t.to===nodeId).map(t=>`${t.to===nodeId?'Previous':'Next'}: ${g.nodes.find(n=>n.id===(t.to===nodeId?t.from:t.to))?.description??''}`).join(' ')
 if(context(original)!==context(current))return false
 const normalize=(n:typeof before)=>({...n,locomotion:undefined,loop:true})
 return await motionFingerprint(original,normalize(before))===await motionFingerprint(current,normalize(after))
}
