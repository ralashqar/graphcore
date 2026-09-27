import {ROOF_OPENING_PRESETS} from '../../../domain/cityStudioRoofOpenings';
import {CityNycRoofDetails} from '../CityNycRoofDetails';
import type {StudioState} from './useStudioState';
import {StyleFilter,moduleStyle,styleMatches} from './studioStyles';

/** Skylights, dormers and rooftop kit details: shared by the Roof tool and the brush's Roof details target. */
export function RoofExtras({st}:{st:StudioState}){
 const recipe=st.recipe!,part=st.selected?.operation==='add'?st.selected:undefined;
 return <>
  {recipe.studio.roofRevision&&<div className="studio-roof-openings" role="group" aria-label="Skylights and dormers"><span className="studio-caption">Skylights & dormers</span><div className="studio-tray is-grid">{ROOF_OPENING_PRESETS.map(p=><button className="studio-tile" key={p.id} aria-label={`Add ${p.label}`} aria-pressed={st.effectiveTool==='roof-opening'&&st.roofPresetId===p.id} onClick={()=>st.chooseRoofOpening(p.id,p.label)}><svg viewBox="-26 -26 52 52" className="studio-free-icon" aria-hidden="true"><rect x="-26" y="-26" width="52" height="52" rx="6"/>{p.preset.kind==='skylight'?<path d="M-15,10 L-5,-14 L15,-14 L5,10 Z"/>:<path d={p.preset.roof==='gable'?'M-12,14 L-12,-2 L0,-14 L12,-2 L12,14 Z':'M-15,14 L-15,-6 L15,-12 L15,14 Z'}/>}</svg><span>{p.label}</span></button>)}</div><small className="studio-palette-hint">Click a sloped roof to add · drag one to move it · Select → Object edits it</small></div>}
  {st.kitVersion>=4&&<><span className="studio-caption">Roof details</span>{st.kitVersion===5&&<StyleFilter value={st.styleFilter} onChange={st.setStyleFilter}/>}<CityNycRoofDetails recipe={recipe} part={part} design={st.draft.design} commit={st.commit} placing={st.effectiveTool==='roof-detail'?st.roofModule:null} place={module=>st.chooseRoofDetail(module)} filter={id=>styleMatches(st.styleFilter,moduleStyle(id))}/></>}
 </>;
}
