import { useEffect, useMemo } from "react";
import { BoxGeometry, CircleGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type Block = [number, number, number, number, number, number];
function blocks(items: Block[]) {
  const pieces = items.map(([x, y, z, w, h, d]) =>
    new BoxGeometry(w, h, d).translate(x, y, z)
  );
  const merged = mergeGeometries(pieces);
  pieces.forEach((piece) => piece.dispose());
  return merged;
}

/** Preview-only street context: four shared meshes, no downloaded textures. */
export function CityPreviewEnvironment() {
  const geometry = useMemo(() => {
    const roads: Block[] = [], kerbs: Block[] = [], markings: Block[] = [];
    for (const side of [-1, 1]) {
      roads.push([side * 15, -.11, 0, 6, .16, 36], [0, -.11, side * 15, 24, .16, 6]);
      kerbs.push([side * 11.9, -.015, 0, .3, .19, 24.1], [0, -.015, side * 11.9, 23.5, .19, .3]);
      for (let along = -9; along <= 9; along += 3) {
        markings.push([side * 15, -.024, along, .12, .012, 1.35], [along, -.024, side * 15, 1.35, .012, .12]);
      }
    }
    return {
      grass: new CircleGeometry(200, 96).rotateX(-Math.PI / 2).translate(0, -.21, 0),
      roads: blocks(roads), kerbs: blocks(kerbs), markings: blocks(markings),
    };
  }, []);
  useEffect(() => () => Object.values(geometry).forEach((g) => g.dispose()), [geometry]);
  return <>
    <fog attach="fog" args={["#c8deeb", 58, 118]} />
    <hemisphereLight args={["#dcefff", "#78816c", .85]} />
    <ambientLight intensity={.12} color="#fff5e4" />
    <directionalLight
      position={[-24, 42, 28]} color="#fff0d5" intensity={2.5} castShadow
      shadow-mapSize={[1024, 1024]} shadow-bias={-.0002} shadow-normalBias={.035}
      shadow-camera-left={-32} shadow-camera-right={32}
      shadow-camera-top={38} shadow-camera-bottom={-24}
      shadow-camera-near={1} shadow-camera-far={110}
    />
    <directionalLight position={[25, 16, -22]} color="#c5ddff" intensity={.45} />
    <mesh geometry={geometry.grass} receiveShadow><meshLambertMaterial color="#9bad85" /></mesh>
    <mesh geometry={geometry.roads} receiveShadow><meshLambertMaterial color="#67737a" /></mesh>
    <mesh geometry={geometry.kerbs} receiveShadow><meshLambertMaterial color="#d6d7ce" /></mesh>
    <mesh geometry={geometry.markings} receiveShadow><meshLambertMaterial color="#eee9cf" /></mesh>
  </>;
}
