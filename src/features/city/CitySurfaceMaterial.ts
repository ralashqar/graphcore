
import {CITY_TEXTURES,type CityTextureId} from "../../domain/cityTexturePresets";
import {MeshStandardNodeMaterial,type NodeBuilder} from "three/webgpu";
import {TextureLoader,RepeatWrapping,SRGBColorSpace} from "three";
import {Fn,If,attribute,float,vec3,vec4,uniform,varying,positionGeometry,normalGeometry,positionWorld,normalWorldGeometry,positionView,normalViewGeometry,materialColor,texture,mix,clamp,abs,pow,max,floor,mod,cross,dot,sign,dFdx,dFdy,fwidth,smoothstep,normalize} from "three/tsl";

/** Node materials work on both WebGPU and the node renderer's WebGL2 backend. */
export function citySurfaceMaterial(glass=false,textureId:CityTextureId="none",onReady?:()=>void){
 const material=new MeshStandardNodeMaterial({color:"#ffffff",roughness:glass?.14:.85,envMapIntensity:glass?2:.45,metalness:glass?.45:textureId==="metal"?.65:0});
 const enabled=uniform(1);material.userData.cityOcclusion=enabled;
 const baked=Fn((_:unknown,builder:NodeBuilder)=>{
   const geometry=builder.geometry;
   const result=float(1).toVar();
   if(geometry?.hasAttribute("cityAO0")){
     const a=attribute("cityAO0","vec3"),b=attribute("cityAO1","vec3");
     const p=clamp(positionGeometry.add(.5),0,1),n=abs(normalGeometry);
     const packed=float(16777215).toVar(),u=float(0).toVar(),v=float(0).toVar();
     If(n.x.greaterThanEqual(n.y).and(n.x.greaterThanEqual(n.z)),()=>{
       packed.assign(normalGeometry.x.lessThan(0).select(a.x,a.y));u.assign(p.y);v.assign(p.z);
     }).ElseIf(n.y.greaterThanEqual(n.z),()=>{
       packed.assign(normalGeometry.y.lessThan(0).select(a.z,b.x));u.assign(p.x);v.assign(p.z);
     }).Else(()=>{packed.assign(normalGeometry.z.lessThan(0).select(b.y,b.z));u.assign(p.x);v.assign(p.y);});
     const face=mod(floor(packed.mul(vec4(1,1/64,1/4096,1/262144))),64).div(63);
     result.assign(mix(mix(face.x,face.y,u),mix(face.z,face.w,u),v));
   }
   if(geometry?.hasAttribute("cityVertexAO"))result.mulAssign(attribute("cityVertexAO","float"));
   return clamp(result,.3,1);
 })();
 material.aoNode=mix(float(1),varying(baked),enabled);
 if(glass)material.colorNode=materialColor.mul(.036).add(vec3(.0144,.036,.052));
 const preset=CITY_TEXTURES[textureId],ready=uniform(0);let loaded=0,disposed=false;
 const maps=preset.asset?["Color","Surface"].map(role=>{
   const map=new TextureLoader().load(`/city/textures/${preset.asset}-${role}.webp`,()=>{if(!disposed&&++loaded===2){ready.value=1;onReady?.();}},undefined,()=>{});
   map.wrapS=map.wrapT=RepeatWrapping;map.anisotropy=4;if(role==="Color")map.colorSpace=SRGBColorSpace;return map;
 }):[];
 material.addEventListener("dispose",()=>{disposed=true;maps.forEach(map=>map.dispose());});
 if(maps.length){
   const weights=pow(abs(normalWorldGeometry),vec3(8)),w=weights.div(max(weights.x.add(weights.y).add(weights.z),.0001));
   const p=positionWorld.div(preset.meters),distance=positionView.length();
   const sample=(map:typeof maps[number])=>Fn(()=>{
     const out=vec4(0).toVar();
     If(distance.greaterThan(100),()=>{
       If(w.x.greaterThan(w.y).and(w.x.greaterThan(w.z)),()=>{out.assign(texture(map,p.zy));})
         .ElseIf(w.y.greaterThan(w.z),()=>{out.assign(texture(map,p.xz));})
         .Else(()=>{out.assign(texture(map,p.xy));});
     }).Else(()=>{out.assign(texture(map,p.zy).mul(w.x).add(texture(map,p.xz).mul(w.y)).add(texture(map,p.xy).mul(w.z)));});
     return out;
   })();
   const surface=sample(maps[1]);
   material.colorNode=mix(materialColor,materialColor.mul(sample(maps[0]).rgb),ready);
   material.roughnessNode=mix(float(material.roughness),clamp(surface.g,.15,1),ready);
   const strength=({brick:.08,plaster:.015,concrete:.025,terracotta:.07,metal:.025,timber:.04,pavers:.07,checker:.07,"grass-lawn":.025,"grass-meadow":.03,"grass-lush":.035,none:0})[textureId];
   const n=normalViewGeometry,dx=dFdx(positionView),dy=dFdy(positionView),r1=cross(dy,n),r2=cross(n,dx),det=dot(dx,r1);
   const h=surface.r.mul(strength),fade=float(1).sub(smoothstep(20,65,distance)).mul(float(1).sub(smoothstep(.025,.15,fwidth(p).length()))).mul(ready);
   material.normalNode=normalize(n.sub(r1.mul(dFdx(h)).add(r2.mul(dFdy(h))).mul(sign(det)).div(max(abs(det),.00001)).mul(fade)));
 }
 return material;
}
