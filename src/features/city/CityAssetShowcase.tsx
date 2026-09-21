import {
  Component,
  Suspense,
  useEffect,
  useCallback,
  type ComponentRef,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, MapControls, useGLTF } from "@react-three/drei";
import {
  BoxGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Mesh,
  MeshLambertMaterial,
  SRGBColorSpace,
  Vector3,
  type Material,
  type MeshStandardMaterial,
  type OrthographicCamera,
} from "three";
import { Batch, type Instance, type Piece } from "./CityInstances";
import { billboardEnvelope, buildingVariant } from "../../domain/cityLayout";
import manifest from "../../../public/city/megacity/manifest.json";
import "./CityAssetShowcase.css";
const allBuildings = manifest.assets.filter((a) => a.tier !== null);
const decorations = manifest.assets.filter((a) => a.tier === null);
const box = new BoxGeometry(1, 1, 1);
const ground = new MeshLambertMaterial({ color: "#b4bca4" });
const frame = new MeshLambertMaterial({ color: "#354139" });
const position = (i: number, count = 5): [number, number, number] => [
  (i - (count - 1) / 2) * 27,
  0,
  -16,
];
function usePieces(url: string) {
  const { scene } = useGLTF(url, false, true);
  const assets = useMemo(() => {
    const result = new Map<string, Piece[]>();
    const materials = new Map<Material, MeshLambertMaterial>();
    scene.updateMatrixWorld(true);
    for (const root of scene.children) {
      const pieces: Piece[] = [];
      root.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        const original = child.material as MeshStandardMaterial;
        if (Array.isArray(original))
          throw new Error("Expected exported material primitives");
        let material = materials.get(original);
        if (!material) {
          material = new MeshLambertMaterial({
            color: original.color,
            map: original.map,
            side: original.side,
            alphaTest: original.alphaTest,
            transparent: original.transparent,
            opacity: original.opacity,
            depthWrite: !original.transparent,
          });
          materials.set(original, material);
        }
        const geometry = child.geometry.clone();
        for (const semantic of ["position", "normal"]) {
          const attr = geometry.getAttribute(semantic);
          if (!attr) continue;
          const values = new Float32Array(attr.count * 3);
          for (let i = 0; i < attr.count; i++)
            values.set([attr.getX(i), attr.getY(i), attr.getZ(i)], i * 3);
          geometry.setAttribute(
            semantic,
            new Float32BufferAttribute(values, 3),
          );
        }
        geometry.applyMatrix4(child.matrixWorld);
        pieces.push({ geometry, material });
      });
      result.set(root.userData.assetKey || root.name, pieces);
    }
    return result;
  }, [scene]);
  useEffect(
    () => () => {
      const mats = new Set<Material>();
      for (const pieces of assets.values())
        for (const p of pieces) {
          p.geometry.dispose();
          mats.add(p.material);
        }
      for (const mat of mats) mat.dispose();
    },
    [assets],
  );
  return assets;
}
function Sign({
  label,
  width,
  height,
  bottom,
  front,
}: {
  label: string;
  width: number;
  height: number;
  bottom: number;
  front: number;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 384;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#efeadb";
    ctx.fillRect(0, 0, 768, 384);
    ctx.fillStyle = "#315742";
    ctx.fillRect(0, 0, 230, 384);
    ctx.fillStyle = "#efeadb";
    ctx.font = "bold 110px sans-serif";
    ctx.fillText("S", 72, 222);
    ctx.fillStyle = "#315742";
    ctx.font = "20px sans-serif";
    ctx.fillText("SYNARC / SAMPLE BRAND", 260, 95);
    ctx.font = "bold 32px sans-serif";
    ctx.fillText(label, 260, 165, 475);
    ctx.font = "22px sans-serif";
    ctx.fillText("A place for your next idea.", 260, 225);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }, [label]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={[0, bottom, front]}>
      <mesh
        position={[0, height / 2, 0]}
        geometry={box}
        material={frame}
        scale={[width + 0.25, height + 0.25, 0.25]}
      />
      <mesh position={[0, height / 2, 0.14]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} />
      </mesh>
      {[-0.35, 0.35].map((v) => (
        <mesh
          key={v}
          geometry={box}
          material={frame}
          position={[width * v, -bottom / 2, 0]}
          scale={[0.18, bottom, 0.18]}
        />
      ))}
    </group>
  );
}
function Camera({
  buildings,
  focus,
  stress,
  reduced,
}: {
  buildings: typeof allBuildings;
  focus: number | null;
  stress: boolean;
  reduced: boolean;
}) {
  const { camera } = useThree();
  const controls = useRef<ComponentRef<typeof MapControls>>(null);
  const destination = useRef<{
    position: Vector3;
    target: Vector3;
    zoom: number;
  } | null>(null);
  const cancelFlight = useCallback(() => {
    destination.current = null;
  }, []);
  useEffect(() => {
    const p =
      focus === null
        ? [0, 0, 12]
        : focus < buildings.length
          ? position(focus, buildings.length)
          : [(focus - buildings.length - 1) * 12, 0, 48];
    const target = new Vector3(
      p[0],
      focus === null
        ? Math.max(...buildings.map((a) => a.height)) * 0.3
        : focus < buildings.length
          ? buildings[focus].height * 0.45
          : 0.8,
      p[2],
    );
    destination.current = {
      target,
      position: target
        .clone()
        .add(
          new Vector3(
            stress ? 430 : focus === null ? 100 : 32,
            stress ? 490 : focus === null ? 105 : 38,
            stress ? 500 : focus === null ? 115 : 42,
          ),
        ),
      zoom: stress
        ? 1.3
        : focus === null
          ? Math.min(
              7.2,
              600 / (Math.max(...buildings.map((a) => a.height)) + 50),
            )
          : focus < buildings.length
            ? Math.min(14, 500 / (buildings[focus].height + 10))
            : 55,
    };
  }, [focus, stress, buildings]);
  useFrame((_, delta) => {
    const dest = destination.current;
    if (!dest || !controls.current) return;
    const t = reduced ? 1 : 1 - Math.exp(-delta * 7);
    camera.position.lerp(dest.position, t);
    controls.current.target.lerp(dest.target, t);
    const cam = camera as OrthographicCamera;
    cam.zoom += (dest.zoom - cam.zoom) * t;
    cam.updateProjectionMatrix();
    controls.current.update();
    if (camera.position.distanceTo(dest.position) < 0.02)
      destination.current = null;
  });
  return (
    <MapControls
      ref={controls}
      enableRotate={false}
      minZoom={0.7}
      maxZoom={80}
      enableDamping
      onStart={cancelFlight}
    />
  );
}
function Metrics() {
  const { gl } = useThree();
  const elapsed = useRef(0);
  useFrame((_, dt) => {
    elapsed.current += dt;
    if (elapsed.current < 1) return;
    elapsed.current = 0;
    gl.domElement.dataset.showcaseStats = JSON.stringify({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      textures: gl.info.memory.textures,
    });
  });
  return null;
}
function World({
  buildings,
  stress,
  lod,
  billboards,
  reference,
  onFocus,
}: {
  buildings: typeof allBuildings;
  stress: boolean;
  lod: "near" | "far";
  billboards: boolean;
  reference: boolean;
  onFocus: (i: number) => void;
}) {
  const mega = usePieces("/city/megacity/showcase.glb?v=3");
  const kit = usePieces("/city/downtown/downtown.glb?v=source-v4");
  const groups = useMemo(() => {
    const out = new Map<string, Instance[]>();
    for (let i = 0; i < (stress ? 400 : buildings.length); i++) {
      const asset = buildings[i % buildings.length];
      const [x, , z] = stress
        ? [((i % 20) - 9.5) * 24, 0, (Math.floor(i / 20) - 9.5) * 24]
        : position(i, buildings.length);
      const key = `${asset.key}_${lod}`;
      const group = out.get(key) || [];
      group.push({ key: String(i), x, z });
      out.set(key, group);
    }
    return out;
  }, [stress, lod, buildings]);
  const plots = useMemo(
    () =>
      Array.from({ length: stress ? 400 : buildings.length }, (_, i) => {
        const [x, , z] = stress
          ? [((i % 20) - 9.5) * 24, 0, (Math.floor(i / 20) - 9.5) * 24]
          : position(i, buildings.length);
        return {
          key: `plot-${i}`,
          x,
          y: -0.15,
          z,
          scale: [23.5, 0.25, 23.5] as [number, number, number],
        };
      }),
    [stress, buildings],
  );
  return (
    <>
      <Batch pieces={[{ geometry: box, material: ground }]} instances={plots} />
      {[...groups].map(([key, instances]) => (
        <Batch key={key} pieces={mega.get(key)!} instances={instances} />
      ))}
      {!stress &&
        buildings.map((asset, i) => {
          const [x, , z] = position(i, buildings.length);
          return (
            <group key={asset.key} position={[x, 0, z]}>
              {billboards && <Sign label={asset.label} {...asset.billboard} />}
              <Html position={[0, 0.1, 12]} center>
                <button className="mas-label" onClick={() => onFocus(i)}>
                  {asset.label}
                </button>
              </Html>
            </group>
          );
        })}
      {!stress &&
        reference &&
        buildings.map((asset, i) => {
          const [x] = position(i, buildings.length);
          const variant = i % 2;
          const key = `Building_${asset.tier}_${variant}_${lod}`;
          const sample = ["preset-0", "preset-1"].find(
            (id) => buildingVariant(id) === variant,
          )!;
          const envelope = billboardEnvelope(asset.tier!, sample);
          return (
            <group key={key + i} position={[x, 0, 19]}>
              <Batch
                pieces={kit.get(key)!}
                instances={[{ key: `ref-${i}`, x: 0, z: 0 }]}
              />
              {billboards && (
                <group rotation={[0, envelope.rotation, 0]}>
                  <Sign label="Quaternius reference" {...envelope} />
                </group>
              )}
              <Html position={[0, 0.1, 12]} center>
                <span className="mas-label">
                  Quaternius · Tier {asset.tier! + 1}
                </span>
              </Html>
            </group>
          );
        })}
      {!stress &&
        decorations.map((asset, i) => (
          <group key={asset.key} position={[(i - 1) * 12, 0, 48]}>
            <mesh
              geometry={box}
              material={ground}
              position={[0, -0.15, 0]}
              scale={[8, 0.25, 7]}
            />
            <Batch
              pieces={mega.get(`${asset.key}_${lod}`)!}
              instances={[{ key: asset.key, x: 0, z: 0 }]}
            />
            <Html position={[0, 0.1, 4]} center>
              <button
                className="mas-label"
                onClick={() => onFocus(i + buildings.length)}
              >
                {asset.label}
              </button>
            </Html>
          </group>
        ))}
      <Metrics />
    </>
  );
}
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="mas-error">
        The preview could not load.{" "}
        <button onClick={() => location.reload()}>Reload preview</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function CityAssetShowcase() {
  const [collection, setCollection] = useState("offices");
  const [page, setPage] = useState(0);
  const collectionBuildings = useMemo(
    () =>
      allBuildings.filter((a) =>
        collection === "offices"
          ? a.key.startsWith("office-")
          : collection === "skyscrapers"
            ? a.key.startsWith("skyscraper-")
            : !a.key.startsWith("office-") && !a.key.startsWith("skyscraper-"),
      ),
    [collection],
  );
  const pageSize = collection === "skyscrapers" ? 6 : 5;
  const buildings = useMemo(
    () => collectionBuildings.slice(page * pageSize, (page + 1) * pageSize),
    [collectionBuildings, page, pageSize],
  );
  const [focus, setFocus] = useState<number | null>(null);
  const [stress, setStress] = useState(false);
  const [lod, setLod] = useState<"near" | "far">("near");
  const [billboards, setBillboards] = useState(true);
  const [reference, setReference] = useState(true);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const selected =
    focus === null ? null : [...buildings, ...decorations][focus];
  return (
    <main className="mas">
      <header>
        <a href="/city/demo">synarc / City</a>
        <span>Asset studio</span>
        <a href="/city/demo">Back to the city ↗</a>
      </header>
      <div className="mas-body">
        <aside>
          <p className="mas-eyebrow">MEGACITY COLLECTION / 01</p>
          <h1>
            A different shape <br />
            for the city.
          </h1>
          <p>
            Stores, offices and skyscrapers, with original proportions and
            shared materials. Explore the new collection beside our current
            buildings.
          </p>
          <div className="mas-controls">
            <label>
              Collection{" "}
              <select
                aria-label="Collection"
                value={collection}
                onChange={(e) => {
                  setCollection(e.target.value);
                  setPage(0);
                  setFocus(null);
                  setStress(false);
                }}
              >
                <option value="shops">Storefronts - 5</option>
                <option value="offices">Offices - 10</option>
                <option value="skyscrapers">Skyscrapers - 6</option>
              </select>
            </label>
            <div className="mas-pages">
              <button
                disabled={page === 0}
                onClick={() => {
                  setPage(page - 1);
                  setFocus(null);
                }}
              >
                Previous
              </button>
              <span>
                {page + 1} / {Math.ceil(collectionBuildings.length / pageSize)}
              </span>
              <button
                disabled={(page + 1) * pageSize >= collectionBuildings.length}
                onClick={() => {
                  setPage(page + 1);
                  setFocus(null);
                }}
              >
                Next
              </button>
            </div>
            <button
              onClick={() => {
                setFocus(null);
                setStress(false);
              }}
            >
              Show collection
            </button>
            <label>
              <input
                type="checkbox"
                checked={billboards}
                onChange={(e) => setBillboards(e.target.checked)}
              />{" "}
              Sample billboards
            </label>
            <label>
              <input
                type="checkbox"
                checked={reference}
                disabled={stress}
                onChange={(e) => setReference(e.target.checked)}
              />{" "}
              Quaternius comparison
            </label>
            <label>
              Detail{" "}
              <select
                aria-label="Detail"
                value={lod}
                onChange={(e) => setLod(e.target.value as "near" | "far")}
              >
                <option value="near">Near</option>
                <option value="far">Far / simplified</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={stress}
                onChange={(e) => {
                  setStress(e.target.checked);
                  setFocus(null);
                  setLod(e.target.checked ? "far" : "near");
                }}
              />{" "}
              400-building stress scene
            </label>
          </div>
          <nav aria-label="Building presets">
            {buildings.map((a, i) => (
              <button
                key={a.key}
                aria-pressed={focus === i}
                onClick={() => {
                  setStress(false);
                  setFocus(i);
                }}
              >
                <span>0{i + 1}</span>
                {a.label}
                <small>{a.triangles.toLocaleString()} triangles</small>
              </button>
            ))}
          </nav>
          <h2>Decorative modules</h2>
          <nav aria-label="Decorative presets">
            {decorations.map((a, i) => (
              <button
                key={a.key}
                aria-pressed={focus === i + buildings.length}
                onClick={() => {
                  setStress(false);
                  setFocus(i + buildings.length);
                }}
              >
                <span>0{i + 6}</span>
                {a.label}
                <small>{a.triangles.toLocaleString()} triangles</small>
              </button>
            ))}
          </nav>
          <section aria-live="polite">
            <h2>{selected ? selected.label : "Conversion notes"}</h2>
            {selected ? (
              <>
                <p>
                  {selected.width.toFixed(1)} × {selected.depth.toFixed(1)} m
                  footprint · {selected.height.toFixed(1)} m tall
                </p>
                <p>
                  {selected.uniformScale < 0.999 && (
                    <>Uniform plot fit: {selected.uniformScale.toFixed(2)}x. </>
                  )}
                  {selected.sourceMeshes} assembled meshes, including prefab
                  parts. {selected.farTriangles.toLocaleString()} triangles at
                  far detail.
                </p>
              </>
            ) : (
              <p>
                {(manifest.bytes / 1024).toFixed(0)} KB · one shared atlas ·
                {manifest.materials} materials. Glass uses an opaque
                approximation; Unity lighting and scripts are omitted.
              </p>
            )}
            <p className="mas-note">
              Preview collection only. Existing City properties are unchanged.
              The stress scene measures repeated buildings, not the complete
              production city.
            </p>
          </section>
        </aside>
        <div
          className="mas-viewport"
          data-testid="asset-showcase"
          data-stress={stress}
        >
          <SceneBoundary>
            <Suspense
              fallback={
                <div className="mas-loading">Preparing the collection…</div>
              }
            >
              <Canvas
                orthographic
                camera={{
                  position: [100, 105, 115],
                  zoom: 5.7,
                  near: 0.1,
                  far: 2000,
                }}
                dpr={[1, 1.5]}
                gl={{ antialias: true }}
              >
                <color attach="background" args={["#e7e9df"]} />
                <ambientLight intensity={1.5} />
                <directionalLight position={[50, 90, 30]} intensity={2.1} />
                <Camera
                  buildings={buildings}
                  focus={focus}
                  stress={stress}
                  reduced={reduced}
                />
                <World
                  buildings={buildings}
                  stress={stress}
                  lod={lod}
                  billboards={billboards}
                  reference={reference}
                  onFocus={setFocus}
                />
              </Canvas>
            </Suspense>
          </SceneBoundary>
          <div className="mas-hint">Drag to pan · Scroll or pinch to zoom</div>
        </div>
      </div>
    </main>
  );
}
