import { CityPavilion } from "./CityPavilion";
import { Html } from "@react-three/drei";
import type { CityProfile } from "../../domain/city";
import {
  Component,
  useEffect,
  useRef,
  useState,
  useMemo,
  type ReactNode,
  type ComponentRef,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MapControls, OrthographicCamera } from "@react-three/drei";
import { Vector3, MOUSE, TOUCH } from "three";
import { type CityProperty } from "../../domain/city";
import { plotAxis as position, logicalAxis } from "../../domain/cityLayout";
import { CityKit } from "./CityKit";
let savedCityCamera: {position:Vector3;target:Vector3;zoom:number;selection:string} | null = null;
function CameraRig({
  target,
  home,
  reduced,
  onRegion,
  onZoom,
}: {
  target: CityProperty | null;
  home: number;
  reduced: boolean;
  onRegion: (x: number, z: number) => void;
  onZoom: (zoom: number) => void;
}) {
  const controls = useRef<ComponentRef<typeof MapControls>>(null),
    destination = useRef<Vector3 | null>(null),
    last = useRef(""),
    timer = useRef(0);
  const { camera, size } = useThree();
  const restore = useRef(true);
  const selection = useRef(target?.id || ""); selection.current = target?.id || "";
  useEffect(()=>()=>{
    if(controls.current) savedCityCamera={position:camera.position.clone(),target:controls.current.target.clone(),zoom:camera.zoom,selection:selection.current};
  },[camera]);
  useEffect(() => {
    if(restore.current && savedCityCamera && savedCityCamera.selection === (target?.id || "") && controls.current) {
      camera.position.copy(savedCityCamera.position);camera.zoom=savedCityCamera.zoom;camera.updateProjectionMatrix();controls.current.target.copy(savedCityCamera.target);controls.current.update();restore.current=false;return;
    }
    restore.current=false;
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
    savedCityCamera={position:camera.position.clone(),target:control.target.clone(),zoom:camera.zoom,selection:selection.current};
    timer.current += delta;
    if (timer.current > 1) {
      timer.current = 0;
      onZoom(Math.round(camera.zoom * 2) / 2);
      const x = logicalAxis(control.target.x),
        z = logicalAxis(control.target.z),
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
        ArrowUp: [-12, -12],
        ArrowDown: [12, 12],
        ArrowLeft: [-12, 12],
        ArrowRight: [12, -12],
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
      minZoom={Math.max(2.2, (size.width + size.height / 0.54) / 990)}
      maxZoom={18}
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
  const sample = useRef(0);
  useFrame((_, delta) => {
    sample.current += delta;
    if (sample.current >= 1) {
      sample.current = 0;
      gl.domElement.dataset.cityRenderStats = JSON.stringify({
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
      });
    }
  });
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
  pavilion,
  trailMarkers,
}: {
  properties: CityProperty[];
  selected: CityProperty | null;
  capacity: number;
  home: number;
  onSelect: (p: CityProperty) => void;
  onRegion: (x: number, z: number) => void;
  onFailure: () => void;
  pavilion?: { profile?: CityProfile; title?: string };
  trailMarkers?: (CityProperty & { number: number })[];
}) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [zoom, setZoom] = useState(3.8);
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
          position={[420, 380, 420]}
          zoom={3.8}
          near={0.1}
          far={5000}
        />
        <ambientLight intensity={1.5} />
        <directionalLight
          position={[-120, 240, 80]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-160}
          shadow-camera-right={160}
          shadow-camera-top={160}
          shadow-camera-bottom={-160}
          shadow-camera-far={800}
          shadow-bias={-0.0003}
        />
        <fog attach="fog" args={["#e4e5dc", 850, 1500]} />
        {pavilion && <CityPavilion {...pavilion} />}
        {trailMarkers?.map((p) => (
          <Html key={p.id} center position={[position(p.x), 15, position(p.z)]}>
            <span className="city-trail-pin">{p.number}</span>
          </Html>
        ))}
        <CityKit
          properties={visible}
          selected={selected}
          capacity={capacity}
          center={center}
          zoom={zoom}
          onSelect={onSelect}
          reduced={reduced}
        />
        <CameraRig
          onZoom={setZoom}
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
