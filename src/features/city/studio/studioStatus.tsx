// The status line under the stage: issues first, then what the current tool does (moved from CityStudio.tsx).
import {Stairs} from '@phosphor-icons/react';
import {SELECT_LEVELS} from '../studioRail';
import type {StudioState} from './useStudioState';

export function studioStatus(st:StudioState){
 const {land,recipe,interaction,effectiveTool:tool,erase}=st;
 if(interaction.issue)return <span>{interaction.issue}</span>;
 if(interaction.note)return <span>{interaction.note}</span>;
 if(interaction.active&&!interaction.outlineGhost&&!interaction.wallGhost&&!interaction.paintPreview.length)return <span className="studio-preparing">Checking placement…</span>;
 if(land.previewStatus.pending)return <span className="studio-preparing">Shaping your building…</span>;
 if(!recipe)return null;
 if(!recipe.volumes.length)return <span>Draw your first block inside the plot</span>;
 if(st.paintPicking)return <span>{st.paintRules.hint}</span>;
 if(tool==='rhythm-face')return <span>{st.rhythmPanel.hint}</span>;
 if(tool==='outline')return <span>Pull an exposed {st.outlineEdgeMode==='bay'?'bay':'wall'} · Drag an amber corner inward to {st.outlineCornerMode==='recess'?'recess':'bevel'} · 0.5 m snap</span>;
 if(tool==='balcony')return <span>Brush across neighbouring upper windows</span>;
 if(tool==='stair')return <span><Stairs size={16}/> Choose a side wall · Stairs fit the floor heights</span>;
 if(tool==='roof-opening')return <span>Click a sloped roof to add · Drag one to move it · Click one to change its style</span>;
 if(tool==='roof-detail')return <span>Click a flat roof to place · R to turn · Escape to finish</span>;
 if(tool==='free-opening')return <span>{st.openingKind==='free'&&st.freePresetId==='arcade'?'Drag along a ground-floor wall to lay out arches · Scroll while dragging to change their height':'Click a wall to cut an opening · Drag one to move it · Near the ground it becomes a door'}</span>;
 if(tool==='surface'){
  if(st.eyedropper)return <span>Click a wall to sample its finish</span>;
  if(erase)return <span>{interaction.paintFace?'Click paint to remove it':'Click or drag to restore the inherited finish'} · Alt-click samples</span>;
  if(st.scope==='wall')return <span>Click a wall to paint all of it · C for quick colours</span>;
  if(st.scope==='part')return <span>Click a part to paint every wall · C for quick colours</span>;
  return <span>{interaction.paintFace&&st.band?(st.bandAround?'Drag up or down to band the whole building':'Drag up or down to paint a band · Shift runs it around the building'):'Click or drag to paint · C for quick colours · Alt-click samples'}</span>;
 }
 if(tool==='pick'){
  if(st.rail==='erase')return <span>Click to erase {st.size==='wall'?'everything of this kind on a wall':st.size==='part'?'everything of this kind on a part':'one item'} · the red outline shows what goes</span>;
  if(st.rail==='paint')return <span>Click a free window or door to add or remove this trim</span>;
  const level=SELECT_LEVELS.find(l=>l.id===st.level);
  return <span>Select {level?.label.toLowerCase()}s · Shift adds · Double-click drills down · Tab changes level · Esc steps up</span>;
 }
 if(tool==='roof')return <span>{st.selected?'Drag the roof handles for height, eave and crown · or pick a style in the palette':'Click a roof or a part to shape its roof'}</span>;
 if(st.rail==='garden')return <span>Planting, ground and boundary apply to the whole plot</span>;
 if(tool==='select')return st.rail==='select'?<span>Choose a part · Pull a handle to reshape it · Tab to pick walls, tiles or openings</span>:null;
 if(tool.startsWith('interior-furniture'))return null;
 if(tool.startsWith('interior'))return <span>Click to place · Drag to extend · Escape to cancel</span>;
 return <span>Click to place · Drag to extend · Escape to cancel</span>;
}
