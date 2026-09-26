/**
 * Pixel parity of the city-scale generated-wall batches (docs/city-generated-walls-at-scale.md): compares the
 * screenshots of two city-generated-walls-benchmark.mjs runs (same seeded city, same cameras), for example the
 * per-building path (CITY_BENCH_PATH=building) against the batched path.
 * Usage: node scripts/city-generated-walls-parity.mjs <labelA> <labelB> [variant=unified] [suffix='' | -webgl]
 * Writes output/city-gw-diff-<labelA>-<labelB>-<view><suffix>.png (changed pixels in red over a dimmed frame).
 * The UI panels are masked out (left panel, top bar, bottom-right cards) so only the 3D view is compared.
 */
import sharp from 'sharp';
import {existsSync} from 'node:fs';
const [a,b,variant='unified',suffix='']=process.argv.slice(2);
if(!a||!b){console.error('usage: node scripts/city-generated-walls-parity.mjs <labelA> <labelB> [variant] [suffix]');process.exit(1);}
const views=['map','map-zoomed','drive','studio','studio-far'],threshold=40;
const masks={map:[[0,0,1280,112],[20,130,330,730],[340,730,940,790],[970,585,1260,800],[810,130,1260,185]],'map-zoomed':[[0,0,1280,112],[20,130,330,730],[340,730,940,790],[970,585,1260,800],[810,130,1260,185]],drive:[[760,10,1270,70]],'studio-far':[[0,0,300,80],[530,15,745,75],[960,15,1260,75],[1200,105,1270,275],[15,280,75,520],[255,560,1025,785]],studio:[[0,0,300,80],[530,15,745,75],[960,15,1260,75],[1200,105,1270,275],[15,280,75,520],[255,560,1025,785]]};
const rows=[];
for(const view of views){
 const fa=`output/city-gw-${a}-${variant}-${view}${suffix}.png`,fb=`output/city-gw-${b}-${variant}-${view}${suffix}.png`;
 if(!existsSync(fa)||!existsSync(fb))continue;
 const [x,y]=await Promise.all([fa,fb].map(p=>sharp(p).removeAlpha().raw().toBuffer({resolveWithObject:true})));
 const {width,height}=x.info,out=Buffer.alloc(width*height*3),masked=(px,py)=>(masks[view]??[]).some(([x0,y0,x1,y1])=>px>=x0&&px<x1&&py>=y0&&py<y1);
 let changed=0,sum=0,n=0;
 for(let i=0;i<width*height;i++){
  const px=i%width,py=Math.floor(i/width);
  if(masked(px,py)){out[i*3]=out[i*3+1]=out[i*3+2]=0;continue;}
  const d=Math.max(Math.abs(x.data[i*3]-y.data[i*3]),Math.abs(x.data[i*3+1]-y.data[i*3+1]),Math.abs(x.data[i*3+2]-y.data[i*3+2]));
  n++;sum+=d;if(d>threshold)changed++;
  const g=Math.round(y.data[i*3]*.3+y.data[i*3+1]*.3+y.data[i*3+2]*.3)*.5;out[i*3]=d>threshold?255:g;out[i*3+1]=d>threshold?0:g;out[i*3+2]=d>threshold?0:g;
 }
 await sharp(out,{raw:{width,height,channels:3}}).png().toFile(`output/city-gw-diff-${a}-${b}-${view}${suffix}.png`);
 rows.push({view,changedPct:+(changed/n*100).toFixed(2),meanDiff:+(sum/n).toFixed(2)});
}
console.table(rows);
