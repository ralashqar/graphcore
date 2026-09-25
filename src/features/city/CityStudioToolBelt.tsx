import {AppWindow,Armchair,Cube,DiceFive,Door,House,PaintBrush,Plant,SlidersHorizontal,Sparkle,type Icon} from '@phosphor-icons/react';
import {STUDIO_BELT,type StudioCategory} from './studioTools';

const ICONS:Record<StudioCategory,Icon>={Shape:Cube,Roofs:House,Surfaces:PaintBrush,Openings:AppWindow,Details:Sparkle,Garden:Plant,Rooms:Door,Furniture:Armchair};

/** One row of verbs: pick a tool, roll the style dice, or open fine-tuning. */
export function CityStudioToolBelt({category,choose,dice,diceDisabled,diceHint,more,moreOpen}:{category:StudioCategory;choose:(category:StudioCategory)=>void;dice:()=>void;diceDisabled:boolean;diceHint:string;more:()=>void;moreOpen:boolean}){
 const exterior=STUDIO_BELT.filter(tool=>!tool.interior),interior=STUDIO_BELT.filter(tool=>tool.interior);
 const button=(tool:typeof STUDIO_BELT[number])=>{const Glyph=ICONS[tool.category],active=category===tool.category;return <button key={tool.category} aria-pressed={active} title={`${tool.hint} · ${tool.hotkey}`} onClick={()=>choose(tool.category)}><Glyph size={20} weight={active?'fill':'regular'}/><span>{tool.label}</span><kbd aria-hidden="true">{tool.hotkey}</kbd></button>;};
 return <nav className="studio-belt" aria-label="Building tools">
  <div className="studio-belt-group">{exterior.map(button)}</div>
  <span className="studio-belt-divider" aria-hidden="true"/>
  <div className="studio-belt-group">{interior.map(button)}</div>
  <span className="studio-belt-divider" aria-hidden="true"/>
  <button className="studio-belt-dice" aria-label="Try another look" disabled={diceDisabled} title={diceHint} onClick={dice}><DiceFive size={20} weight="duotone"/><span>New look</span><kbd aria-hidden="true">Space</kbd></button>
  <button className="studio-belt-more" aria-expanded={moreOpen} aria-label={moreOpen?'Close Build More':'Build More'} title="Exact sizes and variation rules" onClick={more}><SlidersHorizontal size={20}/><span>More</span></button>
 </nav>;
}
