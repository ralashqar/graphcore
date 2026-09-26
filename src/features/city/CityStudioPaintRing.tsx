import {useEffect} from 'react';
import {X} from '@phosphor-icons/react';

export type PaintRingChoice={color?:string;texture?:string};
const SIZE=224;
const MATERIALS:[string,string][]=[['','Smooth'],['brick','Brick'],['plaster','Plaster'],['concrete','Stone'],['timber','Timber']];

/** Tiny Glade-style radial palette around the cursor: colours on the outer ring, materials on
 * the inner ring. Hovering previews on the building, clicking applies, Escape or outside cancels. */
export function CityStudioPaintRing({x,y,colors,current,preview,pick,close}:{x:number;y:number;colors:readonly string[];current:{color:string;texture:string};preview:(choice:PaintRingChoice|null)=>void;pick:(choice:PaintRingChoice)=>void;close:()=>void}){
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'||e.key.toLowerCase()==='c'){e.preventDefault();e.stopPropagation();close();}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[close]);
 const outer=86,inner=46;
 const place=(i:number,count:number,radius:number)=>{const a=-Math.PI/2+i/count*Math.PI*2;return {left:SIZE/2+Math.cos(a)*radius,top:SIZE/2+Math.sin(a)*radius};};
 return <div className="studio-ring-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget){e.stopPropagation();close();}}}>
  <div className="studio-ring" role="dialog" aria-label="Quick paint" style={{left:x,top:y}} onPointerLeave={()=>preview(null)}>
   {colors.map((c,i)=>{const p=place(i,colors.length,outer);return <button key={c} className="studio-ring-swatch" aria-label={`Paint ${c}`} aria-pressed={current.color===c} style={{...p,background:c}} onPointerEnter={()=>preview({color:c})} onFocus={()=>preview({color:c})} onClick={()=>pick({color:c})}/>;})}
   {MATERIALS.map(([id,label],i)=>{const p=place(i,MATERIALS.length,inner);return <button key={id||'smooth'} className="studio-ring-material" aria-label={label} title={label} aria-pressed={current.texture===id} style={p} onPointerEnter={()=>preview({texture:id})} onFocus={()=>preview({texture:id})} onClick={()=>pick({texture:id})}><i className={`studio-material-sample is-${id||'smooth'}`}/></button>;})}
   <button className="studio-ring-close" aria-label="Close quick paint" onClick={close}><X size={14}/></button>
  </div>
 </div>;
}
