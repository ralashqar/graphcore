import { Component, type ReactNode, useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  BUILDING_PRESETS,
  buildingMasses,
  type CityBuildingDesign,
} from "../../domain/cityBuildingDesign";
import type { CityProfile, CityProperty } from "../../domain/city";
import {
  ARCHITECTURE_LABELS,
  ARCHITECTURES,
  brandPalette,
  type CityBuildingDesignV2,
  DEFAULT_DESIGN_V2,
  normalizeDesign,
  resolveDesign,
  upgradeDesign,
} from "../../domain/cityBuildingV2";
import { CityDesignBuildings } from "./CityDesignBuildings";

function FitCamera({ height }: { height: number }) {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    camera.zoom = Math.min(size.width, size.height) / Math.max(43, height + 24);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, invalidate, height]);
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
function Blueprint(
  { design, mini = false }: { design: CityBuildingDesign; mini?: boolean },
) {
  const resolved = design.version === 2
    ? resolveDesign(design, "#547364")
    : null;
  return (
    <svg
      className={mini ? "city-preset-thumb" : "city-design-blueprint"}
      viewBox="-13 -13 26 26"
      role="img"
      aria-hidden={mini || undefined}
      aria-label={mini ? undefined : `${design.blueprint} footprint blueprint`}
    >
      <rect
        x="-12"
        y="-12"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth=".12"
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
        {resolved && !mini && (
          <rect
            x="-1.6"
            y={resolved.entrance.z}
            width="3.2"
            height={11.4 - resolved.entrance.z}
            fill="#c8b987"
            fillOpacity=".6"
          />
        )}
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
            strokeWidth=".12"
          />
        ))}
        {resolved && !mini &&
          resolved.masses.filter((m) => m.y === resolved.masses.at(-1)!.y).map((
            m,
            i,
          ) => (
            <rect
              key={"top" + i}
              x={m.x - m.width / 2}
              y={m.z - m.depth / 2}
              width={m.width}
              height={m.depth}
              fill="none"
              stroke="#956b3a"
              strokeWidth=".12"
              strokeDasharray=".3 .2"
            />
          ))}
        {resolved && !mini &&
          resolved.attachments.filter((a) => a.role !== "facade").map((
            a,
            i,
          ) => (
            <circle
              key={i}
              cx={a.position[0]}
              cy={a.position[2]}
              r=".18"
              fill="#907249"
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
  const design = profile.buildingDesign || DEFAULT_DESIGN_V2;
  const d = design.version === 2 ? design : upgradeDesign(design),
    legacy = design.version === 1;
  const [view, setView] = useState<"3d" | "fixed" | "plan">("3d"),
    [cameraKey, setCameraKey] = useState(0),
    [grid, setGrid] = useState(false),
    [tab, setTab] = useState("Shape");
  const [past, setPast] = useState<CityBuildingDesign[]>([]),
    [future, setFuture] = useState<CityBuildingDesign[]>([]);
  const commit = (next: CityBuildingDesign) => {
    setPast((h) => [...h, design].slice(-40));
    setFuture([]);
    onChange(next.version === 2 ? normalizeDesign(next) : next);
  };
  const undo = () => {
    const previous = past.at(-1);
    if (previous) {
      setFuture((h) => [design, ...h]);
      setPast((h) => h.slice(0, -1));
      onChange(previous);
    }
  };
  const redo = () => {
    if (future[0]) {
      setPast((h) => [...h, design]);
      onChange(future[0]);
      setFuture((h) => h.slice(1));
    }
  };
  const update = <K extends keyof CityBuildingDesignV2>(
    key: K,
    value: CityBuildingDesignV2[K],
  ) => commit({ ...d, [key]: value });
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
  const height = design.version === 2
    ? design.groundHeight + (design.floors - 1) * 3
    : design.floors * 2.25;
  const ranges = (
    label: string,
    key: "floors" | "width" | "depth" | "setback" | "groundHeight",
    min: number,
    max: number,
    step = 1,
  ) => (
    <label>
      {label}
      <output>{d[key]}</output>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={d[key]}
        onChange={(e) => update(key, Number(e.target.value))}
      />
    </label>
  );
  const chooseView = (v: typeof view) => {
    setView(v);
    setCameraKey((k) => k + 1);
  };
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
        <p>
          Choose a silhouette. Give it an architectural character. Make it
          yours.
        </p>
      </div>
      <div className="city-building-workbench">
        <div className="city-studio-stage">
          <div className="city-studio-toolbar">
            <button
              type="button"
              aria-pressed={view === "3d"}
              onClick={() => chooseView("3d")}
            >
              3D view
            </button>
            <button
              type="button"
              aria-pressed={view === "fixed"}
              onClick={() => chooseView("fixed")}
            >
              City camera
            </button>
            <button
              type="button"
              aria-pressed={view === "plan"}
              onClick={() => chooseView("plan")}
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
              data-version={design.version}
              data-floors={design.floors}
            >
              <DesignBoundary>
                <Canvas
                  key={cameraKey}
                  orthographic
                  frameloop="demand"
                  dpr={[1, 1.5]}
                  camera={{
                    position: [36, 36 * 380 / 420 + height * .4, 36],
                    zoom: 15,
                    near: .1,
                    far: 250,
                  }}
                  gl={{ antialias: true }}
                >
                  <color attach="background" args={["#e8e5da"]} />
                  <ambientLight intensity={1.6} />
                  <directionalLight position={[10, 30, 20]} intensity={2} />
                  <FitCamera height={height} />
                  <CityDesignBuildings properties={properties} />
                  {grid && (
                    <gridHelper
                      args={[24, 12, "#64796d", "#b1baaa"]}
                      position={[0, .31, 0]}
                    />
                  )}
                  <OrbitControls
                    target={[0, height * .4, 0]}
                    enableRotate={view !== "fixed"}
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
              {design.floors} floors · {design.width} ×{" "}
              {design.version === 2 ? d.depth : design.width} m
            </span>
          </div>
          <p className="city-studio-note">
            {view === "plan"
              ? "Solid: footprint · Dashed: upper floor / plot clearance · Gold: entry route and attachment points."
              : "Drag to orbit · Scroll or pinch to zoom. The city uses this same design."}
          </p>
          <div className="city-studio-toolbar">
            <button type="button" disabled={!past.length} onClick={undo}>
              Undo
            </button>
            <button type="button" disabled={!future.length} onClick={redo}>
              Redo
            </button>
            <button
              type="button"
              disabled={legacy}
              onClick={() =>
                commit(upgradeDesign(
                  BUILDING_PRESETS.find((p) =>
                    p.design.blueprint === d.blueprint
                  )!.design,
                ))}
            >
              Reset to preset
            </button>
          </div>
        </div>
        <div className="city-studio-settings">
          {legacy && (
            <div className="city-design-upgrade">
              <p>
                This is a version-1 design. It stays unchanged until you
                upgrade.
              </p>
              <button
                type="button"
                onClick={() => commit(upgradeDesign(design))}
              >
                Upgrade design
              </button>
            </div>
          )}
          <div
            className="city-design-tabs"
            role="group"
            aria-label="Design controls"
          >
            {["Shape", "Architecture", "Branding", "Grounds"].map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <fieldset className="city-design-fields" disabled={legacy}>
            {tab === "Shape" && (
              <>
                <div className="city-preset-picker">
                  {BUILDING_PRESETS.map((p) => (
                    <button
                      type="button"
                      key={p.name}
                      aria-pressed={d.blueprint === p.design.blueprint}
                      onClick={() =>
                        commit({
                          ...d,
                          blueprint: p.design.blueprint,
                          floors: p.design.floors,
                        })}
                    >
                      <Blueprint
                        design={{ ...d, blueprint: p.design.blueprint }}
                        mini
                      />
                      <strong>{p.name}</strong>
                      <small>{p.description}</small>
                    </button>
                  ))}
                </div>
                <div className="city-art-controls">
                  {ranges("Floors", "floors", 1, 8)}
                  {ranges(
                    "Footprint width",
                    "width",
                    12,
                    18,
                    d.finish === "procedural" ? 1 : 2,
                  )}
                  {ranges(
                    "Footprint depth",
                    "depth",
                    10,
                    18,
                    d.finish === "procedural" ? 1 : 2,
                  )}
                  <label className="city-checkbox">
                    <input
                      type="checkbox"
                      checked={d.podium}
                      onChange={(e) => update("podium", e.target.checked)}
                    />Wider ground-floor podium
                  </label>
                  <details>
                    <summary>Advanced dimensions</summary>
                    {ranges("Ground floor height", "groundHeight", 3, 4.5, .3)}
                    {ranges("Terrace setback", "setback", 0, 2)}
                    <label>
                      Building orientation<select
                        aria-label="Building orientation"
                        value={d.rotation}
                        onChange={(e) =>
                          update("rotation", Number(e.target.value))}
                      >
                        {[0, 1, 2, 3].map((v) => (
                          <option key={v} value={v}>{v * 90}°</option>
                        ))}
                      </select>
                    </label>
                  </details>
                </div>
              </>
            )}
            {tab === "Architecture" && (
              <div className="city-art-controls">
                <div className="city-style-picker">
                  {ARCHITECTURES.map((a) => (
                    <button
                      type="button"
                      key={a}
                      aria-pressed={d.architecture === a}
                      onClick={() =>
                        commit({
                          ...d,
                          architecture: a,
                          palette: {
                            ...d.palette,
                            wall: a === "brick"
                              ? "#ab7863"
                              : a === "boutique"
                              ? "#e2d4b9"
                              : a === "creative"
                              ? "#dce0d1"
                              : "#d7d7cb",
                          },
                        })}
                    >
                      <span className={"city-facade-swatch city-facade-" + a} />
                      {ARCHITECTURE_LABELS[a]}
                    </button>
                  ))}
                </div>
                <label>
                  Building finish<select
                    aria-label="Building finish"
                    value={d.finish}
                    onChange={(e) =>
                      update("finish", e.target.value as typeof d.finish)}
                  >
                    <option value="procedural">Clean procedural</option>
                    <option value="accents">Quaternius accents</option>
                    <option value="facade">Quaternius façade</option>
                  </select>
                </label>
                {d.finish !== "procedural" && (
                  <small>
                    Whole modules, uniform scale. Footprint snaps to 2 m
                    increments; plain wall fills remaining space. Procedural
                    fallback stays visible while assets load.
                  </small>
                )}
                <label>
                  Roof style<select
                    aria-label="Roof style"
                    value={d.roof}
                    onChange={(e) =>
                      update("roof", e.target.value as typeof d.roof)}
                  >
                    <option value="flat">Flat</option>
                    <option value="parapet">Parapet</option>
                    <option value="planted">Planted terrace</option>
                    <option value="pitched" disabled={d.blueprint !== "office"}>
                      Pitched (rectangular office only)
                    </option>
                  </select>
                </label>
                <label className="city-checkbox">
                  <input
                    type="checkbox"
                    checked={d.canopy}
                    onChange={(e) => update("canopy", e.target.checked)}
                  />Entrance canopy
                </label>
                <button
                  type="button"
                  onClick={() => update("seed", (d.seed + 7919) % 1000000)}
                >
                  Try another variation
                </button>
                <small>
                  Variation {d.seed} · Shape and brand colours stay fixed.
                </small>
              </div>
            )}
            {tab === "Branding" && (
              <div className="city-art-controls">
                <p>
                  Your business logo appears on the integrated entrance sign.
                  Add or change it in Business details below.
                </p>
                {(["wall", "trim", "glass", "roof"] as const).map((k) => (
                  <label key={k}>
                    {k[0].toUpperCase() + k.slice(1)} colour<input
                      aria-label={`${k} colour`}
                      type="color"
                      value={d.palette[k]}
                      onChange={(e) =>
                        update("palette", {
                          ...d.palette,
                          [k]: e.target.value,
                        })}
                    />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => update("palette", brandPalette(profile.color))}
                >
                  Use brand palette
                </button>
              </div>
            )}
            {tab === "Grounds" && (
              <div className="city-art-controls">
                <label>
                  Plot decoration<select
                    aria-label="Plot decoration"
                    value={d.grounds}
                    onChange={(e) =>
                      update("grounds", e.target.value as typeof d.grounds)}
                  >
                    <option value="minimal">Minimal</option>
                    <option value="planted">Planted</option>
                    <option value="urban">Urban forecourt</option>
                  </select>
                </label>
                <label>
                  Tile styling<select
                    aria-label="Tile styling"
                    value={d.tile}
                    onChange={(e) =>
                      update("tile", e.target.value as typeof d.tile)}
                  >
                    <option value="garden">Garden lawn</option>
                    <option value="limestone">Warm limestone</option>
                    <option value="slate">Slate plaza</option>
                  </select>
                </label>
                <p>
                  Decorations respect the entrance route and plot clearance. The
                  city roads stay as they are.
                </p>
              </div>
            )}
          </fieldset>
          <button type="button" disabled={legacy} onClick={() => commit(d)}>
            Use this 3D design
          </button>
          <p className="city-studio-note">
            Save your business details below, then submit for review. Choosing a
            design replaces image artwork in the draft; City Value and position
            stay unchanged.
          </p>
        </div>
      </div>
    </section>
  );
}
