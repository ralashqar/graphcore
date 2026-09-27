// Slim vertical tool rail: one icon per verb, hotkey badge and a tooltip (docs/city-studio-ui-v2.md).
import {Armchair,CaretLeft,CaretRight,Cube,Cursor,Door,Eraser,House,PaintBrush,Plant,type Icon} from '@phosphor-icons/react';
import {STUDIO_RAIL,type StudioRailTool} from '../studioRail';
import type {StudioState} from './useStudioState';

export const RAIL_ICONS:Record<StudioRailTool,Icon>={select:Cursor,build:Cube,paint:PaintBrush,erase:Eraser,roof:House,garden:Plant,rooms:Door,furnish:Armchair};

export function StudioToolRail({st}:{st:StudioState}){
 const button=(t:typeof STUDIO_RAIL[number])=>{const Glyph=RAIL_ICONS[t.id],active=st.rail===t.id;
  return <button key={t.id} className={`studio-rail-tool is-${t.id}`} aria-label={t.label} aria-pressed={active} aria-keyshortcuts={t.hotkey} title={`${t.label} · ${t.hotkey}`} onClick={()=>t.id==='erase'&&st.rail==='paint'?st.toggleErase():st.chooseRail(t.id)}>
   <Glyph size={22} weight={active?'fill':'regular'}/><kbd aria-hidden="true">{t.hotkey}</kbd><span className="studio-tip" aria-hidden="true">{t.label} <kbd>{t.hotkey}</kbd><small>{t.hint}</small></span>
  </button>;};
 return <nav className="studio-toolrail" aria-label="Building tools">
  {STUDIO_RAIL.filter(t=>!t.interior).map(button)}
  <span className="studio-toolrail-divider" aria-hidden="true"/>
  {STUDIO_RAIL.filter(t=>t.interior).map(button)}
  <span className="studio-toolrail-spacer" aria-hidden="true"/>
  <button className="studio-rail-collapse" aria-label={st.paletteOpen?'Hide palette':'Show palette'} aria-expanded={st.paletteOpen} title={st.paletteOpen?'Hide palette':'Show palette'} onClick={()=>st.setPaletteOpen(!st.paletteOpen)}>{st.paletteOpen?<CaretLeft size={16}/>:<CaretRight size={16}/>}</button>
 </nav>;
}
