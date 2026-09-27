// Instanced opening detail across the benchmark city (scripts/city-bench-buildings.mjs, 396 buildings by default):
// how much of the generated openings' own detail (surround, frame, sill, glass, leaf) became instances of shared
// canonical pieces, and what the merged form (instancing off) stored for the same detail.
// Run: node --experimental-strip-types scripts/city-opening-stats.mjs   (env N = buildings)
import {benchBuildings} from './city-bench-buildings.mjs';
import {resolveSculpt} from '../src/domain/citySculpt.ts';
import {buildStudioDetailBatches} from '../src/domain/cityStudioDetailBatches.ts';
import {OPENING_INSTANCING} from '../src/domain/cityStudioFreeOpeningGeometry.ts';
import {lookupOpeningPiece} from '../src/domain/cityStudioOpeningPieces.ts';
const list=benchBuildings(Number(process.env.N??396));
const openingDetail=d=>d.batches.filter(b=>b.material.kind==='painted'||b.material.kind==='glass'&&b.material.seeThrough);
const bytes=b=>[b.positions,b.normals,b.uvs,b.indices,b.colors,b.distance].reduce((n,a)=>n+(a?.byteLength??0),0);
const sum={buildings:0,openings:0,groups:0,instances:0,instNear:0,instFar:0,mergedNear:0,mergedFar:0,legacyNear:0,legacyFar:0,legacyBytes:0,mergedBytes:0,instanceBytes:0,wallMerged:0};const keys=new Set(),byType={};
for(const b of list){
 const r=b.draft.sculpt,d=b.draft.design;
 OPENING_INSTANCING.enabled=false;const legacy=buildStudioDetailBatches(resolveSculpt(r,d).studio);OPENING_INSTANCING.enabled=true;
 const s=resolveSculpt(r,d).studio,now=buildStudioDetailBatches(s),o=now.openings;
 sum.buildings++;for(const f of s.freeFaces??[])sum.groups+=f.groups.filter(g=>!g.module).length;
 for(const x of openingDetail(legacy)){sum.legacyNear+=x.near/3;sum.legacyFar+=x.far/3;sum.legacyBytes+=bytes(x);}
 for(const x of openingDetail(now)){sum.mergedNear+=x.near/3;sum.mergedFar+=x.far/3;sum.mergedBytes+=bytes(x);}
 if(o){sum.instances+=o.count;sum.instNear+=o.triangles.near;sum.instFar+=o.triangles.far;sum.instanceBytes+=o.groups.reduce((n,g)=>n+g.matrices.byteLength+g.tints.byteLength,0);for(const g of o.groups)keys.add(g.key);}
 const t=byType[b.type]??={buildings:0,instances:0,keys:new Set()};t.buildings++;t.instances+=o?.count??0;for(const g of o?.groups??[])t.keys.add(g.key);
}
let pieceBytes=0,pieceNear=0;for(const k of keys){const p=lookupOpeningPiece(k);for(const g of [p.painted,p.glass])if(g){pieceBytes+=g.positions.byteLength+g.normals.byteLength+g.colors.byteLength+g.slots.byteLength+g.indices.byteLength;}pieceNear+=p.triangles.near;}
const pct=(a,b)=>(100*a/(b||1)).toFixed(1)+'%';
console.log(JSON.stringify({...sum,pieces:keys.size,pieceTrianglesNear:pieceNear,pieceBytes,byType:Object.fromEntries(Object.entries(byType).map(([k,v])=>[k,{buildings:v.buildings,instances:v.instances,pieces:v.keys.size}]))},null,1));
console.log(`opening detail triangles instanced: near ${pct(sum.instNear,sum.instNear+sum.mergedNear)}, far ${pct(sum.instFar,sum.instFar+sum.mergedFar)}; `+
 `stored: merged ${(sum.legacyBytes/1048576).toFixed(1)} MB before, now ${((sum.mergedBytes+sum.instanceBytes+pieceBytes)/1048576).toFixed(2)} MB (merged ${(sum.mergedBytes/1048576).toFixed(2)} + instances ${(sum.instanceBytes/1048576).toFixed(2)} + ${keys.size} pieces ${(pieceBytes/1048576).toFixed(2)})`);
