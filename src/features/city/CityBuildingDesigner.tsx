import { KIT_CORNERS, KIT_ROOFLINES, KIT_ENTRANCES, KIT_FRONTAGES, KIT_ROOFS } from "../../domain/cityArchitecturalKit";
import { NATIVE_FACADES, type NativeFacadeId } from "../../domain/cityNativeFacades";
import { NATIVE_MODULES } from "../../domain/cityNativeModules";
import { CITY_TEXTURES, SELECTABLE_TEXTURE_IDS, displayedTexture } from "../../domain/cityTexturePresets";
import { advertisingLayout, AD_PLACEMENTS, AD_LABELS, DEFAULT_ADVERTISING } from "../../domain/cityAdvertising";
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
import { Canvas, useThree, events } from "@react-three/fiber";

// Thumbnail roots may finish async creation after their tab has unmounted.
function previewEvents(state: Parameters<typeof events>[0]) {
  const manager = events(state);
  const connect = manager.connect;
  return {...manager, connect: (target: HTMLElement) => { if (target) connect?.(target); }};
}
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
  resolveV3,
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
        {design.version === 3 && !mini && advertisingLayout(design, buildingMasses(design), buildingSlots(design)).fits.filter(f=>f.selected && !f.reason).map(f=>(
          <line key={f.id} x1={f.x-Math.cos(f.rotation)*f.width/2} y1={f.z+Math.sin(f.rotation)*f.width/2}
            x2={f.x+Math.cos(f.rotation)*f.width/2} y2={f.z-Math.sin(f.rotation)*f.width/2} stroke="#315b77" strokeWidth=".35"><title>{AD_LABELS[f.id]}</title></line>
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
  const assemblyStatus = useMemo(() => resolveV3(d, profile.color), [d, profile.color]);
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
                events={previewEvents}
                orthographic
                shadows={false}
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
            {["Presets", "Advertising", "Branding", "Grounds"].map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                onClick={() => { setTab(t); if (t === "Advertising") setView("fixed"); }}
              >
                {t}
              </button>
            ))}
          </div>
          <fieldset className="city-design-fields" disabled={legacy}>
            {tab === "Presets" && (
              <div className="city-art-controls">
                <p className="city-studio-note">Choose a complete building, then fine-tune it below. Presets set the footprint, architecture and grounds; your business identity and colours stay intact.</p>
                <button type="button" onClick={()=>{const library=document.getElementById("city-native-facade-library");library?.scrollIntoView({block:"center"});library?.focus({preventScroll:true});}}>Browse {NATIVE_FACADES.length} Quaternius façade blocks</button>
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
                  Façade library — {NATIVE_FACADES.length} source modules<select id="city-native-facade-library" aria-label="Quaternius facade module" value={d.nativeFacade ?? "automatic"}
                    onChange={e=>commit({...d,nativeFacade:e.target.value as NativeFacadeId,finish:"facade"})}>
                    <option value="automatic">Automatic - prefer framed and recessed modules</option>
                    {(["brick","creative","boutique","glass"] as const).map(family=><optgroup key={family} label={ARCHITECTURE_LABELS[family]}>
                      {NATIVE_FACADES.filter(p=>p.family===family).map(p=><option key={p.id} value={p.id}>{p.label} — {p.asset}</option>)}
                    </optgroup>)}
                  </select>
                </label>
                <details open>
                  <summary>Browse all {NATIVE_FACADES.length} façade blocks</summary>
                  <div className="city-preset-picker" role="group" aria-label="Quaternius source modules">
                    {NATIVE_FACADES.map(module=><button type="button" key={module.id} aria-pressed={d.nativeFacade===module.id}
                      onClick={()=>commit({...d,nativeFacade:module.id,finish:"facade"})}>
                      <strong>{module.label}</strong><small>{module.asset}</small><small>{module.relief}</small>
                    </button>)}
                  </div>
                </details>
                <small>Choose the actual source window or wall block here. Selecting a module enables Quaternius façade mode. Recessed, arched, bay and shopfront options are independent of the building preset.</small>
                <label>
                  Automatic family preset<select aria-label="Quaternius detail set" value={d.detailSet ?? "matching"}
                    onChange={(e) => commit({ ...d, detailSet: e.target.value as typeof d.detailSet, nativeFacade: "automatic", finish: d.finish === "procedural" ? "accents" : d.finish })}>
                    <option value="matching">Match architectural style</option>
                    <option value="brick">Brick and framed windows</option>
                    <option value="white-brick">White brick and light trim</option>
                    <option value="marble">Marble and broad windows</option>
                    <option value="metal">Metal office detailing</option>
                  </select>
                </label>

                <small>Choosing a family preset resets the module to Automatic. Choose a source block above for a specific façade.</small>
                {NATIVE_FACADES.filter(p=>p.id===d.nativeFacade).map(p=><small key={p.id}>
                  {p.relief}. Native module {NATIVE_MODULES[p.asset].span.toFixed(1)} x {NATIVE_MODULES[p.asset].height.toFixed(1)} m, {NATIVE_MODULES[p.asset].depth.toFixed(2)} m model depth. Frames keep their proportions; exposed panel edges receive inward returns.
                </small>)}
                <fieldset>
                  <legend>Architectural assemblies</legend>
                  <small>Coordinated Quaternius parts with measured connections. Existing preserves your current design.</small>
                  {([
                    ["corners", "Corner assemblies", KIT_CORNERS, ["No extra corner columns", "Solid matching corner columns"]],
                    ["roofline", "Connected roofline", KIT_ROOFLINES, ["Existing trim", "Restrained metal edge", "Classical masonry cornice", "Industrial metal cornice"]],
                    ["entrance", "Entrance assembly", KIT_ENTRANCES, ["Existing entrance", "Wood frame / Door 2", "Metal-brick frame / Door 3", "Grand marble / Door 4", "Grand concrete / Door 3"]],
                    ["frontage", "Storefront assembly", KIT_FRONTAGES, ["Existing frontage", "Cafe / recessed bays and awning", "Boutique / broad display glazing", "Department store / long canopy"]],
                    ["roof", "Native roof assembly", KIT_ROOFS, ["Existing roof", "Slate perimeter roof", "Slate roof with dormers"]],
                  ] as const).map(([key,label,values,labels])=><label key={key}>{label}<select aria-label={label} value={d.architecturalKit?.[key] ?? "existing"}
                    onChange={e=>commit({...d,architecturalKit:{...d.architecturalKit,[key]:e.target.value},finish:key==="frontage"?"facade":d.finish==="procedural"?"accents":d.finish,...(key==="frontage"&&e.target.value!=="existing"?{base:"storefront" as const}: {})})}>
                    {values.map((value,index)=><option key={value} value={value}>{labels[index]}</option>)}
                  </select></label>)}
                  <label><input type="checkbox" checked={d.architecturalKit?.entranceSteps ?? !!d.architecturalKit?.entrance?.startsWith("grand-")} onChange={e=>commit({...d,architecturalKit:{...d.architecturalKit,entranceSteps:e.target.checked}})}/>Entrance steps (native entrance presets)</label>
                  {([["connectedPlanters","Connected planter runs"],["stairRails","Matching side-stair railings"],["ornaments","Restrained facade ornaments"],["rooftopUnits","Small rooftop AC unit"]] as const).map(([key,label])=><label key={key}>
                    <input type="checkbox" checked={!!d.architecturalKit?.[key]} onChange={e=>commit({...d,architecturalKit:{...d.architecturalKit,[key]:e.target.checked},finish:d.finish==="procedural"?"accents":d.finish})}/>{label}
                  </label>)}
                  <small>Details appear close up; structural roof and frontage remain at medium distance. Unsupported slate roofs keep the ordinary roof and retain your selection. Side-stair railings require a fitted side-stair extension. AC units fit flat, clear roofs only.</small>
                  {assemblyStatus.kitNotes.map(note=><small key={note}>{note}</small>)}
                </fieldset>
                <label>
                  Accent placement<select aria-label="Detail placement" value={d.detailScope ?? "all"}
                    onChange={(e) => update("detailScope", e.target.value as typeof d.detailScope)}>
                    <option value="all">Entrance and roofline</option>
                    <option value="entrance">Entrance only</option>
                    <option value="crown">Roofline only</option>
                  </select>
                </label>
                <label><input type="checkbox" checked={!!d.solidSideWalls} onChange={e=>commit({...d,solidSideWalls:e.target.checked,finish:e.target.checked?"facade":d.finish})}/>Solid side walls with native panels</label>
                <label>Side stairs<select aria-label="Side stairs" value={d.stairExtension || "none"} onChange={e=>commit({...d,stairExtension:e.target.value as typeof d.stairExtension,finish:d.finish==="procedural"?"accents":d.finish})}>
                  <option value="none">None</option><option value="fire-escape">Multi-storey apartment fire escape</option><option value="concrete">Concrete steps and landing</option><option value="marble">Marble steps and landing</option>
                </select></label>
                {d.stairExtension && d.stairExtension!=="none" && <small>{assemblyStatus.extensionReason || (d.stairExtension === "fire-escape" ? "The stair side is flattened across storeys. Other setbacks remain; switching stairs off restores your original shape." : "Decorative side access. Placement preserves the entrance, signs and plot boundary.")}</small>}
                <small>Accents add entrances with solid architectural trim. Façade mode builds a native panel shell with connected corners, floor tiles and door openings; accent placement does not limit structural coverage. Windows retain uniform proportions; plain infill panels fit the remaining spans. Unsupported roof shapes retain generated geometry.</small>
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
            {tab === "Advertising" && (
              <div className="city-art-controls">
                <h3>Advertising placements</h3>
                <p>Choose up to two framed adverts on the faces visible from the fixed city camera. Preview artwork only; business media is not connected yet.</p>
                <button type="button" onClick={() => setView("fixed")}>Preview from city camera</button>
                {AD_PLACEMENTS.map(id => {
                  const ad = d.advertising || DEFAULT_ADVERTISING;
                  const fit = advertisingLayout(d, buildingMasses(d), slots).fits.find(f => f.id === id)!;
                  return <label key={id} className="city-ad-choice">
                    <span><input type="checkbox" aria-label={AD_LABELS[id]} checked={ad.placements.includes(id)}
                      disabled={!ad.placements.includes(id) && ad.placements.length >= 2}
                      onChange={e => commit({...d,advertising:{...ad,placements:e.target.checked?[...ad.placements,id]:ad.placements.filter(p=>p!==id)}})} /> {AD_LABELS[id]}</span>
                    <small>{fit.reason ? `Unavailable: ${fit.reason} Selection is retained.` : `${fit.width.toFixed(1)} × ${fit.height.toFixed(1)} m fitted frame`}</small>
                  </label>;
                })}
                <label>Advert width<input aria-label="Advert width" type="range" min="3" max="18" step=".5" value={(d.advertising || DEFAULT_ADVERTISING).width}
                  onChange={e=>commit({...d,advertising:{...(d.advertising||DEFAULT_ADVERTISING),width:Number(e.target.value)}})} />{(d.advertising||DEFAULT_ADVERTISING).width} m requested</label>
                <label>Advert height<input aria-label="Advert height" type="range" min="2" max="24" step=".5" value={(d.advertising || DEFAULT_ADVERTISING).height}
                  onChange={e=>commit({...d,advertising:{...(d.advertising||DEFAULT_ADVERTISING),height:Number(e.target.value)}})} />{(d.advertising||DEFAULT_ADVERTISING).height} m requested</label>
                <label>Placeholder artwork<select aria-label="Placeholder artwork" value={(d.advertising||DEFAULT_ADVERTISING).style}
                  onChange={e=>commit({...d,advertising:{...(d.advertising||DEFAULT_ADVERTISING),style:e.target.value as "image"|"text"}})}>
                  <option value="image">Image layout</option><option value="text">Text campaign</option>
                </select></label>
                <small>Frames shrink to fit their supporting face. Ground-floor entrances and the central gate opening remain clear. Rotate the building freely: placements remain on the two city-facing sides.</small>
              </div>
            )}
            {tab === "Branding" && (
              <div className="city-art-controls">
                <p>
                  Your business logo appears on the selected primary sign. Add
                  or change it in Business details below.
                </p>
                {d.version === 3 && <fieldset><legend>Surface textures</legend>
                  <p>Tileable CC0 materials. Textures use their natural colours; choose Original / palette to keep Quaternius materials or procedural palette colours.</p>
                  {(["wall","roof","ground"] as const).map(role=><label key={role}>{role} texture
                    <select aria-label={`${role} texture`} value={displayedTexture(d.textures?.[role]) || "none"} onChange={e=>commit({...d,textures:{...d.textures,[role]:e.target.value}})}>
                      {SELECTABLE_TEXTURE_IDS.map(id=><option key={id} value={id}>{id === "none" ? "Original / palette" : CITY_TEXTURES[id].label}</option>)}
                    </select>
                    {d.textures?.[role] && d.textures[role]!=="none" && <img alt={`${role} texture sample`} width={72} height={72} src={`/city/textures/${CITY_TEXTURES[d.textures[role]!].asset}-Color.webp`}/>}
                  </label>)}
                  {(["wallBorder", "groundBorder"] as const).map(role=><label key={role}>{role === "wallBorder" ? "Façade border" : "Ground border"} texture
                    <select aria-label={`${role} texture`} value={displayedTexture(d.textures?.[role]) || "primary"} onChange={e=>commit({...d,textures:{...d.textures,[role]:e.target.value}})}>
                      <option value="primary">Use primary</option>
                      {SELECTABLE_TEXTURE_IDS.map(id=><option key={id} value={id}>{id === "none" ? "Original / palette" : CITY_TEXTURES[id].label}</option>)}
                    </select>
                  </label>)}
                </fieldset>}
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
                    value={d.pavingPattern && d.pavingPattern !== "classic" && d.pavingPattern !== "checker" ? d.pavingPattern : d.tile}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (["garden", "limestone", "slate"].includes(value)) commit({ ...d, tile: value as typeof d.tile, pavingPattern: "classic" });
                      else update("pavingPattern", value as typeof d.pavingPattern);
                    }}
                  >
                    <option value="garden">Garden lawn</option>
                    <option value="limestone">Warm limestone</option>
                    <option value="slate">Slate plaza</option>
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
