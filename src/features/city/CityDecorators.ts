import { citySurfaceMaterial } from "./CitySurfaceMaterial";
import {
  Float32BufferAttribute,
  type Material,
  Mesh,
  MeshStandardMaterial,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Piece } from "./CityInstances";
export type DecoratorPack = Map<string, Piece[]>;
let pending: Promise<DecoratorPack> | null = null;
/** Lazy, shared immutable resources. Failures leave the procedural fallback in place. */
export function loadDecorators(): Promise<DecoratorPack> {
  if (pending) return pending;
  pending = new GLTFLoader().loadAsync("/city/decorators/decorators.glb?v=5")
    .then((gltf) => {
      const out: DecoratorPack = new Map(),
        materials = new Map<Material, MeshStandardMaterial>();
      gltf.scene.updateMatrixWorld(true);
      for (const root of gltf.scene.children) {
        const pieces: Piece[] = [];
        root.traverse((child) => {
          if (!(child instanceof Mesh)) return;
          if (Array.isArray(child.material)) return;
          const original = child.material;
          let material = materials.get(original);
          if (!material) {
            const name = original.name.toLowerCase();
            const glass = name.includes("glass") || name.includes("interior");
            material = !glass && original instanceof MeshStandardMaterial ? original.clone() : citySurfaceMaterial(glass);
            if (!glass) {
              material.normalScale.multiplyScalar(.35);
              for (const texture of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap]) if (texture) texture.anisotropy = 4;
              material.userData.cityNativeTexture = !!material.map;
            }
            material.userData.cityPalette =
              name.includes("glass") || name.includes("interior")
                ? "glass"
                : name.includes("trim") || name.includes("metal")
                ? "trim"
                : "wall";
            materials.set(original, material);
          }
          const geometry = child.geometry.clone();
          for (const name of ["position", "normal"]) {
            const a = geometry.getAttribute(name);
            if (!a) continue;
            const values = new Float32Array(a.count * 3);
            for (let i = 0; i < a.count; i++) {
              values.set([a.getX(i), a.getY(i), a.getZ(i)], i * 3);
            }
            geometry.setAttribute(name, new Float32BufferAttribute(values, 3));
          }
          geometry.applyMatrix4(child.matrixWorld);
          geometry.computeBoundingBox();
          pieces.push({ geometry, material });
        });
        if (pieces.length) out.set(root.userData.assetKey || root.name, pieces);
      }
      // Source glTF resources are no longer used after baking.
      gltf.scene.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          if (!Array.isArray(o.material)) o.material.dispose();
        }
      });
      return out;
    }).catch((error) => {
      pending = null;
      throw error;
    });
  return pending;
}
