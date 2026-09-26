// Curved generated walls: triangles and build time of a round tower (8 m diameter, 3 storeys) with 12 free
// openings, against the same openings on a straight face of equal length, plus the whole resolveSculpt.
// Run: node --experimental-strip-types scripts/benchmark-city-curved-walls.mjs
import {newDesign} from '../src/domain/cityBuildingV3.ts';
import {resolveSculpt} from '../src/domain/citySculpt.ts';
import {freshStudio,studioFloorCount} from '../src/domain/cityStudio.ts';
import {buildStudioDetailBatches} from '../src/domain/cityStudioDetailBatches.ts';
import {resolveFreeOpenings} from '../src/domain/cityStudioFreeOpenings.ts';
import {buildFreeOpeningFaceGeometry} from '../src/domain/cityStudioFreeOpeningGeometry.ts';
import {bendFreeFaceGeometry,buildFaceBend} from '../src/domain/cityStudioCurvedWalls.ts';
import {curveLength,curveMaxOpening} from '../src/domain/cityStudioFaceCurve.ts';

const med=a=>[...a].sort((x,y)=>x-y)[a.length>>1],time=(n,f)=>{f();const t=[];let out;for(let i=0;i<n;i++){const s=performance.now();out=f();t.push(performance.now()-s);}return {ms:+med(t).toFixed(1),out};};
const tri=b=>b.indices.length/3;
// Face level: resolve + build (+ bend) on the same unrolled face.
const c={cx:0,cz:0,a:4,b:4},L=curveLength(c),H=9.8,region=[0,1,2].map(f=>[0,L,f*3.3,(f+1)*3.3]);
const ops=Array.from({length:12},(_,i)=>({id:`w${i}`,x:L*((i%6)+.5)/6,bottom:i<6?4.3:7.2,width:1,height:1.5,shape:i%3===1?'arch':'rect'}));
const curved=time(11,()=>{const res=resolveFreeOpenings({length:L,height:H,ground:true,region,maxWidthAt:x=>curveMaxOpening(c,x)},ops),bend=buildFaceBend(c,L,res.groups,{closed:true});return {bend,g:bendFreeFaceGeometry(buildFreeOpeningFaceGeometry({length:L,height:H,region,breaks:bend.xs,seam:true},res.groups),bend)};});
const straight=time(11,()=>({g:buildFreeOpeningFaceGeometry({length:L,height:H,region},resolveFreeOpenings({length:L,height:H,ground:true,region},ops).groups)}));
// Whole building: round tower with the 12 openings, resolveSculpt and the merged detail batches (near/far).
const free=ops.map((o,i)=>({id:o.id,shapeId:'tower',side:'curve',u:o.x/L,bottom:o.bottom,width:o.width,height:o.height,shape:o.shape}));
const r={version:5,volumes:[{id:'tower',kind:'ellipse',operation:'add',x:0,z:0,width:8,depth:8,startFloor:0,spanFloors:3}],attachments:[],plotSize:24,studio:{...freshStudio(),freeOpenings:free}};
const d={...newDesign('bench'),groundHeight:3.4,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none',roof:'flat'};
const whole=time(7,()=>resolveSculpt(r,d).studio),plain=time(7,()=>resolveSculpt({...r,studio:{...r.studio,freeOpenings:[]}},d));
const face=whole.out.freeFaces.find(f=>f.side==='curve'),batches=buildStudioDetailBatches({freeFaces:[face]});
const row=(g,ms)=>({ms,triangles:g.triangles,wall:tri(g.wall),outerSkin:g.wall.rearStart/3,trim:tri(g.trim),frame:tri(g.frame),glass:tri(g.glass)});
console.log(JSON.stringify({faceLength:+L.toFixed(2),facets:curved.out.bend.xs.length-1,curvedFace:row(curved.out.g,curved.ms),straightFace:row(straight.out.g,straight.ms),
 tower:{resolveSculptMs:whole.ms,withoutOpeningsMs:plain.ms,faceTriangles:face.geometry.triangles,nearTriangles:batches.triangles.near,farTriangles:batches.triangles.far,batches:batches.batches.length}},null,1));
