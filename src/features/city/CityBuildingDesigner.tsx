import { Component, type ReactNode, useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  BUILDING_PRESETS,
  buildingMasses,
  type CityBuildingDesign,
  DEFAULT_BUILDING_DESIGN,
} from "../../domain/cityBuildingDesign";
import type { CityProfile, CityProperty } from "../../domain/city";
import { CityDesignBuildings } from "./CityDesignBuildings";

function FitCamera() {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    camera.zoom = Math.min(size.width, size.height) / 43;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, invalidate]);
  return null;
}
class DesignBoundary
  extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed
      ? (
        <p role="status">
          3D is unavailable on this device. The blueprint and design controls
          still work.
        </p>
      )
      : this.props.children;
  }
}
function Blueprint({ design }: { design: CityBuildingDesign }) {
  return (
    <svg
      className="city-design-blueprint"
      viewBox="-13 -13 26 26"
      role="img"
      aria-label={`${design.blueprint} footprint blueprint`}
    >
      <rect
        x="-12"
        y="-12"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth=".1"
      />
      <rect
        x="-10.8"
        y="-10.8"
        width="21.6"
        height="21.6"
        fill="none"
        stroke="currentColor"
        strokeWidth=".08"
        strokeDasharray=".4 .3"
      />
      <g transform={`rotate(${-90 * design.rotation})`}>
        {buildingMasses({ ...design, floors: 1 }).map((m, i) => (
          <rect
            key={i}
            x={m.x - m.width / 2}
            y={m.z - m.depth / 2}
            width={m.width}
            height={m.depth}
            fill="currentColor"
            fillOpacity=".2"
            stroke="currentColor"
            strokeWidth=".14"
          />
        ))}
      </g>
    </svg>
  );
}
export function CityBuildingDesigner(
  { profile, onChange }: {
    profile: CityProfile;
    onChange: (design: CityBuildingDesign) => void;
  },
) {
  const design = profile.buildingDesign || DEFAULT_BUILDING_DESIGN;
  const [view, setView] = useState<"3d" | "plan">("3d"),
    [cameraKey, setCameraKey] = useState(0),
    [grid, setGrid] = useState(false);
  const property = useMemo<CityProperty>(
    () => ({
      id: "design-preview",
      slug: "preview",
      profile: { ...profile, buildingArt: "", buildingDesign: design },
      tier: 0,
      rank: 1,
      x: 0,
      z: 0,
      landValue: 0,
      saves: 0,
      claims: 0,
    }),
    [profile, design],
  );
  const properties = useMemo(() => [property], [property]);
  function update<K extends keyof CityBuildingDesign>(
    key: K,
    value: CityBuildingDesign[K],
  ) {
    onChange({ ...design, [key]: value });
  }
  return (
    <section
      className="city-design-studio"
      aria-label="Live 3D building designer"
    >
      <div className="city-section-heading">
        <div>
          <span>LIVE 3D DESIGN</span>
          <h2>Shape your place.</h2>
        </div>
        <p>Presets, blueprints and materials. Every change is immediate.</p>
      </div>
      <div className="city-building-workbench">
        <div className="city-studio-stage">
          <div className="city-studio-toolbar">
            <button
              type="button"
              aria-pressed={view === "3d"}
              onClick={() => setView("3d")}
            >
              3D view
            </button>
            <button
              type="button"
              aria-pressed={view === "plan"}
              onClick={() => setView("plan")}
            >
              Blueprint view
            </button>
            <button
              type="button"
              aria-pressed={grid}
              onClick={() => setGrid(!grid)}
            >
              Plot grid
            </button>
            <button type="button" onClick={() => setCameraKey((k) => k + 1)}>
              Reset camera
            </button>
          </div>
          {view === "plan" ? <Blueprint design={design} /> : (
            <div
              className="city-design-canvas"
              data-blueprint={design.blueprint}
              data-floors={design.floors}
            >
              <DesignBoundary>
                <Canvas
                  key={cameraKey}
                  orthographic
                  frameloop="demand"
                  dpr={[1, 1.5]}
                  camera={{
                    position: [32, 30, 32],
                    zoom: 15,
                    near: .1,
                    far: 200,
                  }}
                  gl={{ antialias: true }}
                >
                  <color attach="background" args={["#e8e5da"]} />
                  <ambientLight intensity={1.6} />
                  <directionalLight position={[10, 30, 20]} intensity={2} />
                  <FitCamera />
                  <CityDesignBuildings properties={properties} />
                  {grid && (
                    <gridHelper
                      args={[24, 12, "#64796d", "#b1baaa"]}
                      position={[0, .31, 0]}
                    />
                  )}
                  <OrbitControls
                    target={[0, 6, 0]}
                    enablePan={false}
                    minZoom={3}
                    maxZoom={35}
                    maxPolarAngle={Math.PI / 2.1}
                  />
                </Canvas>
              </DesignBoundary>
            </div>
          )}
          <div className="city-design-caption">
            <strong>{profile.name || "Your business"}</strong>
            <span>
              {design.floors} floors · {design.width} m footprint ·{" "}
              {design.tile} tile
            </span>
          </div>
          <p className="city-studio-note">
            Drag to orbit · Scroll or pinch to zoom. Your saved design uses the
            same geometry in the city.
          </p>
        </div>
        <div className="city-studio-settings">
          <fieldset className="city-preset-picker">
            <legend>Building presets</legend>
            {BUILDING_PRESETS.map((p) => (
              <button
                type="button"
                key={p.name}
                aria-pressed={design.blueprint === p.design.blueprint}
                onClick={() => onChange({ ...p.design })}
              >
                <strong>{p.name}</strong>
                <small>{p.description}</small>
              </button>
            ))}
          </fieldset>
          <div className="city-art-controls">
            <label>
              Floors <output>{design.floors}</output>
              <input
                aria-label="Floors"
                type="range"
                min="1"
                max="8"
                value={design.floors}
                onChange={(e) => update("floors", Number(e.target.value))}
              />
            </label>
            <label>
              Footprint width <output>{design.width} m</output>
              <input
                aria-label="Footprint width"
                type="range"
                min="12"
                max="18"
                value={design.width}
                onChange={(e) => update("width", Number(e.target.value))}
              />
            </label>
            <label>
              Terrace setback <output>{design.setback} m</output>
              <input
                aria-label="Terrace setback"
                type="range"
                min="0"
                max="2"
                disabled={design.blueprint !== "terraces"}
                value={design.setback}
                onChange={(e) => update("setback", Number(e.target.value))}
              />
            </label>
            <label>
              Facade style<select
                aria-label="Facade style"
                value={design.facade}
                onChange={(e) =>
                  update(
                    "facade",
                    e.target.value as CityBuildingDesign["facade"],
                  )}
              >
                <option value="ribbon">Wide ribbon windows</option>
                <option value="grid">Glass grid</option>
                <option value="piers">Brand-coloured piers</option>
              </select>
            </label>
            <label>
              Tile styling<select
                aria-label="Tile styling"
                value={design.tile}
                onChange={(e) =>
                  update("tile", e.target.value as CityBuildingDesign["tile"])}
              >
                <option value="garden">Garden lawn</option>
                <option value="limestone">Warm limestone</option>
                <option value="slate">Slate plaza</option>
              </select>
            </label>
            <label>
              Building orientation<select
                aria-label="Building orientation"
                value={design.rotation}
                onChange={(e) => update("rotation", Number(e.target.value))}
              >
                {[0, 1, 2, 3].map((v) => (
                  <option key={v} value={v}>{v * 90}°</option>
                ))}
              </select>
            </label>
            <label className="city-checkbox">
              <input
                type="checkbox"
                checked={design.landscaping}
                onChange={(e) => update("landscaping", e.target.checked)}
              />Trees and planters
            </label>
          </div>
          <button type="button" onClick={() => onChange({ ...design })}>
            Use this 3D design
          </button>
          <p className="city-studio-note">
            Changes go into your business draft. Save your business details
            below, then submit for review. Choosing 3D replaces the image
            building in the draft; City Value and position stay unchanged.
          </p>
        </div>
      </div>
    </section>
  );
}
