// Small procedural sound set for the construction studio. Sounds are synthesised with Web Audio
// (no downloaded assets), pitch-varied so repeats don't grate, throttled per cue, muted while the
// tab is hidden, and remembered per device.
import type {StudioCue} from './studioJuice';

const MUTE_KEY='city-studio-muted';
let context:AudioContext|null=null,master:GainNode|null=null,noise:AudioBuffer|null=null;
const last=new Map<StudioCue,number>();
const listeners=new Set<(muted:boolean)=>void>();

const readMuted=()=>{try{return localStorage.getItem(MUTE_KEY)==='1';}catch{return false;}};
let muted=typeof window==='undefined'?true:readMuted();

export const studioAudioMuted=()=>muted;
export function setStudioAudioMuted(next:boolean){muted=next;try{localStorage.setItem(MUTE_KEY,next?'1':'0');}catch{/* private mode */}listeners.forEach(l=>l(next));}
export function onStudioAudioMuted(listener:(muted:boolean)=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}

function ready():AudioContext|null{
 if(muted||typeof window==='undefined'||document.hidden)return null;
 const Ctor=window.AudioContext??(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
 if(!Ctor)return null;
 if(!context){context=new Ctor();master=context.createGain();master.gain.value=.32;master.connect(context.destination);const length=Math.floor(context.sampleRate*.4);noise=context.createBuffer(1,length,context.sampleRate);const data=noise.getChannelData(0);for(let i=0;i<length;i++)data[i]=Math.random()*2-1;}
 if(context.state==='suspended')void context.resume().catch(()=>{});
 return context;
}

const vary=(value:number)=>value*(.92+Math.random()*.16);

function tone(ctx:AudioContext,at:number,{from,to=from,type='sine',gain=.5,attack=.004,decay=.12}:{from:number;to?:number;type?:OscillatorType;gain?:number;attack?:number;decay?:number}){
 const osc=ctx.createOscillator(),env=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(vary(from),at);osc.frequency.exponentialRampToValueAtTime(Math.max(20,vary(to)),at+decay);
 env.gain.setValueAtTime(0,at);env.gain.linearRampToValueAtTime(gain,at+attack);env.gain.exponentialRampToValueAtTime(.0001,at+attack+decay);
 osc.connect(env).connect(master!);osc.start(at);osc.stop(at+attack+decay+.02);
}

function hiss(ctx:AudioContext,at:number,{frequency,q=1,gain=.4,decay=.12,sweep}:{frequency:number;q?:number;gain?:number;decay?:number;sweep?:number}){
 if(!noise)return;const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),env=ctx.createGain();src.buffer=noise;filter.type='bandpass';filter.Q.value=q;filter.frequency.setValueAtTime(vary(frequency),at);if(sweep)filter.frequency.exponentialRampToValueAtTime(vary(sweep),at+decay);
 env.gain.setValueAtTime(gain,at);env.gain.exponentialRampToValueAtTime(.0001,at+decay);src.connect(filter).connect(env).connect(master!);src.start(at);src.stop(at+decay+.02);
}

const THROTTLE:Partial<Record<StudioCue,number>>={tick:70,paint:90,place:60};

/** Plays a short cue. Safe to call often: cues are throttled and silent when muted. */
export function playStudioCue(cue:StudioCue){
 const now=performance.now(),gap=THROTTLE[cue]??110;if(now-(last.get(cue)??-Infinity)<gap)return;last.set(cue,now);
 const ctx=ready();if(!ctx||!master)return;const t=ctx.currentTime+.005;
 switch(cue){
  case 'build':tone(ctx,t,{from:150,to:70,gain:.7,decay:.22});hiss(ctx,t,{frequency:900,q:.7,gain:.25,decay:.18});tone(ctx,t+.06,{from:520,to:760,gain:.18,decay:.1});break;
  case 'grow':tone(ctx,t,{from:420,to:640,type:'triangle',gain:.28,decay:.1});break;
  case 'place':tone(ctx,t,{from:260,to:150,gain:.5,decay:.12});tone(ctx,t+.02,{from:880,to:1180,gain:.14,decay:.07});break;
  case 'paint':hiss(ctx,t,{frequency:2200,sweep:1200,q:2.2,gain:.32,decay:.1});break;
  case 'remove':hiss(ctx,t,{frequency:1400,sweep:300,q:1.2,gain:.35,decay:.18});tone(ctx,t,{from:300,to:120,gain:.25,decay:.14});break;
  case 'dice':for(let i=0;i<4;i++)tone(ctx,t+i*.045,{from:700+i*140,type:'triangle',gain:.18,decay:.04});break;
  case 'tick':tone(ctx,t,{from:1500,type:'square',gain:.05,decay:.025});break;
  case 'undo':hiss(ctx,t,{frequency:1800,sweep:500,q:1.5,gain:.22,decay:.14});break;
  case 'redo':hiss(ctx,t,{frequency:500,sweep:1800,q:1.5,gain:.22,decay:.14});break;
  case 'invalid':tone(ctx,t,{from:150,to:120,type:'square',gain:.07,decay:.12});break;
  case 'chime':tone(ctx,t,{from:660,gain:.25,decay:.35});tone(ctx,t+.09,{from:990,gain:.22,decay:.45});break;
 }
}
