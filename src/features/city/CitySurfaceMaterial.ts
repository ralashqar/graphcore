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
  shader.fragmentShader = "varying vec3 citySurfacePosition;\n" + shader.fragmentShader;
  if (glass) shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `
   #include <roughnessmap_fragment>
   float paneVariation = fract(sin(dot(floor(citySurfacePosition / 3.0),vec3(12.9898,78.233,37.719)))*43758.5453);
   roughnessFactor = 0.1 + paneVariation * 0.12;
  `);
  shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
   #include <color_fragment>
   ${glass ? `
    float facing = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);
    diffuseColor.rgb = mix(diffuseColor.rgb * 0.72, vec3(0.52, 0.69, 0.78), 0.22 + facing * 0.48);
   ` : `
    float grain = sin(citySurfacePosition.x*8.0 + sin(citySurfacePosition.z*5.0)) * sin(citySurfacePosition.y*11.0 + citySurfacePosition.z*7.0);
    float fade = 1.0-smoothstep(25.0,85.0,length(vViewPosition));
    diffuseColor.rgb *= 0.97 + grain * 0.035 * fade;
   `}`);
 };
 material.customProgramCacheKey = () => glass ? "city-glass-2" : "city-mineral-1";
 return material;
}
