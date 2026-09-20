import {
  Component,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type ComponentRef,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, MapControls, OrthographicCamera } from "@react-three/drei";
import { Vector3, MOUSE } from "three";
import { CityKit } from "./CityKit";
import { campusSlots, type CityCampus } from "../../domain/cityCampus";
import { plotAxis } from "../../domain/cityLayout";
import type { CityProfile, CityProperty } from "../../domain/city";
class Boundary extends Component<
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
function Controls({
  target,
  onFailure,
}: {
  target: CityProperty | null;
  onFailure: () => void;
}) {
  const controls = useRef<ComponentRef<typeof MapControls>>(null);
  const { gl } = useThree();
  useEffect(() => {
    const lost = (e: Event) => {
      e.preventDefault();
      onFailure();
    };
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => gl.domElement.removeEventListener("webglcontextlost", lost);
  }, [gl, onFailure]);
  const destination = useRef<Vector3 | null>(null);
  useEffect(() => {
    destination.current = new Vector3(
      target ? plotAxis(target.x) : 0,
      0,
      target ? plotAxis(target.z) : 0,
    );
  }, [target?.id]);
  useFrame(() => {
    if (!controls.current || !destination.current) return;
    const delta = destination.current.clone().sub(controls.current.target);
    if (delta.length() < 0.1) {
      destination.current = null;
      return;
    }
    const step = delta.multiplyScalar(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 0.09,
    );
    controls.current.target.add(step);
    controls.current.object.position.add(step);
    controls.current.update();
  });
  return (
    <MapControls
      ref={controls}
      onStart={() => {
        destination.current = null;
      }}
      makeDefault
      enableRotate={false}
      minZoom={2}
      maxZoom={12}
      mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
    />
  );
}
export default function CityCampusScene({
  profile,
  campus,
  selected,
  onSelect,
  onFailure,
}: {
  profile: CityProfile;
  campus: CityCampus;
  selected: string;
  onSelect: (id: string) => void;
  onFailure: () => void;
}) {
  const buildings = useMemo(() => {
    const slots = campusSlots(campus.layout);
    return campus.exhibits.map((e, i): CityProperty => ({
      id: e.id,
      slug: e.id,
      profile: {
        ...profile,
        name: e.title,
        billboard: e.items[0]?.image || profile.billboard,
        hero: e.items[0]?.image || profile.hero,
      },
      x: slots[i][0],
      z: slots[i][1],
      tier: e.kind === "offer" ? 0 : 2,
      rank: 0,
      landValue: 0,
      saves: 0,
      claims: 0,
    }));
  }, [campus, profile]);
  const hq = useMemo(
    (): CityProperty => ({
      id: "campus-hq",
      slug: "hq",
      profile,
      x: -1,
      z: -2,
      tier: 3,
      rank: 0,
      landValue: 0,
      saves: 0,
      claims: 0,
    }),
    [profile],
  );
  const current = buildings.find((b) => b.id === selected) || null;
  return (
    <Boundary onFailure={onFailure}>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true }}
        onCreated={({ gl }) => gl.setClearColor("#e5e6db")}
      >
        <OrthographicCamera makeDefault position={[135, 155, 155]} zoom={4} />
        <ambientLight intensity={1.7} />
        <directionalLight position={[70, 100, 40]} intensity={2.1} />
        <Controls target={current} onFailure={onFailure} />
        <CityKit
          properties={[hq, ...buildings]}
          selected={current}
          capacity={16}
          center={{ x: 0, z: 0 }}
          zoom={4}
          onSelect={(p) => {
            if (p.id !== "campus-hq") onSelect(p.id);
          }}
          reduced={
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
          }
          labels={false}
        />
        <Html
          center
          position={[plotAxis(hq.x), 17, plotAxis(hq.z)]}
          zIndexRange={[2, 0]}
        >
          <div className="city-pavilion-label">
            <strong>{profile.name}</strong>
            <span>HEADQUARTERS</span>
          </div>
        </Html>
        {buildings.map((b, i) => (
          <Html
            key={b.id}
            center
            position={[plotAxis(b.x), 6, plotAxis(b.z)]}
            zIndexRange={[3, 0]}
          >
            <button
              className="city-campus-pin"
              aria-label={"Open " + b.profile.name}
              aria-pressed={selected === b.id}
              onClick={() => onSelect(b.id)}
            >
              {i + 1} · {b.profile.name}
            </button>
          </Html>
        ))}
      </Canvas>
    </Boundary>
  );
}
