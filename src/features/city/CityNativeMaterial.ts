import { MeshStandardMaterial } from "three";
/** The source kit carries per-module colour ramps. With its authored albedo
 * textures these become black seams, not useful City lighting. Preserve colour
 * attributes on geometry, but do not multiply textured surfaces by those ramps.
 */
export function nativeSurfaceMaterial(source:MeshStandardMaterial):MeshStandardMaterial {
 const material=source.clone();
 if(material.map)material.vertexColors=false;
 material.normalScale.multiplyScalar(.35);
 for(const texture of [material.map,material.normalMap,material.roughnessMap,material.metalnessMap])if(texture)texture.anisotropy=4;
 material.userData.cityNativeTexture=!!material.map;
 return material;
}
