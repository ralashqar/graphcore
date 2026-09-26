// Kit-tile building vs its unified-facade conversion (docs/city-unified-facades.md): CPU resolve time, the
// instanced kit groups (one draw call per module/channel/texture, excluding omitted channels) plus merged
// detail batches, and triangles (kit pieces from kit.glb + generated walls). Node only: no GPU, no worker.
// Run: node --experimental-strip-types scripts/benchmark-city-unified-facades.mjs
import {readFileSync} from 'node:fs';
import {createLandWorld,initialLandDraft} from '../src/domain/cityLand.ts';
import {nycPreset,NYC_PRESETS} from '../src/domain/cityNycPresets.ts';
import {resolveSculpt} from '../src/domain/citySculpt.ts';
import {convertToUnifiedFacade} from '../src/domain/cityStudioUnifiedFacade.ts';
import {buildStudioDetailBatches} from '../src/domain/cityStudioDetailBatches.ts';

// Triangles per module and channel from the GLB (same channel naming as CityStudioMeshes.loadStudioKit).
function kitTriangles(file){
 const buf=readFileSync(file),len=buf.readUInt32LE(12),json=JSON.parse(buf.subarray(20,20+len).toString()),out=new Map();
 const walk=(i,name)=>{const n=json.nodes[i];if(n.mesh!==undefined)for(const p of json.meshes[n.mesh].primitives){const ch=(json.materials[p.material]?.name??'').replace(/\.\d+$/,'').split('/').at(-1).replace(/^studio_/,''),count=(p.indices!==undefined?json.accessors[p.indices].count:json.accessors[p.attributes.POSITION].count)/3,m=out.get(name)??new Map();m.set(ch,(m.get(ch)??0)+count);out.set(name,m);}(n.children??[]).forEach(c=>walk(c,name));};
 for(const r of json.scenes[0].nodes){const n=json.nodes[r];walk(r,String(n.extras?.name??n.name).replace(/^v[345]\//,''));}
 return out;
}
const tris=kitTriangles('public/city/synarc-kit/v5/kit.glb');
const pieceStats=pieces=>{const groups=new Set();let t=0;for(const p of pieces){const m=tris.get(p.module);if(!m)continue;for(const [ch,n] of m){if(p.omit?.includes(ch))continue;groups.add(`${p.module}/${ch}/${p.finishes?.[ch]?.texture??''}`);t+=n;}}return {calls:groups.size,triangles:t};};
const median=(f,n=25)=>{const t=[];for(let i=0;i<n+3;i++){const s=performance.now();f();if(i>=3)t.push(performance.now()-s);}t.sort((a,b)=>a-b);return t[Math.floor(n/2)];};
const plot=createLandWorld([],72,24).plots[0];
for(let i=0;i<NYC_PRESETS.length;i++){
 const draft=nycPreset(initialLandDraft(plot),i,24),out=convertToUnifiedFacade(draft.sculpt,draft.design);if('reason' in out)throw Error(out.reason);
 const row=(r)=>{const s=resolveSculpt(r,draft.design).studio,k=pieceStats(s.pieces),d=buildStudioDetailBatches(s);return {ms:median(()=>resolveSculpt(r,draft.design)),calls:k.calls+d.batches.length,kitCalls:k.calls,batches:d.batches.length,triangles:k.triangles+d.triangles.near,pieces:s.pieces.length};};
 const a=row(draft.sculpt),b=row(out.recipe);
 console.log(`${NYC_PRESETS[i].name.padEnd(26)} resolve ${a.ms.toFixed(1)} → ${b.ms.toFixed(1)} ms · draw groups ${a.calls} → ${b.calls} (kit ${b.kitCalls} + ${b.batches} merged) · near triangles ${a.triangles} → ${b.triangles} · pieces ${a.pieces} → ${b.pieces}`);
}
