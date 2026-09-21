import { CITY_TEXTURES, type CityTextureId } from "../../domain/cityTexturePresets";
import { MeshStandardMaterial, TextureLoader, RepeatWrapping, SRGBColorSpace } from "three";
/** Shared instancing-compatible surfaces; packed local maps, no shadow maps. */
export function citySurfaceMaterial(glass = false, textureId: CityTextureId = "none", onReady?:()=>void) {
 const material = new MeshStandardMaterial({color:"#ffffff",roughness:glass?.08:.85,metalness:glass?.05:textureId==="metal"?.65:0});
 const preset=CITY_TEXTURES[textureId];
 const ready={value:0};let loaded=0,disposed=false;
 const textures=preset.asset ? ["Color","Surface"].map(role=>{
  const texture=new TextureLoader().load(`/city/textures/${preset.asset}-${role}.webp`,()=>{if(!disposed && ++loaded===2){ready.value=1;onReady?.();}},undefined,()=>{});
  texture.wrapS=texture.wrapT=RepeatWrapping;texture.anisotropy=4;
  if(role==="Color")texture.colorSpace=SRGBColorSpace;
  return texture;
 }) : [];
 material.addEventListener("dispose",()=>{disposed=true;textures.forEach(t=>t.dispose());});
 material.onBeforeCompile = shader => {
  shader.vertexShader = "varying vec3 citySurfacePosition;\n" + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `
   vec4 cityPoint = vec4(transformed, 1.0);
   #ifdef USE_INSTANCING
    cityPoint = instanceMatrix * cityPoint;
   #endif
   citySurfacePosition = (modelMatrix * cityPoint).xyz;
   #include <project_vertex>`);
  shader.fragmentShader = `varying vec3 citySurfacePosition;
   float cityHash(vec3 p) {
    p=fract(p*0.1031);p+=dot(p,p.yzx+33.33);
    return fract((p.x+p.y)*p.z);
   }
   float cityGrain(vec3 p) {
    vec3 cell=floor(p),f=fract(p);
    f=f*f*f*(f*(f*6.0-15.0)+10.0);
    return mix(mix(mix(cityHash(cell),cityHash(cell+vec3(1,0,0)),f.x),
     mix(cityHash(cell+vec3(0,1,0)),cityHash(cell+vec3(1,1,0)),f.x),f.y),
     mix(mix(cityHash(cell+vec3(0,0,1)),cityHash(cell+vec3(1,0,1)),f.x),
     mix(cityHash(cell+vec3(0,1,1)),cityHash(cell+vec3(1,1,1)),f.x),f.y),f.z);
   }
  ` + shader.fragmentShader;
  if(textures.length){
   Object.assign(shader.uniforms,{cityAlbedo:{value:textures[0]},cityRoughness:{value:textures[1]},cityTextureReady:ready});
   shader.fragmentShader=`uniform sampler2D cityAlbedo; uniform sampler2D cityRoughness; uniform float cityTextureReady;
    vec4 citySample(sampler2D tex,vec3 p,vec3 weights){return texture2D(tex,p.zy)*weights.x+texture2D(tex,p.xz)*weights.y+texture2D(tex,p.xy)*weights.z;}
   `+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace("#include <color_fragment>",`#include <color_fragment>
    vec3 cityWeights=pow(abs(inverseTransformDirection(normalize(vNormal),viewMatrix)),vec3(8.0));cityWeights/=max(.0001,cityWeights.x+cityWeights.y+cityWeights.z);
    vec4 citySurfaceData=citySample(cityRoughness,citySurfacePosition/${preset.meters.toFixed(2)},cityWeights);
    diffuseColor.rgb=mix(diffuseColor.rgb,citySample(cityAlbedo,citySurfacePosition/${preset.meters.toFixed(2)},cityWeights).rgb*diffuseColor.rgb,cityTextureReady);
   `);
   shader.fragmentShader=shader.fragmentShader.replace("#include <roughnessmap_fragment>",`#include <roughnessmap_fragment>
    roughnessFactor=mix(roughnessFactor,clamp(citySurfaceData.g,.15,1.0),cityTextureReady);
   `);
  }
  if(textures.length) shader.fragmentShader=shader.fragmentShader.replace("#include <normal_fragment_maps>", `
   #include <normal_fragment_maps>
   // Screen-space surface gradients perturb lighting only, preserving instancing and silhouettes.
   vec3 cityDx=dFdx(-vViewPosition),cityDy=dFdy(-vViewPosition);
   vec3 cityR1=cross(cityDy,normal),cityR2=cross(normal,cityDx);
   float cityDet=dot(cityDx,cityR1);
   float cityDetailFade=(1.0-smoothstep(20.0,65.0,length(vViewPosition)))
     *(1.0-smoothstep(.025,.15,length(fwidth(citySurfacePosition/${preset.meters.toFixed(2)}))));
   float cityHeight=citySurfaceData.r*${({brick:.08,plaster:.015,concrete:.025,terracotta:.07,metal:.025,timber:.04,pavers:.07,checker:.025,none:0}[textureId]).toFixed(3)};
   vec3 cityGradient=sign(cityDet)*(dFdx(cityHeight)*cityR1+dFdy(cityHeight)*cityR2);
   normal=normalize(normal-cityGradient/max(abs(cityDet),.00001)*cityDetailFade*cityTextureReady);
  `);
  if (glass) shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `
   #include <roughnessmap_fragment>
   roughnessFactor = 0.08;
  `);
  shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
   #include <color_fragment>
   ${glass ? `
    // Keep a blue-grey body colour even when the authored brand palette is dark.
    diffuseColor.rgb = mix(vec3(0.10, 0.17, 0.20), diffuseColor.rgb * 0.35, 0.20);
   ` : `
    float grain = cityGrain(citySurfacePosition*3.7+vec3(13.2,7.1,2.6))-.5;
    float fade = 1.0-smoothstep(25.0,85.0,length(vViewPosition));
    float pixelFade=1.0-smoothstep(.15,.6,length(fwidth(citySurfacePosition*3.7)));
    diffuseColor.rgb *= 1.0 + grain * 0.025 * fade * pixelFade;
   `}`);
  if (glass) shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
   vec3 glassView = normalize(vViewPosition);
   vec3 glassNormal = normalize(normal);
   vec3 reflectedWorld = inverseTransformDirection(reflect(-glassView, glassNormal), viewMatrix);
   float skyAmount = smoothstep(-0.16, 0.18, reflectedWorld.y);
   vec3 sky = mix(vec3(0.57,0.68,0.72),vec3(0.13,0.32,0.50),smoothstep(0.0,0.85,reflectedWorld.y));
   // Elevated city views reflect the ground, not the sky. A daylight
   // ground/horizon keeps those panes readable without emission or shadow maps.
   vec3 ground = mix(vec3(0.16,0.21,0.23),vec3(0.34,0.40,0.41),smoothstep(-1.0,0.0,reflectedWorld.y));
   vec3 reflectedSky = mix(ground,sky,skyAmount);
   float fresnel = 0.48 + 0.42 * pow(1.0-clamp(dot(glassNormal,glassView),0.0,1.0),5.0);
   float sun = pow(max(0.0,dot(reflectedWorld,normalize(vec3(-120.0,240.0,80.0)))),160.0);
   outgoingLight = mix(outgoingLight,reflectedSky,fresnel) + vec3(1.0,0.91,0.72)*sun*0.8;
   #include <opaque_fragment>
  `);
 };
 material.customProgramCacheKey = () => glass ? "city-glass-5" : "city-mineral-4-"+textureId;
 return material;
}
