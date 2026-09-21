import { MeshStandardMaterial } from "three";
/** Shared instancing-compatible surfaces; no image downloads or shadow maps. */
export function citySurfaceMaterial(glass = false) {
 const material = new MeshStandardMaterial({color:"#ffffff",roughness:glass?.12:.85,metalness:glass?.3:0});
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
   roughnessFactor = 0.16;
  `);
  shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
   #include <color_fragment>
   ${glass ? `
    float facing = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);
    diffuseColor.rgb = mix(diffuseColor.rgb * 0.72, vec3(0.52, 0.69, 0.78), 0.22 + facing * 0.48);
   ` : `
    float grain = cityGrain(citySurfacePosition*3.7+vec3(13.2,7.1,2.6))-.5;
    float fade = 1.0-smoothstep(25.0,85.0,length(vViewPosition));
    float pixelFade=1.0-smoothstep(.15,.6,length(fwidth(citySurfacePosition*3.7)));
    diffuseColor.rgb *= 1.0 + grain * 0.025 * fade * pixelFade;
   `}`);
 };
 material.customProgramCacheKey = () => glass ? "city-glass-3" : "city-mineral-2";
 return material;
}
