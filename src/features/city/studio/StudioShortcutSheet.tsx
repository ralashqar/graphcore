// Shortcut sheet and help (? key), generated from the rail and shortcut registries.
import {useEffect} from 'react';
import {X} from '@phosphor-icons/react';
import {STUDIO_SHORTCUTS} from '../studioRail';

export function StudioShortcutSheet({close}:{close:()=>void}){
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[close]);
 return <div className="studio-sheet-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)close();}}>
  <aside className="studio-sheet" role="dialog" aria-label="Keyboard shortcuts">
   <header><h2>Build it, then walk through it</h2><button aria-label="Close shortcuts" onClick={close}><X/></button></header>
   <p>Pick a tool on the left rail. <b>Select</b> chooses parts, walls, tiles, openings or objects and the inspector on the right edits them. The <b>Brush</b> paints materials, openings, storefronts, trims, decorations and roof details; <b>Erase</b> is the same brush in reverse. Every action is one undo step.</p>
   <div className="studio-sheet-grid">{STUDIO_SHORTCUTS.map(g=><section key={g.group}><h3>{g.group}</h3><dl>{g.items.map(item=><div key={item.keys+item.action}><dt><kbd>{item.keys}</kbd></dt><dd>{item.action}</dd></div>)}</dl></section>)}</div>
  </aside>
 </div>;
}
