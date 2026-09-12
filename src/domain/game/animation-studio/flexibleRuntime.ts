import { ancestors, type FlexibleGraph, type FlexNode, type FlexTransition } from './flexible.ts'
export type FlexState={node:string|null;elapsed:number;time:number;parameters:Record<string,number|string|boolean>;pending:Record<string,number>;weights:Record<string,number>;previous:Record<string,number>;blendTime:number;blendDuration:number;history:string[]}
function enter(g:FlexibleGraph,id:string|null):string|null{let n=g.nodes.find(n=>n.id===id);const seen=new Set<string>();while(n?.kind==='machine'&&!seen.has(n.id)){seen.add(n.id);n=g.nodes.find(x=>x.id===n!.entry)}return n?.id??null}
export function initialFlexible(g:FlexibleGraph,start=g.entry):FlexState{const node=enter(g,start);return{node,elapsed:0,time:0,parameters:Object.fromEntries(g.parameters.map(p=>[p.id,p.initial])),pending:{},weights:node?{[node]:1}:{},previous:{},blendTime:1,blendDuration:0,history:[]}}
export function flexibleWeights(s:FlexState){const t=s.blendDuration?Math.min(1,s.blendTime/s.blendDuration):1;return Object.fromEntries([...new Set([...Object.keys(s.previous),...Object.keys(s.weights)])].map(id=>[id,(s.previous[id]??0)*(1-t)+(s.weights[id]??0)*t]).filter(([,v])=>Number(v)>.0001)) as Record<string,number>}
export function blendWeights(n:FlexNode,parameters:FlexState['parameters']):Record<string,number>{
 const x=Number(parameters[n.axes[0]]??0),y=Number(parameters[n.axes[1]]??0),samples=[...n.samples]
 if(!samples.length)return{}
 if(n.axes.length===1){samples.sort((a,b)=>a.x-b.x);if(x<=samples[0].x)return{[samples[0].node]:1};if(x>=samples.at(-1)!.x)return{[samples.at(-1)!.node]:1};const i=samples.findIndex(s=>s.x>=x),a=samples[i-1],b=samples[i],t=(x-a.x)/(b.x-a.x);return{[a.node]:1-t,[b.node]:t}}
 const exact=samples.find(s=>Math.hypot(s.x-x,s.y-y)<.0001);if(exact)return{[exact.node]:1}
 // Explicit inverse-distance blend for arbitrary 2D sample layouts.
 const weights=samples.map(s=>({id:s.node,w:1/Math.max(.00001,(s.x-x)**2+(s.y-y)**2)})),sum=weights.reduce((v,s)=>v+s.w,0)
 return Object.fromEntries(weights.map(s=>[s.id,s.w/sum]))
}
export function transitionReady(g:FlexibleGraph,s:FlexState,t:FlexTransition){
 if(!s.node||!ancestors(g,s.node).includes(t.from))return false
 const n=g.nodes.find(n=>n.id===s.node)!,phase=n.loop?(s.elapsed%n.duration)/n.duration:Math.min(1,s.elapsed/n.duration)
 if(phase<t.earliest||phase>t.latest||t.completion&&(n.loop||s.elapsed<n.duration))return false
 return t.conditions.every(c=>{const v=s.parameters[c.parameter];switch(c.operator){case'eq':return v===c.value;case'ne':return v!==c.value;case'gt':return Number(v)>Number(c.value);case'lt':return Number(v)<Number(c.value);case'gte':return Number(v)>=Number(c.value);case'lte':return Number(v)<=Number(c.value)}})
}
export function advanceFlexible(g:FlexibleGraph,previous:FlexState,events:string[],delta:number):FlexState{
 const dt=Math.min(.1,Math.max(0,Number.isFinite(delta)?delta:0)),s={...previous,pending:{...previous.pending},elapsed:previous.elapsed+dt,time:previous.time+dt,blendTime:previous.blendTime+dt}
 for(const id of events){const e=g.events.find(e=>e.id===id);if(e)s.pending[id]=s.time+e.bufferSeconds}
 for(const [id,until]of Object.entries(s.pending))if(until<s.time)delete s.pending[id]
 const chain=s.node?ancestors(g,s.node):[],transitions=g.transitions.filter(t=>chain.includes(t.from)).sort((a,b)=>chain.indexOf(a.from)-chain.indexOf(b.from)||b.priority-a.priority||a.id.localeCompare(b.id))
 const t=transitions.find(t=>transitionReady(g,s,t)&&(!t.event||s.pending[t.event]!==undefined))
 if(t){s.node=enter(g,t.to);s.elapsed=0;s.previous=flexibleWeights(previous);s.blendTime=0;s.blendDuration=t.blendSeconds;s.history=[...s.history.slice(-19),`${t.from} → ${t.to}`];if(t.event)delete s.pending[t.event]}
 const node=g.nodes.find(n=>n.id===s.node);s.weights=node?.kind==='blend'?blendWeights(node,s.parameters):node?{[node.id]:1}:{}
 return s
}
