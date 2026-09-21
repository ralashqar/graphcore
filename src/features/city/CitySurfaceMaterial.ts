import { MeshStandardMaterial } from "three";
/** Shared instancing-compatible surfaces; no image downloads or shadow maps. */
export function citySurfaceMaterial(glass = false) {
 const material = new MeshStandardMaterial({color:"#ffffff",roughness:glass?.08:.85,metalness:glass?.05:0});
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
  if (glass) shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `
   #include <roughnessmap_fragment>
   roughnessFactor = 0.08;
  `);
  shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
   #include <color_fragment>
   ${glass ? `
    diffuseColor.rgb = mix(vec3(0.025, 0.045, 0.055), diffuseColor.rgb * 0.12, 0.25);
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
   vec3 reflectedSky = mix(vec3(0.07,0.095,0.09),sky,skyAmount);
   float fresnel = 0.2 + 0.65 * pow(1.0-clamp(dot(glassNormal,glassView),0.0,1.0),5.0);
   float sun = pow(max(0.0,dot(reflectedWorld,normalize(vec3(-120.0,240.0,80.0)))),160.0);
   outgoingLight = mix(outgoingLight,reflectedSky,fresnel) + vec3(1.0,0.91,0.72)*sun*0.8;
   #include <opaque_fragment>
  `);
 };
 material.customProgramCacheKey = () => glass ? "city-glass-4" : "city-mineral-2";
 return material;
}
