import { CITY_TEXTURES, type CityTextureId } from "../../domain/cityTexturePresets";
import { MeshStandardMaterial, TextureLoader, RepeatWrapping, SRGBColorSpace } from "three";
/** Shared instancing-compatible surfaces; packed local maps and optional shared glass reflections. */
export function citySurfaceMaterial(glass = false, textureId: CityTextureId = "none", onReady?:()=>void) {
 const material = new MeshStandardMaterial({color:"#ffffff",roughness:glass?.14:.85,envMapIntensity:glass?2.0:.45,metalness:glass?.45:textureId==="metal"?.65:0});
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
  shader.fragmentShader = "varying vec3 citySurfacePosition;\n" + shader.fragmentShader;
  if(textures.length){
   Object.assign(shader.uniforms,{cityAlbedo:{value:textures[0]},cityRoughness:{value:textures[1]},cityTextureReady:ready});
   shader.fragmentShader=`uniform sampler2D cityAlbedo; uniform sampler2D cityRoughness; uniform float cityTextureReady;
    vec4 citySample(sampler2D tex,vec3 p,vec3 weights,float distanceToCamera){if(distanceToCamera>100.0){if(weights.x>weights.y && weights.x>weights.z)return texture2D(tex,p.zy);if(weights.y>weights.z)return texture2D(tex,p.xz);return texture2D(tex,p.xy);}return texture2D(tex,p.zy)*weights.x+texture2D(tex,p.xz)*weights.y+texture2D(tex,p.xy)*weights.z;}
   `+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace("#include <color_fragment>",`#include <color_fragment>
    vec3 cityWeights=pow(abs(inverseTransformDirection(normalize(vNormal),viewMatrix)),vec3(8.0));cityWeights/=max(.0001,cityWeights.x+cityWeights.y+cityWeights.z);
    vec4 citySurfaceData=citySample(cityRoughness,citySurfacePosition/${preset.meters.toFixed(2)},cityWeights,length(vViewPosition));
    diffuseColor.rgb=mix(diffuseColor.rgb,citySample(cityAlbedo,citySurfacePosition/${preset.meters.toFixed(2)},cityWeights,length(vViewPosition)).rgb*diffuseColor.rgb,cityTextureReady);
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
   float cityHeight=citySurfaceData.r*${({brick:.08,plaster:.015,concrete:.025,terracotta:.07,metal:.025,timber:.04,pavers:.07,checker:.07,"grass-lawn":.025,"grass-meadow":.03,"grass-lush":.035,none:0}[textureId]).toFixed(3)};
   vec3 cityGradient=sign(cityDet)*(dFdx(cityHeight)*cityR1+dFdy(cityHeight)*cityR2);
   normal=normalize(normal-cityGradient/max(abs(cityDet),.00001)*cityDetailFade*cityTextureReady);
  `);
  if (glass) shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `
   #include <roughnessmap_fragment>
   roughnessFactor = 0.14;
  `);
  shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
   #include <color_fragment>
   ${glass ? `
    // Keep a blue-grey body colour even when the authored brand palette is dark.
    diffuseColor.rgb = mix(vec3(0.018, 0.045, 0.065), diffuseColor.rgb * 0.18, 0.20);
   ` : `
   `}`);

 };
 material.customProgramCacheKey = () => glass ? "city-glass-environment-6" : "city-mineral-6-"+textureId;
 return material;
}
