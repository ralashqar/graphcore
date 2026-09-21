import { presetCategory, roofVariants } from "../../domain/cityBuildingArchetypes";
import { frontStructure } from "../../domain/cityBuildingEntrances";
import type { OrbitControls as OrbitControlsHandle } from "three-stdlib";
import {
  Component,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import {
  buildingMasses,
  type CityBuildingDesign,
} from "../../domain/cityBuildingDesign";
import type { CityProfile, CityProperty } from "../../domain/city";
import {
  ARCHITECTURE_LABELS,
  ARCHITECTURES,
  brandPalette,
} from "../../domain/cityBuildingV2";
import {
  applyComposition,
  buildingSlots,
  type CityBuildingDesignV3,
  type ComponentId,
  COMPOSITIONS,
  newDesign,
  normalizeV3,
  resolveCurrent,
  type SlotId,
  upgradeV3,
} from "../../domain/cityBuildingV3";
import { useCityMapLayout } from "./CityMapLayout";
import { CityPreviewEnvironment } from "./CityPreviewEnvironment";
import { CityDesignBuildings } from "./CityDesignBuildings";

function FitCamera({ height }: { height: number }) {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    if (!size.width || !size.height) return;
    camera.zoom = Math.min(size.width, size.height) / Math.max(56, height + 32);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, invalidate, height]);
  return null;
}
function PreviewControls(
  { height, reset, fixed }: { height: number; reset: number; fixed: boolean },
) {
  const { camera, gl, invalidate } = useThree(),
    ref = useRef<OrbitControlsHandle>(null);
  useEffect(() => {
    camera.position.set(36, 36 * 380 / 420 + height * .4, 36);
    ref.current?.target.set(0, height * .4, 0);
    ref.current?.update();
    invalidate();
  }, [camera, reset, height, invalidate]);
  return (
    <OrbitControls
      ref={ref}
      domElement={gl.domElement}
      target={[0, height * .4, 0]}
      enableRotate={!fixed}
      enablePan={false}
      minZoom={3}
      maxZoom={35}
      maxPolarAngle={Math.PI / 2.1}
    />
  );
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
  { design, mini = false, onSlot }: {
    design: CityBuildingDesign;
    mini?: boolean;
    onSlot?: (id: SlotId) => void;
  },
) {
  const resolved = design.version !== 1
    ? resolveCurrent(design, "#547364")
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
        {buildingMasses(
          design.version === 3
            ? { ...design, middleFloors: 0, crown: "none", floors: 1 }
            : { ...design, floors: 1 },
        ).map((m, i) => (
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
        {design.version === 3 && !mini &&
          buildingSlots(design).map((slot) => (
            <rect
              key={slot.id}
              x={slot.position[0] - slot.size[0] / 2}
              y={slot.position[2] - slot.size[2] / 2}
              width={slot.size[0]}
              height={slot.size[2]}
              fill={slot.active ? "#b48640" : "#78917b"}
              fillOpacity=".35"
              stroke={slot.reason ? "#ad594c" : "#496955"}
              strokeWidth=".1"
              role="button"
              tabIndex={0}
              aria-label={`Select ${slot.label}`}
              onClick={() => onSlot?.(slot.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSlot?.(slot.id);
              }}
            />
          ))}
      </g>
    </svg>
  );
}
function SlotHandles(
  { design, onSelect }: {
    design: CityBuildingDesignV3;
    onSelect: (id: SlotId) => void;
  },
) {
  const { plotSize } = useCityMapLayout();
  return (
    <group
      rotation={[0, design.rotation * Math.PI / 2, 0]}
      scale={plotSize / 24}
    >
      {buildingSlots(design).map((slot) => (
        <Html
          key={slot.id}
          position={slot.position}
          center
          zIndexRange={[20, 0]}
        >
          <button
            type="button"
            className="city-slot-handle"
            aria-label={`Select ${slot.label}`}
            title={slot.label}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(slot.id);
            }}
          >
            {slot.active ? "●" : "+"}
          </button>
        </Html>
      ))}
    </group>
  );
}
export function CityBuildingDesigner(
  { profile, onChange, businessId }: {
    businessId?: string;
    profile: CityProfile;
    onChange: (design: CityBuildingDesign) => void;
  },
) {
  const [initial] = useState(() => {
    let id = businessId;
    if (!id) {
      id = sessionStorage.getItem("city-design-draft-seed") ||
        crypto.randomUUID();
      sessionStorage.setItem("city-design-draft-seed", id);
    }
    return newDesign(id);
  });
  const design = profile.buildingDesign || initial;
  const d = design.version === 3 ? design : upgradeV3(design),
    legacy = design.version !== 3;
  const [category, setCategory] = useState("All");
  const [lastPreset, setLastPreset] = useState<number | null>(null);
  const [showSlots, setShowSlots] = useState(false),
    [selectedSlot, setSelectedSlot] = useState<SlotId>("brand.entrance");
  const selectSlot = (id: SlotId) => {
    setSelectedSlot(id);
    setTab(
      id.startsWith("ground.") || id.startsWith("terrace.")
        ? "Grounds"
        : "Branding",
    );
    setShowSlots(true);
  };
  const slots = useMemo(() => buildingSlots(d), [d]);
  const entranceReason = useMemo(() => {
    const base = buildingMasses(d)[0];
    return frontStructure(d.entranceStyle, d.blueprint, base.z + base.depth / 2, base.width, d.groundHeight, d.palette.wall, d.palette.trim).reason;
  }, [d]);
  const selected = slots.find((s) => s.id === selectedSlot)!;
  const setSlot = (id: SlotId, component: ComponentId | null) => {
    const slots = { ...d.slots };
    if (component === "brand") {
      for (
        const k of ["brand.entrance", "brand.facade", "brand.roof"] as const
      ) slots[k] = null;
    }
    slots[id] = component;
    commit({ ...d, slots });
  };
  const [view, setView] = useState<"3d" | "fixed" | "plan">("3d"),
    [cameraKey, setCameraKey] = useState(0),
    [grid, setGrid] = useState(false),
    [tab, setTab] = useState("Presets");
  const [past, setPast] = useState<CityBuildingDesign[]>([]),
    [future, setFuture] = useState<CityBuildingDesign[]>([]);
  const commit = (next: CityBuildingDesign) => {
    setPast((h) => [...h, design].slice(-40));
    setFuture([]);
    onChange(next.version === 3 ? normalizeV3(next) : next);
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
  const update = <K extends keyof CityBuildingDesignV3>(
    key: K,
    value: CityBuildingDesignV3[K],
  ) => {
    if (key === "floors") {
      const n = Number(value), crown = n === 1 ? "none" : d.crown;
      commit({ ...d, crown, middleFloors: n - 1 - (crown === "none" ? 0 : 1) });
      return;
    }
    if (key === "canopy") {
      setSlot("canopy.entrance", value ? "canopy" : null);
      return;
    }
    if (key === "grounds") {
      const component = value === "minimal"
        ? null
        : value === "urban"
        ? "bollards"
        : "planter";
      commit({
        ...d,
        grounds: value as typeof d.grounds,
        slots: {
          ...d.slots,
          "ground.left": component,
          "ground.right": component,
        },
      });
      return;
    }
    commit({ ...d, [key]: value });
  };
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
  const height = design.version !== 1
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
            <button
              type="button"
              disabled={legacy}
              aria-pressed={showSlots}
              onClick={() => setShowSlots(!showSlots)}
            >
              Attachment slots
            </button>
          </div>
          {view === "plan" && <Blueprint design={design} onSlot={selectSlot} />}
          <div
            style={{ display: view === "plan" ? "none" : undefined }}
            className="city-design-canvas"
            data-blueprint={design.blueprint}
            data-version={design.version}
            data-floors={design.floors}
          >
            <DesignBoundary>
              <Canvas
                orthographic
                shadows
                frameloop="demand"
                dpr={[1, 1.5]}
                camera={{
                  position: [36, 36 * 380 / 420 + height * .4, 36],
                  zoom: 15,
                  near: .1,
                  far: 250,
                }}
                gl={{ antialias: true, alpha: true }}
              >
                <CityPreviewEnvironment />
                <FitCamera height={height} />
                {!legacy && showSlots && (
                  <SlotHandles design={d} onSelect={selectSlot} />
                )}
                <CityDesignBuildings properties={properties} />
                {grid && (
                  <gridHelper
                    args={[24, 12, "#64796d", "#b1baaa"]}
                    position={[0, .31, 0]}
                  />
                )}
                <PreviewControls
                  height={height}
                  reset={cameraKey}
                  fixed={view === "fixed"}
                />
              </Canvas>
            </DesignBoundary>
          </div>
          <div className="city-design-caption">
            <strong>{profile.name || "Your business"}</strong>
            <span>
              {design.floors} floors · {design.width} ×{" "}
              {design.version !== 1 ? d.depth : design.width} m
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
                commit(
                  applyComposition(
                    d,
                    lastPreset ?? Math.max(
                      0,
                      COMPOSITIONS.findIndex((p) =>
                        p.patch.blueprint === d.blueprint &&
                        p.patch.architecture === d.architecture
                      ),
                    ),
                  ),
                )}
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
                onClick={() => commit(upgradeV3(design))}
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
            {["Presets", "Branding", "Grounds"].map((t) => (
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
            {tab === "Presets" && (
              <div className="city-art-controls">
                <p className="city-studio-note">Choose a complete building, then fine-tune it below. Presets set the footprint, architecture and grounds; your business identity and colours stay intact.</p>
                <label>Building type<select aria-label="Building type" value={category} onChange={e => setCategory(e.target.value)}>
                  {["All", "Food & Retail", "Workspaces", "Civic", "Hospitality"].map(c => <option key={c}>{c}</option>)}
                </select></label>
                <div className="city-preset-picker">
                  {COMPOSITIONS.map((p, i) => category !== "All" && presetCategory(p.patch.archetype) !== category ? null : (
                    <button
                      type="button"
                      key={p.name}
                      onClick={() => {
                        setLastPreset(i);
                        commit(applyComposition(d, i));
                      }}
                    >
                      <img className="city-preset-render" src={`/city/presets/${p.name.toLowerCase().replaceAll(" ", "-")}.webp`} alt="" loading="lazy" width="360" height="280" />
                      <strong>{p.name}</strong>
                      <small>{p.patch.massing === "hall-wings" ? "Hall and wings" : p.patch.blueprint === "office" ? "Rectangular" : p.patch.blueprint === "terraces" ? "Stepped" : p.patch.blueprint === "courtyard" ? "Courtyard" : "L-shaped"} footprint</small>
                    </button>
                  ))}
                </div>
                <h3>Fine-tune building</h3>
                <p className="city-studio-note">Adjust dimensions and details within this building. To change its shape, choose another preset above.</p>
                <div className="city-art-controls">
                  {ranges("Floors", "floors", 1, 8)}
                  {ranges(
                    "Footprint width",
                    "width",
                    d.blueprint === "office" && d.massing !== "hall-wings" ? 8 : 12,
                    18,
                    d.finish === "procedural" ? 1 : 2,
                  )}
                  {ranges(
                    "Footprint depth",
                    "depth",
                    d.blueprint === "office" && d.massing !== "hall-wings" ? 8 : 10,
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
                <details>
                  <summary>Advanced floor stack</summary>
                  <label>
                    Ground-floor treatment<select
                      aria-label="Ground-floor treatment"
                      value={d.base}
                      onChange={(e) =>
                        update("base", e.target.value as typeof d.base)}
                    >
                      {["storefront", "lobby", "plinth"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Middle floors<input
                      aria-label="Middle floors"
                      type="number"
                      min="0"
                      max={d.crown === "none" ? 7 : 6}
                      value={d.middleFloors}
                      onChange={(e) =>
                        update(
                          "middleFloors",
                          Math.max(
                            0,
                            Math.min(
                              d.crown === "none" ? 7 : 6,
                              Number(e.target.value),
                            ),
                          ),
                        )}
                    />
                  </label>
                  <label>
                    Façade rhythm<select
                      aria-label="Façade rhythm"
                      value={d.rhythm}
                      onChange={(e) =>
                        update("rhythm", e.target.value as typeof d.rhythm)}
                    >
                      {["vertical", "ribbon", "alternating"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Crown<select
                      aria-label="Crown"
                      value={d.crown}
                      onChange={(e) =>
                        commit({
                          ...d,
                          crown: e.target.value as typeof d.crown,
                          middleFloors: Math.min(
                            d.middleFloors,
                            e.target.value === "none" ? 7 : 6,
                          ),
                        })}
                    >
                      {["none", "recessed", "penthouse", "terrace"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Crown setback<input
                      aria-label="Crown setback"
                      type="range"
                      min=".5"
                      max="2"
                      step=".5"
                      value={d.crownSetback}
                      onChange={(e) =>
                        update("crownSetback", Number(e.target.value))}
                    />
                  </label>
                  <p>
                    1 base + {d.middleFloors} middle +{" "}
                    {d.crown === "none" ? 0 : 1} crown = {d.floors} floors
                  </p>
                </details>
                <h3>Façade style</h3>
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
                <label>
                  Quaternius detail set<select aria-label="Quaternius detail set" value={d.detailSet ?? "matching"}
                    onChange={(e) => commit({ ...d, detailSet: e.target.value as typeof d.detailSet, finish: d.finish === "procedural" ? "accents" : d.finish })}>
                    <option value="matching">Match architectural style</option>
                    <option value="brick">Brick and framed windows</option>
                    <option value="white-brick">White brick and light trim</option>
                    <option value="marble">Marble and broad windows</option>
                    <option value="metal">Metal office detailing</option>
                  </select>
                </label>
                <label>
                  Detail placement<select aria-label="Detail placement" value={d.detailScope ?? "all"}
                    onChange={(e) => update("detailScope", e.target.value as typeof d.detailScope)}>
                    <option value="all">Entrance, roofline and facade</option>
                    <option value="entrance">Entrance only</option>
                    <option value="crown">Roofline only</option>
                  </select>
                </label>
                <small>Accents add entrances and trim. Choose Quaternius facade for modular upper walls too. Pitched roofs omit cornices; native pieces retain their proportions.</small>
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
                    value={d.roofVariant && d.roofVariant !== "standard" ? d.roofVariant : d.roof}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (["hip", "shed", "sawtooth"].includes(value)) commit({...d, roofVariant: value as typeof d.roofVariant});
                      else commit({...d, roof: value as typeof d.roof, roofVariant:"standard"});
                    }}
                  >
                    <option value="flat">Flat</option>
                    <option value="parapet">Parapet</option>
                    <option value="planted">Planted terrace</option>
                    <option value="pitched" disabled={d.blueprint !== "office" || d.massing === "hall-wings"}>
                      Pitched (rectangular office only)
                    </option>
                    {roofVariants(d).includes("hip") && <option value="hip">Hip roof</option>}
                    {roofVariants(d).includes("shed") && <option value="shed">Asymmetric shed roof</option>}
                    {roofVariants(d).includes("sawtooth") && <option value="sawtooth">Sawtooth studio roof</option>}
                  </select>
                </label>
                <label>
                  Entrance structure<select aria-label="Entrance structure" value={d.entranceStyle ?? "standard"}
                    onChange={(e) => update("entranceStyle", e.target.value as typeof d.entranceStyle)}>
                    <option value="standard">Standard entrance</option>
                    <option value="wide-canopy">Wide storefront canopy</option>
                    <option value="portico">Columned portico</option>
                    <option value="pediment">Columned portico with gable</option>
                  </select>
                </label>
                {entranceReason && <p role="status">Inactive: {entranceReason}</p>}
                <label className="city-checkbox">
                  <input
                    type="checkbox"
                    checked={d.canopy}
                    onChange={(e) => update("canopy", e.target.checked)}
                  />Entrance canopy
                </label>
                <button
                  type="button"
                  onClick={() =>
                    update("facadeSeed", (d.facadeSeed + 7919) % 1000000)}
                >
                  Vary façade
                </button>
                <small>
                  Façade variation {d.facadeSeed}{" "}
                  · Shape and brand colours stay fixed.
                </small>
              </div>
            )}
            {tab === "Branding" && (
              <div className="city-art-controls">
                <p>
                  Your business logo appears on the selected primary sign. Add
                  or change it in Business details below.
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
                <button
                  type="button"
                  onClick={() =>
                    update("groundsSeed", (d.groundsSeed + 7919) % 1000000)}
                >
                  Vary grounds
                </button>
                <label>
                  Decoration density<select
                    aria-label="Decoration density"
                    value={d.density}
                    onChange={(e) =>
                      update("density", e.target.value as typeof d.density)}
                  >
                    <option value="restrained">Restrained</option>
                    <option value="full">Full</option>
                  </select>
                </label>
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
                    value={d.pavingPattern && d.pavingPattern !== "classic" ? d.pavingPattern : d.tile}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (["garden", "limestone", "slate"].includes(value)) commit({ ...d, tile: value as typeof d.tile, pavingPattern: "classic" });
                      else update("pavingPattern", value as typeof d.pavingPattern);
                    }}
                  >
                    <option value="garden">Garden lawn</option>
                    <option value="limestone">Warm limestone</option>
                    <option value="slate">Slate plaza</option>
                    <option value="checker">Ivory and stone checker</option>
                    <option value="terracotta">Terracotta courtyard</option>
                    <option value="basalt">Basalt paving</option>
                    <option value="ribbon">Limestone ribbon walk</option>
                  </select>
                </label>
                <label>
                  Boundary and entrance<select aria-label="Boundary and entrance" value={d.enclosure ?? "none"}
                    onChange={(e) => update("enclosure", e.target.value as typeof d.enclosure)}>
                    <option value="none">Open plot</option>
                    <option value="garden-wall">Low stone wall and gateposts</option>
                    <option value="brick-court">Brick courtyard and gateposts</option>
                    <option value="open-rail">Low railings and stone entrance</option>
                  </select>
                </label>
                <small>All entrances stay open. Walls and railings rotate with the building, inside the plot boundary.</small>
                <p>
                  Decorations respect the entrance route and plot clearance. The
                  city roads stay as they are.
                </p>
              </div>
            )}
            {(tab === "Branding" || tab === "Grounds") && (
              <div className="city-slot-controls">
                <label>
                  Attachment slot<select
                    aria-label="Attachment slot"
                    value={selectedSlot}
                    onChange={(e) => selectSlot(e.target.value as SlotId)}
                  >
                    {slots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                        {s.selected && !s.active ? " · inactive" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Component<select
                    aria-label="Slot component"
                    value={selected.selected || ""}
                    onChange={(e) =>
                      setSlot(
                        selected.id,
                        e.target.value as ComponentId || null,
                      )}
                  >
                    {!selected.id.startsWith("brand.") && (
                      <option value="">None</option>
                    )}
                    {selected.id.startsWith("brand.") && !selected.selected && (
                      <option value="">Not selected</option>
                    )}
                    {selected.compatible.map((c) => (
                      <option key={c} value={c}>
                        {c === "brand" ? "Primary business sign" : c}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  {selected.size[0].toFixed(1)} × {selected.size[1].toFixed(1)}
                  {" "}
                  × {selected.size[2].toFixed(1)} m clearance
                </p>
                {selected.reason && (
                  <p role="status">
                    Inactive: {selected.reason} Your selection is retained.
                  </p>
                )}
                <button type="button" onClick={() => setShowSlots(true)}>
                  Show slots in preview
                </button>
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
