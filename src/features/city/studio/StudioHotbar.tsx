// Bottom-centre hotbar (docs/city-studio-ui-v2.md): quick slots 1–9 for recent brush items, the style dice and the
// brush size. It is a shortcut strip, not a second navigation system.
import {DiceFive,Eraser,PaintBrush} from '@phosphor-icons/react';
import {BRUSH_SIZES,HOTBAR_SLOTS,nextBrushSize,type HotbarItem} from '../studioRail';
import {TARGET_ICONS} from './PaletteBrush';
import {FREE_PRESETS,freeOpeningOutline} from '../studioFreeOpeningTool';

/** The cut shape of a freeform opening preset as a small glyph. */
function ShapeGlyph({id}:{id:string}){const p=(FREE_PRESETS.find(x=>x.id===id)??FREE_PRESETS[0]).preset,loop=freeOpeningOutline(p.shape,p.width,p.height,10),scale=13/Math.max(p.width,p.height);return <svg viewBox="-16 -16 32 32" className="studio-slot-shape" aria-hidden="true"><path d={`M${loop.map(([x,y])=>`${(x*scale).toFixed(1)},${(-y*scale).toFixed(1)}`).join('L')}Z`}/></svg>;}
import type {StudioState} from './useStudioState';

const isActive=(st:StudioState,item:HotbarItem)=>(st.rail==='paint'||st.rail==='erase')&&st.target===item.target&&(item.color?st.color===item.color&&item.texture===undefined:item.texture!==undefined?st.texture===item.texture:item.free?st.openingKind==='free'&&st.freePresetId===item.free:item.kit?st.openingKind==='kit'&&st.kitModule===item.kit:item.stamp?st.stampId===item.stamp:item.trim?st.trimKind===item.trim:item.decor?st.decorKind===item.decor&&(item.module??'')===st.detailModule:item.roofOpening?st.roofPresetId===item.roofOpening&&st.roofMode==='roof-opening':item.roofDetail?st.roofModule===item.roofDetail&&st.roofMode==='roof-detail':false);

export function StudioHotbar({st}:{st:StudioState}){
 const items=st.hotbar.items,brush=st.rail==='paint'||st.rail==='erase',size=BRUSH_SIZES.find(s=>s.id===st.size);
 return <div className="studio-hotbar" role="toolbar" aria-label="Hotbar">
  {brush&&<span className={`studio-hotbar-mode${st.erase?' is-erase':''}`} title={st.erase?'Erasing · E paints':'Painting · E erases'}>{st.erase?<Eraser size={18}/>:<PaintBrush size={18}/>}</span>}
  <div className="studio-hotbar-slots">{Array.from({length:HOTBAR_SLOTS},(_,i)=>{const item=items[i];if(!item)return <span key={i} className="studio-slot is-empty" aria-hidden="true"><kbd>{i+1}</kbd></span>;const Glyph=TARGET_ICONS[item.target],texture=item.texture!==undefined;
   return <button key={item.id} className="studio-slot" aria-label={`Slot ${i+1}: ${item.label}`} title={`${item.label} · ${i+1}`} aria-pressed={isActive(st,item)} onClick={()=>st.useHotbar(item)}>{item.color?<i className="studio-slot-swatch" style={{background:item.color}}/>:texture?<i className={`studio-slot-swatch studio-material-sample is-${item.texture||'smooth'}`}/>:item.free?<ShapeGlyph id={item.free}/>:item.kit||item.roofDetail||item.module?<img src={`/city/synarc-kit/v${st.kitVersion}/thumbnails/${item.kit??item.roofDetail??item.module}.png`} alt=""/>:<Glyph size={18}/>}<kbd>{i+1}</kbd></button>;})}</div>
  <span className="studio-hotbar-divider" aria-hidden="true"/>
  {brush&&st.sizes.length>1&&<button className="studio-hotbar-size" aria-label="Cycle brush size" title={`Brush size: ${size?.label} (click to change)`} onClick={()=>st.chooseSize(nextBrushSize(st.size,st.sizes))}><span>{size?.label}</span></button>}
  <button className="studio-hotbar-dice" aria-label="Try another look" disabled={!st.diceReady} title={st.kitVersion!==5&&!st.recipe?.studio.facadeRhythm?'Add the Blender catalog to use variations':'Shuffle unlocked tiles or the facade rhythm; hand-placed edits stay · Space'} onClick={st.tryAnotherLook}><DiceFive size={20} weight="duotone"/><span>New look</span><kbd>Space</kbd></button>
 </div>;
}
