import {
  Component,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ComponentRef,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  MapControls,
  Html,
  OrthographicCamera,
  useGLTF,
} from "@react-three/drei";
import {
  Color,
  InstancedMesh,
  Object3D,
  Vector3,
  MOUSE,
  TOUCH,
  type Mesh,
} from "three";
import { CITY_TIERS, type CityProperty } from "../../domain/city";

const SPACING = 3.8;
const position = (coordinate: number) => coordinate * SPACING;
function Buildings({
  properties,
  selected,
  onSelect,
  reduced,
}: {
  properties: CityProperty[];
  selected: string | null;
  onSelect: (p: CityProperty) => void;
  reduced: boolean;
}) {
  const { nodes } = useGLTF("/city/city-kit.glb");
  const { gl } = useThree();
  const body = useRef<InstancedMesh>(null),
    roof = useRef<InstancedMesh>(null),
    windows = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []),
    positions = useRef(new Map<string, Vector3>()),
    moving = useRef(true),
    target = useMemo(() => new Vector3(), []);
  useLayoutEffect(() => {
    moving.current = true;
    const ids = new Set(properties.map((p) => p.id));
    for (const id of positions.current.keys())
      if (!ids.has(id)) positions.current.delete(id);
    properties.forEach((p, i) => {
      body.current?.setColorAt(i, new Color(p.profile.color));
      roof.current?.setColorAt(
        i,
        new Color(p.id === selected ? "#e0b872" : "#e3dccb"),
      );
    });
    if (body.current?.instanceColor)
      body.current.instanceColor.needsUpdate = true;
    if (roof.current?.instanceColor)
      roof.current.instanceColor.needsUpdate = true;
  }, [properties, selected]);
  useFrame((_, delta) => {
    if (!moving.current) return;
    let unsettled = false;
    properties.forEach((p, i) => {
      const height = CITY_TIERS[p.tier].height;
      target.set(position(p.x), 0, position(p.z));
      const current = positions.current.get(p.id) || target.clone();
      if (reduced) current.copy(target);
      else current.lerp(target, Math.min(1, delta * 5));
      positions.current.set(p.id, current);
      if (current.distanceToSquared(target) > 0.0001) unsettled = true;
      dummy.position.set(current.x, height / 2 + 0.15, current.z);
      dummy.scale.set(2.55, height, 2.55);
      dummy.updateMatrix();
      body.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.y = height + 0.22;
      dummy.scale.set(2.75, 0.2, 2.75);
      dummy.updateMatrix();
      roof.current?.setMatrixAt(i, dummy.matrix);
      for (let floor = 0; floor < 6; floor++) {
        const visible = floor < Math.max(1, Math.floor(height / 1.3));
        dummy.position.set(current.x, 0.65 + floor * 1.3, current.z + 1.283);
        dummy.scale.set(visible ? 1.85 : 0, 0.36, 0.02);
        dummy.updateMatrix();
        windows.current?.setMatrixAt(i * 6 + floor, dummy.matrix);
      }
    });
    for (const mesh of [body.current, roof.current, windows.current])
      if (mesh) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    moving.current = unsettled;
    gl.shadowMap.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh
        ref={body}
        args={[(nodes.CityBody as Mesh).geometry, undefined, properties.length]}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined) onSelect(properties[e.instanceId]);
        }}
        castShadow
        receiveShadow
      >
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh
        ref={roof}
        args={[(nodes.CityRoof as Mesh).geometry, undefined, properties.length]}
      >
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh
        ref={windows}
        args={[
          (nodes.CityGlass as Mesh).geometry,
          undefined,
          properties.length * 6,
        ]}
      >
        <meshLambertMaterial color="#b9cdd0" />
      </instancedMesh>
      {properties
        .filter((p) => p.rank <= 3 || p.id === selected)
        .map((p) => (
          <Html
            key={p.id}
            position={[
              position(p.x),
              CITY_TIERS[p.tier].height + 1,
              position(p.z),
            ]}
            center
            zIndexRange={[3, 0]}
          >
            <button
              className={`city-map-label ${selected === p.id ? "is-selected" : ""}`}
              onClick={() => onSelect(p)}
            >
              <span>{String(p.rank).padStart(2, "0")}</span>
              {p.profile.name}
            </button>
          </Html>
        ))}
    </>
  );
}
function Ground({
  capacity,
  center,
}: {
  capacity: number;
  center: { x: number; z: number };
}) {
  const plots = useMemo(() => {
      const radius = Math.round(Math.sqrt(capacity) / 2),
        sites: { x: number; z: number }[] = [];
      for (
        let x = Math.max(-radius, center.x - 14);
        x <= Math.min(radius, center.x + 14);
        x++
      )
        for (
          let z = Math.max(-radius, center.z - 14);
          z <= Math.min(radius, center.z + 14);
          z++
        )
          if (x && z) sites.push({ x, z });
      return sites;
    }, [capacity, center.x, center.z]),
    ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const dummy = new Object3D();
    plots.forEach((p, i) => {
      dummy.position.set(position(p.x), 0.04, position(p.z));
      dummy.scale.set(3.25, 0.08, 3.25);
      dummy.updateMatrix();
      ref.current?.setMatrixAt(i, dummy.matrix);
    });
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      ref.current.computeBoundingSphere();
    }
  }, [plots]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry
          args={[Math.sqrt(capacity) * 8 + 60, Math.sqrt(capacity) * 8 + 60]}
        />
        <meshLambertMaterial color="#d4d5ca" />
      </mesh>
      <instancedMesh
        ref={ref}
        args={[undefined, undefined, plots.length]}
        receiveShadow
      >
        <boxGeometry />
        <meshLambertMaterial color="#eee9dc" />
      </instancedMesh>
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3, 48]} />
        <meshLambertMaterial color="#ece6d7" />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[1.1, 1.3, 0.25, 32]} />
        <meshLambertMaterial color="#a4b4ad" />
      </mesh>
      <mesh position={[0, 0.34, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1, 32]} />
        <meshLambertMaterial color="#83a8ad" />
      </mesh>
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <group key={`${x}${z}`} position={[x * 1.8, 0, z * 1.8]}>
            <mesh position={[0, 0.5, 0]}>
              <cylinderGeometry args={[0.09, 0.13, 1, 6]} />
              <meshLambertMaterial color="#766957" />
            </mesh>
            <mesh position={[0, 1.1, 0]}>
              <icosahedronGeometry args={[0.6, 1]} />
              <meshLambertMaterial color="#6f896a" />
            </mesh>
          </group>
        )),
      )}
      <Html position={[0, 0.2, 2.5]} center zIndexRange={[2, 0]}>
        <span className="city-plaza-label">CENTRAL PLAZA</span>
      </Html>
    </>
  );
}
function CameraRig({
  target,
  home,
  reduced,
  onRegion,
}: {
  target: CityProperty | null;
  home: number;
  reduced: boolean;
  onRegion: (x: number, z: number) => void;
}) {
  const controls = useRef<ComponentRef<typeof MapControls>>(null),
    destination = useRef<Vector3 | null>(null),
    last = useRef(""),
    timer = useRef(0);
  const { camera } = useThree();
  useEffect(() => {
    destination.current = new Vector3(
      target ? position(target.x) : 0,
      0,
      target ? position(target.z) : 0,
    );
  }, [target?.id, target?.x, target?.z, home]);
  useFrame((_, delta) => {
    const control = controls.current;
    if (!control) return;
    if (destination.current) {
      const diff = destination.current.clone().sub(control.target);
      if (diff.length() < 0.02) {
        destination.current = null;
      } else {
        diff.multiplyScalar(reduced ? 1 : Math.min(delta * 4, 1));
        camera.position.add(diff);
        control.target.add(diff);
        control.update();
      }
    }
    timer.current += delta;
    if (timer.current > 1) {
      timer.current = 0;
      const x = Math.round(control.target.x / SPACING),
        z = Math.round(control.target.z / SPACING),
        key = `${Math.round(x / 4)},${Math.round(z / 4)}`;
      if (key !== last.current) {
        last.current = key;
        onRegion(x, z);
      }
    }
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        !controls.current ||
        !(e.target instanceof HTMLElement) ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)
      )
        return;
      const movement: Record<string, [number, number]> = {
        ArrowUp: [-2, -2],
        ArrowDown: [2, 2],
        ArrowLeft: [-2, 2],
        ArrowRight: [2, -2],
      };
      const step = movement[e.key];
      if (step) {
        e.preventDefault();
        destination.current = null;
        const offset = new Vector3(step[0], 0, step[1]);
        camera.position.add(offset);
        controls.current.target.add(offset);
        controls.current.update();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [camera]);
  return (
    <MapControls
      ref={controls}
      enableRotate={false}
      minZoom={5}
      maxZoom={45}
      enableDamping={!reduced}
      dampingFactor={0.12}
      onStart={() => {
        destination.current = null;
      }}
      mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
      touches={{ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }}
    />
  );
}
class SceneBoundary extends Component<
  { children: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
function ContextGuard({ onFailure }: { onFailure: () => void }) {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (e: Event) => {
      e.preventDefault();
      onFailure();
    };
    canvas.addEventListener("webglcontextlost", lost);
    return () => canvas.removeEventListener("webglcontextlost", lost);
  }, [gl, onFailure]);
  return null;
}
export default function CityScene({
  properties,
  selected,
  capacity,
  home,
  onSelect,
  onRegion,
  onFailure,
}: {
  properties: CityProperty[];
  selected: CityProperty | null;
  capacity: number;
  home: number;
  onSelect: (p: CityProperty) => void;
  onRegion: (x: number, z: number) => void;
  onFailure: () => void;
}) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [center, setCenter] = useState({ x: 0, z: 0 });
  const [softwareRenderer, setSoftwareRenderer] = useState(false);
  const visible = useMemo(
    () =>
      properties.filter(
        (p) =>
          (Math.abs(p.x - center.x) <= 12 && Math.abs(p.z - center.z) <= 12) ||
          p.id === selected?.id,
      ),
    [properties, center.x, center.z, selected?.id],
  );
  return (
    <SceneBoundary onFailure={onFailure}>
      <Canvas
        dpr={softwareRenderer ? 0.75 : [1, 1.5]}
        shadows={softwareRenderer ? false : { type: 0, autoUpdate: false }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.setClearColor("#e4e5dc");
          const context = gl.getContext(),
            info = context.getExtension("WEBGL_debug_renderer_info");
          if (
            info &&
            /SwiftShader|llvmpipe|software/i.test(
              String(context.getParameter(info.UNMASKED_RENDERER_WEBGL)),
            )
          )
            setSoftwareRenderer(true);
        }}
      >
        <ContextGuard onFailure={onFailure} />
        <OrthographicCamera
          makeDefault
          position={[42, 38, 42]}
          zoom={15}
          near={0.1}
          far={1500}
        />
        <ambientLight intensity={0.9} />
        <directionalLight
          position={[-20, 40, 10]}
          intensity={1.3}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-40}
          shadow-camera-right={40}
          shadow-camera-top={40}
          shadow-camera-bottom={-40}
        />
        <fog attach="fog" args={["#e4e5dc", 100, 270]} />
        <Ground capacity={capacity} center={center} />
        <Buildings
          properties={visible}
          selected={selected?.id || null}
          onSelect={onSelect}
          reduced={reduced}
        />
        <CameraRig
          target={selected}
          home={home}
          reduced={reduced}
          onRegion={(x, z) => {
            setCenter((previous) =>
              previous.x === x && previous.z === z ? previous : { x, z },
            );
            onRegion(x, z);
          }}
        />
      </Canvas>
    </SceneBoundary>
  );
}
