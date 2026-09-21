import { streamRadius } from "../../domain/cityStreaming";
import { CityArrivalContext } from "./CityInstances";
import { CityLaunchPlaza, LAUNCH_PLAZA_Z } from "./CityLaunchPlaza";
import type { LaunchItem } from "../../domain/cityLaunches";
import { useLiving } from "./CityLiving";
import { CityStreetActivity } from "./CityStreetActivity";
import { CityExposure } from "./CityExposure";
import type { ViewportRect } from "../../domain/cityLanding";
import { BUILDING_RECIPES } from "../../domain/cityLayout";
import { MarketMotionContext, type MarketPlayback } from "./CityMarketMotion";
import { type CustomerItem, discoveryLabel } from "../../domain/cityCustomer";
import { CityPavilion } from "./CityPavilion";
import { Html } from "@react-three/drei";
import type { CityProfile } from "../../domain/city";
import {
  Component,
  useCallback,
  type ComponentRef,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MapControls, OrthographicCamera } from "@react-three/drei";
import { MOUSE, TOUCH, Vector3 } from "three";
import { type CityProperty } from "../../domain/city";
import { logicalAxis, plotAxis as position } from "../../domain/cityLayout";
import { CityKit } from "./CityKit";
let establishedCentre = false;
let savedCityCamera: {
  position: Vector3;
  target: Vector3;
  zoom: number;
  selection: string;
} | null = null;
function CameraRig({
  target,
  home,
  reduced,
  onRegion,
  onZoom,
  central,
  viewport,
  onExplore,
  launchFocus = false,
}: {
  launchFocus?: boolean;
  target: CityProperty | null;
  home: number;
  reduced: boolean;
  onRegion: (x: number, z: number) => void;
  onZoom: (zoom: number) => void;
  central: CityProperty | null;
  viewport: ViewportRect | null;
  onExplore?: () => void;
}) {
  const controls = useRef<ComponentRef<typeof MapControls>>(null),
    destination = useRef<Vector3 | null>(null),
    last = useRef(""),
    timer = useRef(0);
  const { camera, size, gl } = useThree();
  const restore = useRef(true);
  const previousCamera = useRef(savedCityCamera);
  const manual = useRef(false), lastFocus = useRef("");
  const exploreRef = useRef(onExplore);
  exploreRef.current = onExplore;
  // Drei reconnects MapControls when event callbacks change. Never detach mid-drag.
  const startNavigation = useCallback(() => {
    destination.current = null;
    manual.current = true;
    exploreRef.current?.();
  }, []);
  useEffect(() => {
    const canvas = gl.domElement;
    const pointers = new Map<number, string>();
    const down = (event: PointerEvent) => pointers.set(event.pointerId, event.pointerType);
    const end = (event: PointerEvent) => pointers.delete(event.pointerId);
    const cancel = () => {
      for (const [pointerId, pointerType] of [...pointers]) {
        canvas.dispatchEvent(new PointerEvent("pointercancel", { pointerId, pointerType, bubbles: true }));
      }
      pointers.clear();
    };
    const visibility = () => { if (document.hidden) cancel(); };
    canvas.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", end, true);
    document.addEventListener("pointercancel", end, true);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      canvas.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", end, true);
      document.removeEventListener("pointercancel", end, true);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [gl]);
  const selection = useRef(target?.id || "");
  selection.current = target?.id || "";
  useEffect(
    () => () => {
      if (controls.current) {
        savedCityCamera = {
          position: camera.position.clone(),
          target: controls.current.target.clone(),
          zoom: camera.zoom,
          selection: selection.current,
        };
      }
    },
    [camera],
  );
  useEffect(() => {
    const control = controls.current;
    if (
      !control || !("isOrthographicCamera" in camera) ||
      control.object !== camera
    ) return;
    const focusKey = `${launchFocus ? "launch-plaza" : target?.id || "central"}:${home}`;
    if (lastFocus.current !== focusKey) {
      manual.current = false;
      lastFocus.current = focusKey;
    }
    if (manual.current) return;
    if (
      !launchFocus && restore.current && previousCamera.current &&
      previousCamera.current.selection === (target?.id || "")
    ) {
      camera.position.copy(previousCamera.current.position);
      camera.zoom = previousCamera.current.zoom;
      camera.updateProjectionMatrix();
      control.target.copy(previousCamera.current.target);
      control.update();
      restore.current = false;
      return;
    }
    restore.current = false;
    if (!establishedCentre) {
      camera.zoom = size.width < 900 ? 5 : 6;
      camera.updateProjectionMatrix();
    }
    const framed = (property: CityProperty | null) => {
      const p = new Vector3(
        property ? position(property.x) : 0,
        property ? BUILDING_RECIPES[property.tier].floors * 1.5 : 0,
        property ? position(property.z) : 0,
      );
      const cx = viewport
          ? (viewport.left + viewport.right) / 2
          : size.width / 2,
        cy = viewport ? (viewport.top + viewport.bottom) / 2 : size.height / 2;
      const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion),
        up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      return p.addScaledVector(right, -(cx - size.width / 2) / camera.zoom)
        .addScaledVector(up, -(size.height / 2 - cy) / camera.zoom);
    };
    const next = launchFocus ? framed(null).add(new Vector3(0,0,LAUNCH_PLAZA_Z)) : framed(target || central);
    if (!establishedCentre && !reduced) {
      const initial = framed(central);
      camera.position.add(initial.clone().sub(control.target));
      control.target.copy(initial);
      control.update();
      const wait = setTimeout(() => {
        establishedCentre = true;
        destination.current = next;
      }, 1200);
      const cancel = () => {
        establishedCentre = true;
        clearTimeout(wait);
      };
      window.addEventListener("pointerdown", cancel, { once: true });
      window.addEventListener("wheel", cancel, { once: true });
      return () => {
        clearTimeout(wait);
        window.removeEventListener("pointerdown", cancel);
        window.removeEventListener("wheel", cancel);
      };
    }
    establishedCentre = true;
    destination.current = next;
  }, [
    launchFocus,
    target?.id,
    target?.x,
    target?.z,
    central?.id,
    central?.x,
    central?.z,
    central?.tier,
    home,
    reduced,
    viewport,
    size.width,
    size.height,
    camera,
  ]);
  useFrame((_, delta) => {
    const control = controls.current;
    if (
      !control || !("isOrthographicCamera" in camera) ||
      control.object !== camera
    ) return;
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
    savedCityCamera = {
      position: camera.position.clone(),
      target: control.target.clone(),
      zoom: camera.zoom,
      selection: selection.current,
    };
    timer.current += delta;
    if (timer.current > 1) {
      timer.current = 0;
      gl.domElement.dataset.cityCamera = JSON.stringify({ x: camera.position.x, z: camera.position.z, zoom: camera.zoom });
      onZoom(Math.round(camera.zoom * 2) / 2);
      const x = logicalAxis(control.target.x),
        z = logicalAxis(control.target.z),
        key = `${x},${z}`;
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
      ) {
        return;
      }
      const movement: Record<string, [number, number]> = {
        ArrowUp: [-12, -12],
        ArrowDown: [12, 12],
        ArrowLeft: [-12, 12],
        ArrowRight: [12, -12],
      };
      const step = movement[e.key];
      if (step) {
        e.preventDefault();
        startNavigation();
        const offset = new Vector3(step[0], 0, step[1]);
        camera.position.add(offset);
        controls.current.target.add(offset);
        controls.current.update();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [camera, startNavigation]);
  return (
    <MapControls
      ref={controls}
      enableRotate={false}
      minZoom={Math.max(2.2, (size.width + size.height / 0.54) / 990)}
      maxZoom={18}
      enableDamping={!reduced}
      dampingFactor={0.12}
      onStart={startNavigation}
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
function DiscoveryMarkers({
  items,
  zoom,
  onSelect,
}: {
  items: CustomerItem[];
  zoom: number;
  onSelect: (item: CustomerItem) => void;
}) {
  const { camera, size } = useThree();
  const [shown, setShown] = useState<CustomerItem[]>([]);
  const elapsed = useRef(0),
    last = useRef("");
  useEffect(() => {
    last.current = "";
  }, [items]);
  useFrame((_, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.25) return;
    elapsed.current = 0;
    const boxes: { x: number; y: number }[] = [],
      ids = new Set<string>(),
      next: CustomerItem[] = [];
    if (zoom >= 3) {
      for (const item of items) {
        if (item.x === null || item.z === null || ids.has(item.business_id)) {
          continue;
        }
        const p = new Vector3(position(item.x), 22, position(item.z)).project(
            camera,
          ),
          x = ((p.x + 1) * size.width) / 2,
          y = ((1 - p.y) * size.height) / 2;
        if (
          p.z < -1 ||
          p.z > 1 ||
          x < 60 ||
          x > size.width - 60 ||
          y < 30 ||
          y > size.height - 30 ||
          boxes.some((b) => Math.abs(b.x - x) < 115 && Math.abs(b.y - y) < 38)
        ) {
          continue;
        }
        ids.add(item.business_id);
        boxes.push({ x, y });
        next.push(item);
        if (next.length === 8) break;
      }
    }
    const key = next.map((i) => i.key).join("|");
    if (key !== last.current) {
      last.current = key;
      setShown(next);
    }
  });
  return (
    <>
      {shown.map((m) => (
        <Html
          key={m.key}
          center
          position={[position(m.x || 0), 22, position(m.z || 0)]}
        >
          <button
            className="city-deal-pin"
            aria-label={`${discoveryLabel(m)} at ${m.business_name}`}
            onClick={() => onSelect(m)}
          >
            {discoveryLabel(m)}
          </button>
        </Html>
      ))}
    </>
  );
}
function SceneReady({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return null;
}
export default function CityScene({
  officeDemo = false,
  properties,
  selected,
  capacity,
  home,
  onSelect,
  onRegion,
  onFailure,
  pavilion,
  trailMarkers,
  matches,
  markers,
  onDiscoverySelect,
  playback,
  onReady,
  central = null,
  viewport = null,
  onExplore,
  onExposure,
  launches = [],
  launchActivity = false,
  launchFocus = false,
}: {
  officeDemo?: boolean;
  launches?: LaunchItem[];
  launchActivity?: boolean;
  launchFocus?: boolean;
  onReady?: () => void;
  central?: CityProperty | null;
  viewport?: ViewportRect | null;
  onExplore?: () => void;
  onExposure?: (ids: string[], kind: "canvas") => void;
  playback?: MarketPlayback | null;
  properties: CityProperty[];
  selected: CityProperty | null;
  capacity: number;
  home: number;
  onSelect: (p: CityProperty) => void;
  onRegion: (x: number, z: number) => void;
  onFailure: () => void;
  pavilion?: { profile?: CityProfile; title?: string };
  matches?: string[] | null;
  markers?: CustomerItem[];
  onDiscoverySelect?: (item: CustomerItem) => void;
  trailMarkers?: (CityProperty & { number: number })[];
}) {
  const living=useLiving();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [zoom, setZoom] = useState(3.8);
  const [center, setCenter] = useState({ x: 0, z: 0 });
  const [softwareRenderer, setSoftwareRenderer] = useState(false);
  const residents = useRef(new Map<string, number>());
  const visible = useMemo(() => {
    const radius = streamRadius(window.innerWidth, window.innerHeight, zoom);
    return properties.filter(p => {
      const distance = Math.hypot(position(p.x) - position(center.x), position(p.z) - position(center.z));
      return distance <= radius + (residents.current.has(p.id) ? 66 : 0) || p.id === selected?.id ||
        !!playback?.event.moves.some(m => m.id === p.id);
    });
  }, [properties, center.x, center.z, zoom, selected?.id, playback, viewport]);
  const arrivals = useMemo(() => new Map(visible.map(p => [p.id, residents.current.get(p.id) ?? performance.now()])), [visible]);
  useEffect(() => { residents.current = arrivals; }, [arrivals]);
  const mobile = window.innerWidth < 900;
  return (
    <SceneBoundary onFailure={onFailure}>
      <Canvas
        data-city-resident-count={visible.length}
        dpr={softwareRenderer ? 0.75 : [1, 1.5]}
        shadows={softwareRenderer || mobile ? false : { type: 0, autoUpdate: false }}
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
          ) {
            setSoftwareRenderer(true);
          }
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
        <CityStreetActivity
          properties={matches ? visible.filter(p=>matches.includes(p.id)) : visible}
          reduced={reduced}
          paused={!!playback || launchFocus}
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
        {(launches.length > 0 || launchFocus) && <CityLaunchPlaza items={launches} active={launchFocus && launchActivity && !playback}/>}
        {!living.storefronts && !markers &&
          zoom >= 3 &&
          visible
            .filter((p) => p.hasDeal)
            .slice(0, 12)
            .map((p) => (
              <Html
                key={`deal-${p.id}`}
                center
                position={[position(p.x), 19, position(p.z)]}
              >
                <button
                  className="city-deal-pin"
                  aria-label={`City deal at ${p.profile.name}`}
                  onClick={() => onSelect(p)}
                >
                  ✦ Deal
                </button>
              </Html>
            ))}
        {markers && !living.storefronts && (
          <DiscoveryMarkers
            items={markers}
            zoom={zoom}
            onSelect={onDiscoverySelect || (() => {})}
          />
        )}
        {trailMarkers?.map((p) => (
          <Html key={p.id} center position={[position(p.x), 15, position(p.z)]}>
            <span className="city-trail-pin">{p.number}</span>
          </Html>
        ))}
        {visible
          .filter((p) => p.rank === 1)
          .map((p) => (
            <mesh
              key={`leader-${p.id}`}
              position={[position(p.x), 0.04, position(p.z)]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <ringGeometry args={[10.7, 11.2, 4, 1, Math.PI / 4]} />
              <meshBasicMaterial color="#bfa457" />
            </mesh>
          ))}
        <MarketMotionContext.Provider value={playback || null}>
          <CityArrivalContext.Provider value={arrivals}>
          <CityKit
            officeDemo={officeDemo}
            properties={visible}
            matchIds={matches ? new Set(matches) : undefined}
            selected={selected}
            capacity={capacity}
            center={center}
            zoom={zoom}
            onSelect={onSelect}
            reduced={reduced}
          />
          </CityArrivalContext.Provider>
        </MarketMotionContext.Provider>
        <SceneReady onReady={onReady} />
        {onExposure && (
          <CityExposure
            properties={visible}
            onExposure={onExposure}
            paused={!!playback}
          />
        )}
        <CameraRig
          launchFocus={launchFocus}
          central={central}
          viewport={viewport}
          onExplore={onExplore}
          onZoom={setZoom}
          target={selected}
          home={home}
          reduced={reduced}
          onRegion={(x, z) => {
            setCenter((previous) =>
              previous.x === x && previous.z === z ? previous : { x, z }
            );
            onRegion(x, z);
          }}
        />
      </Canvas>
    </SceneBoundary>
  );
}
