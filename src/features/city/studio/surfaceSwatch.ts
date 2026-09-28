// Swatch thumbnails for the surface library: the same pattern source as the shader (citySurfacePatterns), evaluated
// with numbers on a small canvas. Cached per pattern/tint/accent/scale/rotation as data URLs (tiny, per session).
import {samplePattern,surfacePattern,type SurfacePatternId} from '../../../domain/citySurfacePatterns';
import {CITY_TEXTURES} from '../../../domain/cityTexturePresets';

const cache=new Map<string,string>();
const rgb=(hex:string)=>{const n=parseInt(hex.slice(1),16);return [n>>16&255,n>>8&255,n&255];};
/** Image URL (or CSS background for photo patterns) of a pattern swatch. */
export function surfaceSwatch(id:SurfacePatternId,tint?:string,accent?:string,opts:{size?:number;scale?:number;rotation?:number;painted?:number}={}):{image:string;blend?:string}{
 const meta=surfacePattern(id)!;
 if(meta.texture)return {image:`url(/city/textures/${CITY_TEXTURES[meta.texture].asset}-Color.webp)`,blend:tint??'#ffffff'};
 const size=opts.size??56,scale=opts.scale??1,rot=(opts.rotation??0)*Math.PI/180,t=rgb(tint??meta.tint),a=rgb(accent??meta.accent),n=rgb(meta.tint);
 const key=[id,tint,accent,size,scale,opts.rotation??0,opts.painted??0].join('|');let url=cache.get(key);if(url)return {image:`url(${url})`};
 if(typeof document==='undefined')return {image:'none'};
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');if(!ctx)return {image:'none'};
 const img=ctx.createImageData(size,size),span=Math.min(3.2,Math.max(.7,meta.feature*9))*scale,cs=Math.cos(rot),sn=Math.sin(rot),painted=opts.painted??0;
 for(let j=0;j<size;j++)for(let i=0;i<size;i++){
  const u=(i/size)*span,v=(1-j/size)*span,x=(u*cs-v*sn)/scale,y=(u*sn+v*cs)/scale,o=samplePattern(id,x,y)!;
  const light=.92+.08*Math.min(1,o.height),k=(j*size+i)*4;
  for(let c=0;c<3;c++){const plain=t[c]*o.tone*(1-o.accent)+a[c]*o.accent,nat=n[c]*o.tone*(1-o.accent)+a[c]*o.accent,paint=t[c]*(1-.14*o.accent);img.data[k+c]=Math.max(0,Math.min(255,(painted>0?nat+(paint-nat)*painted:plain)*light));}
  img.data[k+3]=255;
 }
 ctx.putImageData(img,0,0);url=canvas.toDataURL('image/png');cache.set(key,url);return {image:`url(${url})`};
}
