// Studio surface material (docs/city-surfaces.md): one node material per surface render key (cityStudioSurfaces),
// built from the shared pattern source (citySurfacePatterns) through TSL. Every finish parameter (tint, accent,
// scale, rotation, wear, painted, fade) is a uniform, so all keys of one pattern share one compiled pipeline and a
// paint stroke never triggers a shader compile once that pattern has been seen (cityStudioWarmup prewarms them).
// Coordinates: generated walls use their face-metre uv (continuous along curved walls); everything else projects
// world position onto the surface plane (floors x/z, walls along their horizontal tangent).
// Low-power path: no bump and no fine wear noise (a cheaper program).
import {Color,RepeatWrapping,SRGBColorSpace,TextureLoader,type Texture} from 'three';
import {MeshStandardNodeMaterial,type NodeBuilder} from 'three/webgpu';
import {Fn,abs,add,clamp,cos,cross,dFdx,dFdy,div,dot,float,floor,fract,fwidth,length,max,min,mix,mul,normalize,normalViewGeometry,normalWorldGeometry,positionView,positionWorld,sign,sin,smoothstep,sqrt,step,sub,texture,uniform,uv,vec2,vec3} from 'three/tsl';
import {decodeSurfaceKey,type SurfaceRender} from '../../domain/cityStudioSurfaces';
import {noise2,surfacePattern,type SurfaceOps,type SurfacePatternMeta} from '../../domain/citySurfacePatterns';
import {CITY_TEXTURES} from '../../domain/cityTexturePresets';
import {applyCityOcclusion} from './CitySurfaceMaterial';
import {cityLowPower} from './cityStudioIsolate';

// TSL's node types are too narrow for generic arithmetic; the pattern code is checked against SurfaceOps instead.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N=any;
const c=(v:unknown)=>v as N;
/** The pattern arithmetic as TSL nodes (numbers become constants). */
export const TSL_OPS:SurfaceOps<N>={
 n:v=>float(v),add:(a,b)=>c(add(a,b)),sub:(a,b)=>c(sub(a,b)),mul:(a,b)=>c(mul(a,b)),div:(a,b)=>c(div(a,b)),
 floor:a=>c(floor(a)),fract:a=>c(fract(a)),abs:a=>c(abs(a)),sqrt:a=>c(sqrt(max(a,0))),sin:a=>c(sin(a)),
 min:(a,b)=>c(min(a,b)),max:(a,b)=>c(max(a,b)),clamp:(a,lo,hi)=>c(clamp(a,lo,hi)),mix:(a,b,t)=>c(mix(a,b,t)),
 step:(e,x)=>c(step(e,x)),smoothstep:(e0,e1,x)=>c(smoothstep(e0,e1,x)),aa:a=>c(fwidth(a)),
};

// CC0 photo maps shared by every material that uses them (one GPU texture per file), with a shared ready flag.
const maps=new Map<string,{texture:Texture;ready:N;waiting:Set<()=>void>}>();
function sharedMap(asset:string,role:'Color'|'Surface',onReady?:()=>void){
 const key=`${asset}-${role}`;let e=maps.get(key);
 if(!e){const ready=uniform(0),waiting=new Set<()=>void>();const t=new TextureLoader().load(`/city/textures/${key}.webp`,()=>{ready.value=1;waiting.forEach(f=>f());waiting.clear();},undefined,()=>{});
  t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=4;if(role==='Color')t.colorSpace=SRGBColorSpace;e={texture:t,ready,waiting};maps.set(key,e);}
 if(onReady){if(e.ready.value===1)queueMicrotask(onReady);else e.waiting.add(onReady);}
 return e;
}
const lin=(hex:string)=>new Color(hex);

