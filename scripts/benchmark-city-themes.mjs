// Facade themes (docs/city-studio-themes.md): CPU resolve time of a 6-storey, 20 m part with a plain facade rhythm
// (the theme's own rhythm style) against the same part themed (rhythm + storefronts, strips, decorations, paint rules
// and roof props), cold (face cache cleared before every run) and cached. Node only.
// Run: node --experimental-strip-types scripts/benchmark-city-themes.mjs [themeId ...]
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolveSculpt} from '../src/domain/citySculpt.ts';
import {freshStudio} from '../src/domain/cityStudio.ts';
import {newDesign} from '../src/domain/cityBuildingV3.ts';
import {clearFaceCache} from '../src/domain/cityStudioFaceCache.ts';
import {FACADE_THEMES,THEME_MAP} from '../src/domain/cityStudioThemeCatalog.ts';
import {applyFacadeTheme} from '../src/domain/cityStudioThemes.ts';

const median=(f,n=15)=>{const t=[];for(let i=0;i<n+3;i++){const s=performance.now();f();if(i>=3)t.push(performance.now()-s);}t.sort((a,b)=>a-b);return t[Math.floor(n/2)];};
const design={...newDesign('bench'),groundHeight:3.6,floors:6};
const box={version:5,plotSize:24,attachments:[],volumes:[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:20,depth:12,startFloor:0,spanFloors:6}],studio:{...freshStudio(),catalogue:'synarc-kit-5',facade:'unified'}};
const ids=process.argv.slice(2).length?process.argv.slice(2):FACADE_THEMES.map(t=>t.id);
const rows=[];
for(const id of ids){
 const t=THEME_MAP.get(id),out=applyFacadeTheme(box,design,id,{seed:5});if('reason' in out)throw Error(out.reason);
 const themed=out.recipe,plain={...themed,studio:{...themed.studio}};delete plain.studio.facadeThemes;
 const time=r=>({cold:median(()=>{clearFaceCache();resolveSculpt(r,design);}),cached:median(()=>resolveSculpt(r,design))});
 const a=time(plain),b=time(themed),pieces=resolveSculpt(themed,design).studio.pieces,extra=pieces.filter(p=>p.id.startsWith('theme/')||p.id.startsWith('stamp/theme-')).length;
 rows.push({id,label:t.label,rhythmCold:+a.cold.toFixed(1),themedCold:+b.cold.toFixed(1),ratioCold:+(b.cold/a.cold).toFixed(2),rhythmCached:+a.cached.toFixed(1),themedCached:+b.cached.toFixed(1),themePieces:extra});
 console.log(`${t.label.padEnd(30)} cold ${a.cold.toFixed(1).padStart(6)} → ${b.cold.toFixed(1).padStart(6)} ms (×${(b.cold/a.cold).toFixed(2)}) · cached ${a.cached.toFixed(1).padStart(5)} → ${b.cached.toFixed(1).padStart(5)} ms · ${extra} theme pieces`);
}
const worst=rows.reduce((m,r)=>Math.max(m,r.ratioCold),0),mean=rows.reduce((s,r)=>s+r.ratioCold,0)/rows.length;
console.log(`cold ratio: mean ×${mean.toFixed(2)}, worst ×${worst.toFixed(2)}`);
mkdirSync('output',{recursive:true});writeFileSync('output/city-themes-benchmark.json',JSON.stringify({rows,mean,worst},null,1));