/** Material for one surface render key. Returns a plain white material for an unknown key. */
export function citySurfacePatternMaterial(key:string,onReady?:()=>void):MeshStandardNodeMaterial{
 const spec=decodeSurfaceKey(key),meta=spec?surfacePattern(spec.pattern):undefined;
 const material=new MeshStandardNodeMaterial({color:'#ffffff',roughness:.85,envMapIntensity:.45,metalness:meta?.metal??0});
 applyCityOcclusion(material);
 if(!spec||!meta)return material;
 const low=cityLowPower(),u=surfaceUniforms(spec,meta);material.userData.citySurface=u;
 // Pattern-space coordinates (x along, y up / floor z) and the height used by fades.
 const coords=Fn((_:unknown,builder:NodeBuilder)=>{
  if(builder.geometry?.hasAttribute('openingDistance'))return vec3(uv().x,uv().y,uv().y);
  const n=normalWorldGeometry,p=positionWorld,len=max(length(n.xz),1e-4),along=p.x.mul(n.z).sub(p.z.mul(n.x)).div(len),floorLike=abs(n.y).greaterThan(.7);
  return vec3(floorLike.select(p.x,along),floorLike.select(p.z,p.y),p.y);
 })();
 const cs=cos(u.rotation),sn=sin(u.rotation),x=coords.x.mul(cs).sub(coords.y.mul(sn)).div(u.scale),y=coords.x.mul(sn).add(coords.y.mul(cs)).div(u.scale);
 const span=u.y1.sub(u.y0),ft=smoothstep(0,1,clamp(coords.z.sub(u.y0).div(abs(span).lessThan(.001).select(float(1),span)),0,1));
 const tint=mix(u.tint,mix(u.fadeColor,u.tint,ft),u.fadeOn);
 let tone:N,accent:N,height:N,rough:N,textureColor:N=null;
 if(meta.fn){
  const out=meta.fn(TSL_OPS,c(x),c(y)),detail=float(1).sub(smoothstep(1,3,max(fwidth(x),fwidth(y)).div(meta.feature)));
  tone=c(mix(1,out.tone,detail));accent=c(mix(meta.jointShare,out.accent,detail));height=c(out.height.mul(detail));rough=out.rough;
 }else{
  const preset=CITY_TEXTURES[meta.texture!],colorMap=sharedMap(preset.asset,'Color',onReady),surface=sharedMap(preset.asset,'Surface'),st=vec2(x,y).div(preset.meters);
  const ready=colorMap.ready.mul(surface.ready),sample=texture(surface.texture,st);
  textureColor=mix(vec3(1),texture(colorMap.texture,st).rgb,ready);tone=float(1);accent=float(0);height=c(sample.r.mul(ready));rough=c(mix(.85,clamp(sample.g,.15,1),ready));
 }
 const base=textureColor?tint.mul(textureColor):tint.mul(tone),joint=u.accent.mul(tone.mul(.15).add(.85));
 const plain=mix(base,joint,accent),natural=mix(textureColor?u.natural.mul(textureColor):u.natural.mul(tone),joint,accent);
 // Wear: blotchy grime and, on painted finishes, chips that show the natural material through the paint.
 const blotch=low?noise2(TSL_OPS,c(x.mul(1.1)),c(y.mul(1.1))):c(noise2(TSL_OPS,c(x.mul(1.1)),c(y.mul(1.1))).mul(.65).add(noise2(TSL_OPS,c(x.mul(4.3).add(11)),c(y.mul(4.3))).mul(.35)));
 const grime=smoothstep(.45,.9,blotch).mul(u.wear),chip=step(.64,noise2(TSL_OPS,c(x.mul(2.6).add(3)),c(y.mul(2.6).add(9)))).mul(u.wear);
 const cover=u.painted.mul(float(1).sub(chip)),paintLayer=tint.mul(tone.mul(.04).add(.96)).mul(float(1).sub(accent.mul(.14)));
 material.colorNode=mix(plain,mix(natural,paintLayer,cover),step(.001,u.painted)).mul(float(1).sub(grime.mul(.38)));
 material.roughnessNode=clamp(mix(mix(rough,.9,accent.mul(.5)),.62,cover).add(grime.mul(.1)),.05,1);
 if(!low&&meta.bump>0){
  const n=normalViewGeometry,dx=dFdx(positionView),dy=dFdy(positionView),r1=cross(dy,n),r2=cross(n,dx),det=dot(dx,r1),distance=positionView.length();
  const h=height.mul(meta.bump).mul(float(1).sub(cover.mul(.5))),fade=float(1).sub(smoothstep(20,65,distance));
  material.normalNode=normalize(n.sub(r1.mul(dFdx(h)).add(r2.mul(dFdy(h))).mul(sign(det)).div(max(abs(det),.00001)).mul(fade)));
 }
 return material;
}
type SurfaceUniforms=Record<'tint'|'accent'|'natural'|'fadeColor'|'fadeOn'|'y0'|'y1'|'scale'|'rotation'|'wear'|'painted',N>;
function surfaceUniforms(s:SurfaceRender,meta:SurfacePatternMeta):SurfaceUniforms{
 return {tint:uniform(lin(s.tint)),accent:uniform(lin(s.accent)),natural:uniform(lin(meta.texture?'#ffffff':meta.tint)),fadeColor:uniform(lin(s.fade?.color??s.tint)),fadeOn:uniform(s.fade?1:0),y0:uniform(s.fade?.y0??0),y1:uniform(s.fade?.y1??1),
  scale:uniform(Math.max(.05,s.scale)),rotation:uniform(s.rotation*Math.PI/180),wear:uniform(s.wear),painted:uniform(s.painted)};
}
/** Updates an existing surface material to another key of the same pattern (uniforms only, no recompile). */
export function retuneSurfaceMaterial(material:MeshStandardNodeMaterial,key:string):boolean{
 const u=material.userData.citySurface as SurfaceUniforms|undefined,s=decodeSurfaceKey(key);if(!u||!s)return false;
 u.tint.value.set(s.tint);u.accent.value.set(s.accent);u.fadeColor.value.set(s.fade?.color??s.tint);u.fadeOn.value=s.fade?1:0;u.y0.value=s.fade?.y0??0;u.y1.value=s.fade?.y1??1;
 u.scale.value=Math.max(.05,s.scale);u.rotation.value=s.rotation*Math.PI/180;u.wear.value=s.wear;u.painted.value=s.painted;return true;
}
