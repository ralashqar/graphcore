import {officeMasses,officeSlots,resolveOffice,type OfficeArchitecture} from "./cityOfficeArchitecture.ts";
import {modularMasses,resolveModularBuilding} from './cityModularBuilding.ts';
import type {ModularBuilding} from './cityVariationTypes.ts';
import type {StudioResolved} from './cityStudioTypes.ts';
import {assembleSynarcKit,type KitAssembly,type SynarcKitChoice} from "./citySynarcKit.ts";
import {connectedRoof,connectedPorch,type ConnectedArchitecture,type AssemblyEnvelope} from "./cityConnectedArchitecture.ts";
import {proceduralEntrance,type DoorFamily,type DoorSurround} from "./cityProceduralEntrances.ts";
import { spiralStair, straightStair } from "./citySpiralStair.ts";
import { windowDetails, type WindowFamily } from "./cityWindowFamilies.ts";
import { joinedWallRange } from "./cityConnectedShell.ts";
import { fireEscape, flattenEscapeSide, type EscapeBounds } from "./cityFireEscape.ts";
import { attachmentBounds, architecturalDetails, kitEntrance, kitRoofReason, type ArchitecturalKit } from "./cityArchitecturalKit.ts";
import { KIT_DIMENSIONS } from "./cityKitDimensions.ts";
import { nativeFacadeChoice, type NativeFacadeId } from "./cityNativeFacades.ts";
import { NATIVE_MODULES } from "./cityNativeModules.ts";
import { partitionNativeWall } from "./cityNativeShell.ts";
import type { CityTextureChoices } from "./cityTexturePresets.ts";
import { advertisingLayout, type Advertising, type AdPlacement } from "./cityAdvertising.ts";
import { archetypeParts, roofVariants, type ArchetypeChoices } from "./cityBuildingArchetypes.ts";
import { frontStructure, ENTRANCE_STYLES } from "./cityBuildingEntrances.ts";
import { groundsParts, type GroundsChoices } from "./cityBuildingGrounds.ts";
import type {
  BuildingMass,
  CityBuildingDesignV1,
} from "./cityBuildingDesign.ts";
import {
  type Attachment,
  type CityBuildingDesignV2,
  DEFAULT_DESIGN_V2,
  type DesignPart,
  exposedWalls,
  fitBays,
  massesV2,
  normalizeDesign,
  type ResolvedDesign,
  resolveDesign,
  upgradeDesign,
} from "./cityBuildingV2.ts";
export const SLOT_IDS = [
  "brand.entrance",
  "brand.facade",
  "brand.roof",
  "campaign.side",
  "canopy.entrance",
  "ground.left",
  "ground.right",
  "terrace.left",
  "terrace.right",
] as const;
export type SlotId = typeof SLOT_IDS[number];
export const COMPONENTS = [
  "brand",
  "campaign",
  "canopy",
  "planter",
  "bollards",
] as const;
export type ComponentId = typeof COMPONENTS[number];
export type CityBuildingDesignV3 = Omit<CityBuildingDesignV2, "version"> & GroundsChoices & ArchetypeChoices & {
  modular?:ModularBuilding;
  upperHeight?:number;
  synarcKit?:SynarcKitChoice;
  officeArchitecture?: OfficeArchitecture;
  connectedArchitecture?: ConnectedArchitecture;
  architecturalKit?: ArchitecturalKit;
  doorFamily?: DoorFamily;
  doorSurround?: DoorSurround;
  doorTransom?: boolean;
  windowFamily?: WindowFamily;
  nativeFacade?: NativeFacadeId;
  textures?: CityTextureChoices;
  solidSideWalls?: boolean;
  stairExtension?: "none" | "concrete" | "marble" | "fire-escape" | "spiral" | "straight";
  advertising?: Advertising;
  version: 3;
  generatorRevision: "city-grammar-1" | "city-shell-2" | "city-connected-3" | "city-office-4" | "city-variation-5";
  entranceStyle?: typeof ENTRANCE_STYLES[number];
  base: "storefront" | "lobby" | "plinth" | "residential";
  middleFloors: number;
  rhythm: "vertical" | "ribbon" | "alternating";
  crown: "none" | "recessed" | "penthouse" | "terrace";
  crownSetback: number;
  facadeSeed: number;
  groundsSeed: number;
  density: "restrained" | "full";
  slots: Partial<Record<SlotId, ComponentId | null>>;
};
export type Slot = {
  id: SlotId;
  label: string;
  position: [number, number, number];
  size: [number, number, number];
  rotation: number;
  compatible: ComponentId[];
  selected: ComponentId | null;
  active: boolean;
  reason: string | null;
};
export type DesignSign = ResolvedDesign["sign"] & {
  rotation: number;
  campaign: boolean;
  advertisement?: AdPlacement;
  placeholder?: "image" | "text";
};
export type Corner = {
  x: number;
  z: number;
  y: number;
  height: number;
  kind: "convex" | "concave" | "end";
};
export type ResolvedV3 = ResolvedDesign & {
  studioAssembly?:StudioResolved;
  synarcKitAssembly?:KitAssembly;
  roofContours?:[number,number][][];
  assemblyEnvelopes?:AssemblyEnvelope[];
  kitNotes: string[];
  extensionReason: string | null;
  slots: Slot[];
  signs: DesignSign[];
  corners: Corner[];
};
export function identitySeed(id: string) {
  let n = 2166136261;
  for (const c of id) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return (n >>> 0) % 1000000;
}
export function newDesign(id: string): CityBuildingDesignV3 {
  const seed = identitySeed(id);
  return {
    ...DEFAULT_DESIGN_V2,
    version: 3,
    generatorRevision: "city-shell-2",
    nativeFacade: "automatic",
    base: "lobby",
    middleFloors: 2,
    rhythm: "vertical",
    crown: "recessed",
    crownSetback: 1,
    facadeSeed: seed,
    groundsSeed: identitySeed(id + ":grounds"),
    seed,
    density: "restrained",
    slots: {
      "brand.entrance": "brand",
      "canopy.entrance": "canopy",
      "ground.left": "planter",
      "ground.right": "planter",
    },
  };
}
export function upgradeV3(
  d: CityBuildingDesignV1 | CityBuildingDesignV2,
): CityBuildingDesignV3 {
  const v = d.version === 1 ? upgradeDesign(d) : d;
  return normalizeV3({
    ...newDesign(String(v.seed)),
    ...v,
    version: 3,
    middleFloors: v.floors - 1,
    crown: "none",
    facadeSeed: v.seed,
    groundsSeed: v.seed,
    slots: {
      "brand.entrance": "brand",
      "canopy.entrance": v.canopy ? "canopy" : null,
      "ground.left": v.grounds === "minimal"
        ? null
        : v.grounds === "urban"
        ? "bollards"
        : "planter",
      "ground.right": v.grounds === "minimal"
        ? null
        : v.grounds === "urban"
        ? "bollards"
        : "planter",
    },
  });
}
export function normalizeV3(d: CityBuildingDesignV3): CityBuildingDesignV3 {
  if(d.generatorRevision==='city-variation-5'&&d.modular){const volumes=d.modular.recipe.volumes,floors=Math.max(1,...volumes.filter(v=>v.operation==='add').map(v=>v.startFloor+v.spanFloors));return {...d,floors,middleFloors:floors-1,crown:'none',finish:'procedural',groundHeight:Math.max(3,Math.min(4.5,d.groundHeight)),upperHeight:Math.max(3,Math.min(4.5,d.upperHeight??3))};}
  if(d.modular){d={...d};delete d.modular;delete d.upperHeight;}
  const middleFloors=d.stairExtension==="fire-escape" && d.crown==="none" ? Math.max(1,d.middleFloors) : d.middleFloors;
  return {
    ...d,
    ...normalizeDesign({ ...d, version: 2 }),
    version: 3,
    width: Math.max(d.blueprint === "office" && d.massing !== "hall-wings" ? 8 : 12, d.finish === "procedural" ? d.width : Math.round(d.width / 2) * 2),
    depth: Math.max(d.blueprint === "office" && d.massing !== "hall-wings" ? 8 : 10, d.finish === "procedural" ? d.depth : Math.round(d.depth / 2) * 2),
    ...(d.generatorRevision === "city-connected-3" ? {roof:d.roof}:{}),
    middleFloors,
    floors: 1 + middleFloors + (d.crown === "none" ? 0 : 1),
    canopy: d.slots["canopy.entrance"] === "canopy",
    ...(d.roofVariant && !roofVariants(d).includes(d.roofVariant) ? {roofVariant:"standard" as const} : {}),
    ...(d.generatorRevision !== "city-connected-3" && d.massing === "hall-wings" && d.roof === "pitched" ? {roof:"parapet" as const} : {}),
  };
}
export const COMPOSITIONS: {
  name: string;
  patch: Partial<CityBuildingDesignV3>;
}[] = [
  {
    name: "Retail flagship",
    patch: {
      archetype: "shop",
      blueprint: "office",
      base: "storefront",
      middleFloors: 1,
      crown: "none",
      architecture: "boutique",
      rhythm: "vertical",
      roof: "parapet",
      grounds: "urban",
    },
  },
  {
    name: "Glass headquarters",
    patch: { windowFamily: "picture",
      blueprint: "office",
      base: "lobby",
      middleFloors: 4,
      crown: "penthouse",
      architecture: "glass",
      rhythm: "ribbon",
      roof: "flat",
    },
  },
  {
    name: "Brick creative studio",
    patch: { windowFamily: "arched",
      blueprint: "office",
      base: "storefront",
      middleFloors: 2,
      crown: "none",
      architecture: "brick",
      rhythm: "alternating",
      roof: "pitched",
    },
  },
  {
    name: "Stepped garden office",
    patch: {
      blueprint: "terraces",
      base: "lobby",
      middleFloors: 3,
      crown: "terrace",
      architecture: "creative",
      rhythm: "vertical",
      roof: "planted",
    },
  },
  {
    name: "Courtyard workspace",
    patch: { windowFamily: "sash",
      blueprint: "courtyard",
      base: "lobby",
      middleFloors: 2,
      crown: "recessed",
      architecture: "brick",
      rhythm: "vertical",
      roof: "planted",
    },
  },
  {
    name: "Corner showroom",
    patch: {
      archetype: "shop",
      blueprint: "l-shape",
      base: "storefront",
      middleFloors: 1,
      crown: "penthouse",
      architecture: "boutique",
      rhythm: "alternating",
      roof: "parapet",
    },
  },
  { name: "Terrace cafe", patch: { archetype: "cafe", roofVariant: "shed", blueprint: "office", width: 12, depth: 10, middleFloors: 0, crown: "none", podium: false, base: "storefront", architecture: "boutique", roof: "flat", entranceStyle: "wide-canopy", pavingPattern: "terracotta", grounds: "planted" } },
  { name: "Gabled cafe", patch: { archetype: "cafe", blueprint: "office", width: 12, depth: 10, middleFloors: 0, crown: "none", podium: false, base: "storefront", architecture: "brick", roof: "pitched", entranceStyle: "wide-canopy", pavingPattern: "ribbon" } },
  { name: "Village shop", patch: { archetype: "shop", blueprint: "office", width: 12, depth: 10, middleFloors: 1, crown: "none", podium: false, base: "storefront", architecture: "boutique", roof: "pitched", slots: { "canopy.entrance": null }, pavingPattern: "checker" } },
  { name: "Canopy kiosk", patch: { archetype: "kiosk", blueprint: "office", width: 8, depth: 8, middleFloors: 0, crown: "none", podium: false, groundHeight: 3, base: "storefront", architecture: "creative", roof: "flat", entranceStyle: "wide-canopy", grounds: "urban" } },
  { name: "Gabled kiosk", patch: { archetype: "kiosk", blueprint: "office", width: 8, depth: 8, middleFloors: 0, crown: "none", podium: false, groundHeight: 3, base: "storefront", architecture: "brick", roof: "pitched", slots: { "canopy.entrance": null }, pavingPattern: "terracotta" } },
  { name: "City museum", patch: { windowFamily: "arched", archetype: "museum", massing: "hall-wings", blueprint: "office", width: 16, depth: 12, middleFloors: 1, crown: "recessed", podium: true, base: "lobby", architecture: "creative", roof: "flat", entranceStyle: "portico", slots: { "canopy.entrance": null }, pavingPattern: "ribbon", grounds: "minimal" } },
  { name: "Civic bank", patch: { windowFamily: "arched", archetype: "bank", blueprint: "office", width: 18, depth: 12, middleFloors: 1, crown: "none", podium: false, base: "plinth", architecture: "boutique", roof: "parapet", entranceStyle: "pediment", slots: { "canopy.entrance": null }, pavingPattern: "checker", grounds: "urban" } },
  { name: "Boutique hotel", patch: { archetype: "hotel", slots: { "canopy.entrance": null }, blueprint: "terraces", width: 14, depth: 12, middleFloors: 3, crown: "penthouse", podium: true, base: "lobby", architecture: "boutique", roof: "planted", grounds: "planted", pavingPattern: "basalt" } },
  { name: "Mansard townhouse", patch: { windowFamily: "sash", archetype:"shop", blueprint:"office", width:10, depth:12, middleFloors:2, crown:"none", podium:false, architecture:"brick", base:"storefront", rhythm:"vertical", roof:"flat", roofVariant:"mansard", grounds:"minimal" } },
  { name: "Industrial workshop", patch: { windowFamily: "warehouse", blueprint:"office", width:18, depth:14, middleFloors:0, crown:"none", podium:false, groundHeight:4.5, architecture:"creative", base:"storefront", rhythm:"vertical", roof:"flat", roofVariant:"sawtooth", grounds:"urban" } },
  { name: "Garden courtyard cafe", patch: { archetype:"cafe", blueprint:"courtyard", width:18, depth:16, middleFloors:1, crown:"terrace", podium:false, architecture:"boutique", base:"storefront", roof:"planted", grounds:"planted" } },
  { name: "Stepped theatre", patch: { blueprint:"terraces", width:18, depth:14, middleFloors:2, crown:"penthouse", podium:false, architecture:"boutique", rhythm:"vertical", base:"lobby", roof:"parapet", entranceStyle:"wide-canopy", grounds:"urban" } },

  {name:"Garden bungalow",patch:{generatorRevision:"city-connected-3",archetype:"bungalow",blueprint:"office",width:12,depth:10,middleFloors:0,crown:"none",podium:false,groundHeight:3,base:"residential",architecture:"brick",finish:"procedural",windowFamily:"sash",doorFamily:"panelled",doorSurround:"framed",roof:"flat",roofVariant:"hip",entranceStyle:"standard",grounds:"planted",pavingPattern:"ribbon",slots:{"brand.entrance":"brand","canopy.entrance":null},connectedArchitecture:{openingLayout:"balanced",roofPitch:35,roofOverhang:.3,ridgeDirection:"x",porch:"entrance",supportStyle:"timber",gutters:true,chimney:false,balconies:false}}},
  {name:"Gabled cottage",patch:{generatorRevision:"city-connected-3",archetype:"cottage",blueprint:"office",width:10,depth:10,middleFloors:0,crown:"none",podium:false,groundHeight:3,base:"residential",architecture:"brick",finish:"procedural",windowFamily:"sash",doorFamily:"panelled",doorSurround:"framed",roof:"pitched",roofVariant:"standard",entranceStyle:"standard",grounds:"planted",pavingPattern:"ribbon",slots:{"brand.entrance":"brand","canopy.entrance":null},connectedArchitecture:{openingLayout:"compact",roofPitch:45,roofOverhang:.3,ridgeDirection:"x",porch:"entrance",supportStyle:"timber",gutters:true,chimney:true,balconies:false}}},
  {name:"Detached family house",patch:{generatorRevision:"city-connected-3",archetype:"detached",blueprint:"office",width:12,depth:12,middleFloors:1,crown:"none",podium:false,groundHeight:3,base:"residential",architecture:"brick",finish:"procedural",windowFamily:"sash",doorFamily:"panelled",doorSurround:"framed",roof:"pitched",roofVariant:"standard",entranceStyle:"standard",grounds:"planted",pavingPattern:"ribbon",slots:{"brand.entrance":"brand","canopy.entrance":null},connectedArchitecture:{openingLayout:"balanced",roofPitch:35,roofOverhang:.3,ridgeDirection:"x",porch:"entrance",supportStyle:"timber",gutters:true,chimney:false,balconies:false}}},
  {name:"Terraced townhouse",patch:{generatorRevision:"city-connected-3",archetype:"townhouse",blueprint:"office",width:8,depth:12,middleFloors:2,crown:"none",podium:false,groundHeight:3,base:"residential",architecture:"brick",finish:"procedural",windowFamily:"sash",doorFamily:"panelled",doorSurround:"framed",roof:"pitched",roofVariant:"standard",entranceStyle:"standard",grounds:"planted",pavingPattern:"ribbon",slots:{"brand.entrance":"brand","canopy.entrance":null},connectedArchitecture:{openingLayout:"paired",roofPitch:35,roofOverhang:.3,ridgeDirection:"x",porch:"none",supportStyle:"timber",gutters:true,chimney:false,balconies:false}}},
  {name:"Modern suburban house",patch:{generatorRevision:"city-connected-3",archetype:"modern-house",blueprint:"terraces",width:14,depth:12,middleFloors:1,crown:"none",podium:false,groundHeight:3,base:"residential",architecture:"brick",finish:"procedural",windowFamily:"sash",doorFamily:"panelled",doorSurround:"framed",roof:"flat",roofVariant:"standard",entranceStyle:"standard",grounds:"planted",pavingPattern:"ribbon",slots:{"brand.entrance":"brand","canopy.entrance":null},connectedArchitecture:{openingLayout:"balanced",roofPitch:35,roofOverhang:.3,ridgeDirection:"x",porch:"entrance",supportStyle:"timber",gutters:true,chimney:false,balconies:false}}},
  {name:"Courtyard villa",patch:{generatorRevision:"city-connected-3",archetype:"villa",blueprint:"l-shape",width:16,depth:14,middleFloors:0,crown:"none",podium:false,groundHeight:3,base:"residential",architecture:"brick",finish:"procedural",windowFamily:"sash",doorFamily:"panelled",doorSurround:"framed",roof:"flat",roofVariant:"hip",entranceStyle:"standard",grounds:"planted",pavingPattern:"ribbon",slots:{"brand.entrance":"brand","canopy.entrance":null},connectedArchitecture:{openingLayout:"paired",roofPitch:35,roofOverhang:.3,ridgeDirection:"x",porch:"courtyard",supportStyle:"timber",gutters:true,chimney:false,balconies:false}}},
  {name:"Farmhouse",patch:{generatorRevision:"city-connected-3",archetype:"farmhouse",blueprint:"office",width:16,depth:12,middleFloors:1,crown:"none",podium:false,groundHeight:3,base:"residential",architecture:"brick",finish:"procedural",windowFamily:"sash",doorFamily:"panelled",doorSurround:"framed",roof:"pitched",roofVariant:"standard",entranceStyle:"standard",grounds:"planted",pavingPattern:"ribbon",slots:{"brand.entrance":"brand","canopy.entrance":null},connectedArchitecture:{openingLayout:"balanced",roofPitch:35,roofOverhang:.3,ridgeDirection:"x",porch:"veranda",supportStyle:"timber",gutters:true,chimney:true,balconies:false}}},
  {name:"Small apartment house",patch:{generatorRevision:"city-connected-3",archetype:"apartment",blueprint:"office",width:14,depth:12,middleFloors:2,crown:"none",podium:false,groundHeight:3,base:"residential",architecture:"brick",finish:"procedural",windowFamily:"sash",doorFamily:"panelled",doorSurround:"framed",roof:"flat",roofVariant:"standard",entranceStyle:"standard",grounds:"planted",pavingPattern:"ribbon",slots:{"brand.entrance":"brand","canopy.entrance":null},connectedArchitecture:{openingLayout:"paired",roofPitch:35,roofOverhang:.3,ridgeDirection:"x",porch:"entrance",supportStyle:"timber",gutters:true,chimney:false,balconies:true}}},
  {name:"Twin-Tower HQ",patch:{generatorRevision:"city-office-4",archetype:"twin-tower",blueprint:"office",width:18,depth:14,middleFloors:5,crown:"none",podium:false,groundHeight:3.6,base:"lobby",architecture:"glass",finish:"procedural",roof:"flat",roofVariant:"standard",grounds:"planted",pavingPattern:"classic",rhythm:"vertical",slots:{"brand.entrance":"brand","canopy.entrance":null},officeArchitecture:{bridgeFloor:3,towerGap:4,shorterTower:0,style:"international"}}},
  {name:"Round Tower",patch:{generatorRevision:"city-office-4",archetype:"round-tower",blueprint:"office",width:14,depth:14,middleFloors:5,crown:"none",podium:false,groundHeight:3.6,base:"lobby",architecture:"glass",finish:"procedural",roof:"flat",roofVariant:"standard",grounds:"planted",pavingPattern:"classic",rhythm:"vertical",slots:{"brand.entrance":"brand","canopy.entrance":null},officeArchitecture:{bridgeFloor:3,towerGap:4,shorterTower:0,style:"international"}}},
  {name:"Elliptical HQ",patch:{generatorRevision:"city-office-4",archetype:"ellipse-tower",blueprint:"office",width:18,depth:10,middleFloors:4,crown:"none",podium:false,groundHeight:3.6,base:"lobby",architecture:"glass",finish:"procedural",roof:"flat",roofVariant:"standard",grounds:"planted",pavingPattern:"classic",rhythm:"vertical",slots:{"brand.entrance":"brand","canopy.entrance":null},officeArchitecture:{bridgeFloor:3,towerGap:4,shorterTower:0,style:"international"}}},
  {name:"Rounded Office",patch:{generatorRevision:"city-office-4",archetype:"rounded-office",blueprint:"office",width:16,depth:12,middleFloors:3,crown:"none",podium:false,groundHeight:3.6,base:"lobby",architecture:"glass",finish:"procedural",roof:"flat",roofVariant:"standard",grounds:"planted",pavingPattern:"classic",rhythm:"vertical",slots:{"brand.entrance":"brand","canopy.entrance":null},officeArchitecture:{bridgeFloor:3,towerGap:4,shorterTower:0,style:"international"}}},
  {name:"Art Deco Setback Tower",patch:{generatorRevision:"city-office-4",archetype:"art-deco",blueprint:"office",width:16,depth:14,middleFloors:6,crown:"none",podium:false,groundHeight:3.6,base:"lobby",architecture:"boutique",finish:"procedural",roof:"flat",roofVariant:"standard",grounds:"planted",pavingPattern:"classic",rhythm:"vertical",slots:{"brand.entrance":"brand","canopy.entrance":null},officeArchitecture:{bridgeFloor:3,towerGap:4,shorterTower:0,style:"deco"}}},
  {name:"Atrium Campus",patch:{generatorRevision:"city-office-4",archetype:"atrium-campus",blueprint:"office",width:18,depth:14,middleFloors:2,crown:"none",podium:false,groundHeight:3.6,base:"lobby",architecture:"glass",finish:"procedural",roof:"flat",roofVariant:"standard",grounds:"planted",pavingPattern:"classic",rhythm:"vertical",slots:{"brand.entrance":"brand","canopy.entrance":null},officeArchitecture:{bridgeFloor:3,towerGap:4,shorterTower:0,style:"international"}}},
];
export function applyComposition(d: CityBuildingDesignV3, index: number) {
  const p = COMPOSITIONS[index];
  return normalizeV3({
    ...newDesign(String(d.seed)),
    ...p.patch,
    seed: d.seed,
    facadeSeed: d.facadeSeed,
    groundsSeed: d.groundsSeed,
    palette: d.palette,
    advertising: d.advertising,
    finish: d.finish,
    slots: {
      ...newDesign(String(d.seed)).slots,
      "ground.left": p.patch.grounds === "minimal" ? null : p.patch.grounds === "urban" ? "bollards" : "planter",
      "ground.right": p.patch.grounds === "minimal" ? null : p.patch.grounds === "urban" ? "bollards" : "planter",
      ...p.patch.slots,
    },
  });
}
export function massesV3(d: CityBuildingDesignV3): BuildingMass[] {
  if(d.generatorRevision==='city-variation-5'&&d.modular)return modularMasses(d);
  if(d.generatorRevision==="city-office-4")return officeMasses(normalizeV3(d));
  const n = normalizeV3(d),
    raw = massesV2({ ...n, version: 2 }),
    last = raw.at(-1)!.y,
    result: BuildingMass[] = [];
  if (n.massing === "hall-wings" && n.blueprint === "office") {
    const floors = [...raw]; raw.length = 0;
    for (const m of floors) {
      const centerWidth = m.width / 2;
      raw.push({...m, width:centerWidth});
      if (m.y === .65 || m.y < last) for (const side of [-1,1]) raw.push({...m, x:side*m.width*3/8, z:-m.depth*.175, width:m.width/4, depth:m.depth*.65});
    }
  }
  if(n.generatorRevision==="city-connected-3" && n.archetype==="farmhouse") {
    const original=[...raw];raw.length=0;
    for(const m of original){raw.push({...m,x:-m.width*.15,width:m.width*.7});if(m.y===.65)raw.push({...m,x:m.width*.35,width:m.width*.3,height:3});}
  }
  for (const y of [...new Set(raw.map((m) => m.y))]) {
    const previous = result.length
      ? result.filter((m) => m.y === result.at(-1)!.y)
      : [];
    for (const original of raw.filter((m) => m.y === y)) {
      const inset = y === last && n.crown !== "none" ? n.crownSetback : 0;
      const m = {
        ...original,
        width: Math.max(2, original.width - 2 * inset),
        depth: Math.max(2, original.depth - 2 * inset),
      };
      if (!previous.length) {
        result.push(m);
        continue;
      }
      for (const support of previous) {
        const x0 = Math.max(m.x - m.width / 2, support.x - support.width / 2),
          x1 = Math.min(m.x + m.width / 2, support.x + support.width / 2),
          z0 = Math.max(m.z - m.depth / 2, support.z - support.depth / 2),
          z1 = Math.min(m.z + m.depth / 2, support.z + support.depth / 2);
        if (x1 - x0 > .5 && z1 - z0 > .5) {
          result.push({
            ...m,
            x: (x0 + x1) / 2,
            z: (z0 + z1) / 2,
            width: x1 - x0,
            depth: z1 - z0,
          });
        }
      }
    }
  }
  return (n.stairExtension === "fire-escape" || (n.stairExtension === "spiral" || n.stairExtension === "straight")) ? flattenEscapeSide(result,(n.stairExtension === "spiral" || n.stairExtension === "straight")) : result;
}
export function classifyCorners(masses: BuildingMass[]): Corner[] {
  const walls = exposedWalls(masses), seen = new Map<string, Corner>();
  for (const w of walls) {
    for (const dir of [-1, 1]) {
      const x = w.x + (w.nz ? dir * w.length / 2 : 0),
        z = w.z + (w.nx ? dir * w.length / 2 : 0),
        key = [x, z, w.y].join(":");
      if (seen.has(key)) continue;
      let filled = 0;
      for (const dx of [-.01, .01]) {
        for (const dz of [-.01, .01]) {
          if (
            masses.some((m) =>
              m.y === w.y && x + dx > m.x - m.width / 2 &&
              x + dx < m.x + m.width / 2 && z + dz > m.z - m.depth / 2 &&
              z + dz < m.z + m.depth / 2
            )
          ) filled++;
        }
      }
      if (filled !== 2) {
        seen.set(key, {
          x,
          z,
          y: w.y,
          height: w.height,
          kind: filled === 3 ? "concave" : filled === 1 ? "convex" : "end",
        });
      }
    }
  }
  return [...seen.values()];
}
export function overlaps(
  a: { position: readonly number[]; size: readonly number[] },
  b: { position: readonly number[]; size: readonly number[] },
) {
  return a.position.every((v, i) =>
    Math.abs(v - b.position[i]) < (a.size[i] + b.size[i]) / 2 - .001
  );
}
export function buildingSlots(
  d: CityBuildingDesignV3,
  masses = massesV3(d),
): Slot[] {
  if(d.generatorRevision==='city-variation-5'&&d.modular){const result=resolveModularBuilding(d,'far'),sign=result.sign;return [{id:'brand.entrance',label:'Entrance sign',position:[sign.x,sign.y,sign.z],size:[sign.width,sign.height,.1],compatible:['brand'],rotation:result.signs[0]?.rotation??0,selected:d.slots['brand.entrance']||null,active:d.slots['brand.entrance']==='brand',reason:null}];}
  if(d.generatorRevision==="city-office-4")return officeSlots(d);
  const ground = masses[0],
    top = masses.find((m) => m.y === masses.at(-1)!.y)!,
    front = ground.z + ground.depth / 2,
    slots: Slot[] = [];
  const structure = frontStructure(d.entranceStyle, d.blueprint, front, ground.width, d.groundHeight, d.palette.wall, d.palette.trim);
  const put = (
    id: SlotId,
    label: string,
    position: Slot["position"],
    size: Slot["size"],
    compatible: ComponentId[],
    rotation = 0,
    reason: string | null = null,
  ) =>
    slots.push({
      id,
      label,
      position,
      size,
      rotation,
      compatible,
      selected: d.slots[id] || null,
      active: !reason && !!d.slots[id],
      reason,
    });
  put(
    "brand.entrance",
    "Entrance sign",
    [0, d.groundHeight + (structure.depth ? .55 : .35), front + (structure.depth || 0) + .32],
    [3.2, structure.depth ? .45 : .55, .3],
    ["brand"],
  );
  if(d.generatorRevision==="city-connected-3" && d.connectedArchitecture?.porch && !["none","side"].includes(d.connectedArchitecture.porch)){
    const porch=connectedPorch(masses,d.connectedArchitecture,d.palette,front);
    if(porch.envelopes.length){const e=porch.envelopes[0];slots[0].position=[0,ground.y+ground.height-.66,e.position[2]+e.size[2]/2+.07];slots[0].size=[2.4,.24,.12];}
  }
  put(
    "brand.facade",
    "Façade sign",
    [top.x, top.y + 1.5, top.z + top.depth / 2 + .32],
    [Math.min(4, top.width - 1), 1, .3],
    ["brand"],
    0,
    d.floors < 2 ? "Add an upper floor to use this sign." : null,
  );
  put(
    "brand.roof",
    "Roof-edge sign",
    [top.x, top.y + top.height + .65, top.z + top.depth / 2 + .85],
    [Math.min(6, top.width - 1), 1, .3],
    ["brand"],
    0,
    d.roof === "pitched" || (d.roofVariant && d.roofVariant !== "standard") ? "A pitched roof does not support this sign." : null,
  );
  const right =
    masses.filter((m) => m.y === .65).sort((a, b) =>
      (b.x + b.width / 2) - (a.x + a.width / 2)
    )[0];
  put(
    "campaign.side",
    "Campaign panel",
    [right.x + right.width / 2 + .32, 2.15, right.z],
    [.3, 1.2, Math.min(3, right.depth - 1)],
    ["campaign"],
    Math.PI / 2,
  );
  put(
    "canopy.entrance",
    "Entrance canopy",
    [0, d.groundHeight - .2, front + 1],
    [d.entranceStyle === "wide-canopy" && d.blueprint === "office" ? Math.min(10, ground.width - 1) : 3.4, .4, 1.8],
    ["canopy"],
    0,
    structure.depth ? "The portico replaces this canopy. Your selection is retained." : null,
  );
  for (const [i, side] of ["left", "right"].entries()) {
    const sign = i ? 1 : -1,
      shift = (identitySeed(String(d.groundsSeed) + side) % 5) * .1;
    put(
      ("ground." + side) as SlotId,
      side + " forecourt",
      [sign * 9.8, 1.4, 9.5 - shift],
      [2, 2.3, 2],
      ["planter", "bollards"],
    );
    put(
      ("terrace." + side) as SlotId,
      side + " terrace",
      [
        top.x + sign * Math.max(0, top.width / 2 - 1.5),
        top.y + top.height + .6,
        top.z,
      ],
      [1.2, 1.2, 1.2],
      ["planter"],
      0,
      d.roof === "pitched" || (d.roofVariant && d.roofVariant !== "standard") || top.width < 5 || top.depth < 3
        ? "This roof has no clear planter area."
        : null,
    );
  }
  const escapeClearance=d.stairExtension==="fire-escape"?fireEscape(exposedWalls(masses),masses,[]).bounds:(d.stairExtension==="spiral" || d.stairExtension==="straight")?(d.stairExtension==="straight"?straightStair:spiralStair)(masses,d.palette.trim).bounds:null;
  const occupied: Slot[] = [];
  for (const slot of slots) {
    if (
      !slot.reason &&
      (!slot.compatible.includes(slot.selected!) && slot.selected)
    ) slot.reason = "This component is incompatible with the slot.";
    if (
      !slot.reason &&
      (Math.abs(slot.position[0]) + slot.size[0] / 2 > 11.8 ||
        Math.abs(slot.position[2]) + slot.size[2] / 2 > 11.8)
    ) slot.reason = "The component would cross the plot boundary.";
    if (
      !slot.reason && slot.id.startsWith("ground.") &&
      masses.some((m) =>
        m.y === .65 &&
        overlaps(slot, {
          position: [m.x, m.y + m.height / 2, m.z],
          size: [m.width + .3, m.height, m.depth + .3],
        })
      )
    ) slot.reason = "The building needs this clearance.";
    if (
      !slot.reason && slot.selected &&
      occupied.some((other) => overlaps(slot, other))
    ) slot.reason = "Another selected attachment occupies this space.";
    if (!slot.reason && structure.envelope && slot.id !== "brand.entrance" && overlaps(slot, structure.envelope)) slot.reason = "The entrance structure needs this clearance.";
    if(!slot.reason && escapeClearance && overlaps(slot,escapeClearance))slot.reason="The exterior stairs reserve this side. Your selection is retained.";
    slot.active = !!slot.selected && !slot.reason;
    if (slot.active) occupied.push(slot);
  }
  return slots;
}
export function resolveCurrent(
  d: CityBuildingDesignV2 | CityBuildingDesignV3,
  brand: string,
  lod: "near" | "medium" | "far" = "near",
) {
  return d.version === 3
    ? resolveV3(d, brand, lod)
    : resolveDesign(d, brand, lod);
}
export function resolveV3(
  input: CityBuildingDesignV3,
  brand: string,
  lod: "near" | "medium" | "far" = "near",
): ResolvedV3 {
  const authored = normalizeV3(input);
  if(authored.generatorRevision==='city-variation-5'&&authored.modular)return resolveModularBuilding(authored,lod);
  if(authored.generatorRevision==="city-office-4")return resolveOffice(authored,brand,lod);
  if(authored.synarcKit)return resolveSynarcKitV3(authored,lod);
  const residential = authored.generatorRevision === "city-connected-3" && authored.base === "residential";
  const d = residential ? {...authored,finish:"procedural" as const} : authored,
    p = d.palette,
    masses = massesV3(d),
    walls = exposedWalls(masses),
    parts: DesignPart[] = [],
    attachments: Attachment[] = [];
  const openingEnvelopes:AssemblyEnvelope[]=[];
  let balconyCount=0;
  const requestedArchitecture = ({ brick: "brick", "white-brick": "creative", marble: "boutique", metal: "glass" } as const)[d.detailSet as "brick" | "white-brick" | "marble" | "metal"] ?? d.architecture;
  const nativeChoice=nativeFacadeChoice(d.nativeFacade,requestedArchitecture);
  const detailArchitecture=nativeChoice?.family ?? requestedArchitecture;
  const facadeEnabled = d.finish === "facade";
  const kit=d.finish!=="procedural" && d.base!=="residential"?d.architecturalKit:undefined;
  const roofReason=kitRoofReason(kit,d.blueprint,d.massing);
  const roofActive=!!kit?.roof && kit.roof!=="existing" && !roofReason;
  const chosenEntry=kitEntrance(kit?.entrance);
  const entryLeaf=chosenEntry?.leaf || "Door_1";
  const slots = buildingSlots(d, masses), corners = classifyCorners(masses);
  const signs: DesignSign[] = slots.filter((s) =>
    s.active && (s.selected === "brand" || s.selected === "campaign")
  ).map((s) => ({
    x: s.position[0],
    y: s.position[1],
    z: s.position[2],
    width: s.rotation ? s.size[2] : s.size[0],
    height: s.size[1],
    rotation: s.rotation,
    campaign: s.selected === "campaign",
  }));
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    depth: number,
    color: string,
    fallback?: DesignPart["fallback"],
  ) =>
    parts.push({
      kind: "box",
      position: [x, y, z],
      size: [w, h, depth],
      color,
      fallback,
    });
  const attach = (
    asset: string,
    x: number,
    y: number,
    z: number,
    rotation = 0,
    scale = 1,
    role = "accent",
  ) => {
    if (d.detailScope === "entrance" && role === "cornice") return;
    if (d.detailScope === "crown" && !facadeEnabled && (role === "door" || role === "entrance")) return;
    attachments.push({ asset, position: [x, y, z], rotation, scale, role });
  };
  const advertising = advertisingLayout(d, masses, slots);
  signs.push(...advertising.signs);
  const entrance = { x: 0, z: masses[0].z + masses[0].depth / 2 };
  const sign = {
    x: 0,
    y: d.canopy ? d.groundHeight - .05 : d.groundHeight + .1,
    z: entrance.z + (d.canopy ? 1.67 : .23),
    width: 3.2,
    height: .55,
  };
  const entryAsset=chosenEntry?.frame ?? nativeChoice?.entry ?? ({glass:"DoorFrame_Metal_Single",creative:"DoorFrame_WhiteBrick",boutique:"DoorFrame_Marble",brick:"DoorFrame_Trim"} as const)[detailArchitecture];
  const entryModule=NATIVE_MODULES[entryAsset];
  const entryWall=walls.find(w=>w.y===.65 && w.nz===1 && Math.abs(w.z-entrance.z)<.001 && Math.abs(w.x)<w.length/2);
  const entryClearWidth=entryWall?2*(entryWall.length/2-Math.abs(entryWall.x))-.12:masses[0].width-.12;
  const entryStep=chosenEntry && kit?.entranceSteps!==false ? ("steps" in chosenEntry ? chosenEntry.steps : kit?.entranceSteps ? "Entrance_Concrete_2x2" : undefined) : undefined;
  const stepSize=entryStep ? KIT_DIMENSIONS[entryStep] : undefined;
  const entryScale=Math.min((d.groundHeight+(stepSize ? .4 : 0))/(entryModule.height+(stepSize?.[1]||0)),entryClearWidth/entryModule.span,stepSize?(11.3-entrance.z)/stepSize[2]:Infinity);
  const entryBase=stepSize?.length ? .25+stepSize[1]*entryScale : .65;
  const entryWidth=entryModule.span*entryScale;
  let stairLanding=1.26;
  let extensionWall: typeof walls[number] | undefined;
  let extensionReason: string | null = null;
  if (d.stairExtension && d.stairExtension !== "none" && d.stairExtension !== "fire-escape" && d.stairExtension !== "spiral" && d.stairExtension !== "straight") {
    extensionReason = d.finish === "procedural" ? "Choose Quaternius accents or facade for native stairs." : "No clear side wall has room for stairs inside this plot.";
    if (d.finish !== "procedural") {
      for (const wall of walls.filter(w=>w.y===.65 && w.nx!==0 && w.length>=4).sort((a,b)=>b.nx-a.nx || a.z-b.z)) {
        const stairModule=NATIVE_MODULES[d.stairExtension==="marble"?"Stairs_Entrance_Marble":"Stairs_Entrance_Concrete"];
        const depth=stairModule.depth;
        stairLanding=.25+stairModule.height;
        const bounds={position:[wall.x+wall.nx*(depth/2+.08),1.9,wall.z],size:[depth,3.3,2.4]};
        if(Math.abs(bounds.position[0])+depth/2>10.6 || Math.abs(wall.z)+1.2>10.6)continue;
        if(masses.some(m=>overlaps(bounds,{position:[m.x,m.y+m.height/2,m.z],size:[m.width,m.height,m.depth]})))continue;
        if(slots.some(slot=>slot.active && overlaps(bounds,slot)))continue;
        if(advertising.signs.some(sign=>overlaps(bounds,{position:[sign.x,sign.y,sign.z],size:[sign.rotation?.6:sign.width,sign.height,sign.rotation?sign.width:.6]})))continue;
        extensionWall=wall;extensionReason=null;
        if(lod!=="far") {
          attach(d.stairExtension==="marble"?"Stairs_Entrance_Marble":"Stairs_Entrance_Concrete",wall.x,.25,wall.z,Math.atan2(wall.nx,0),1,"stairs");
          if(kit?.stairRails){
            attach(d.stairExtension==="marble"?"Stairs_Rails_Marble":"Stairs_Rails_Concrete",wall.x,.25,wall.z,Math.atan2(wall.nx,0),1,"rails");
          }
          // A raised service door gives the decorative landing a coherent destination.
          attach("Door_1",wall.x-wall.nx*NATIVE_MODULES.Door_1.face,stairLanding,wall.z,Math.atan2(wall.nx,0),1,"door");
        }
        break;
      }
    }
  }
  const escape = d.stairExtension === "fire-escape" ? fireEscape(walls,masses,[
    ...slots.filter(s=>s.active).map(s=>({position:s.position,size:s.size})),
    ...advertising.signs.map(s=>({position:[s.x,s.y,s.z],size:[s.rotation?.6:s.width,s.height,s.rotation?s.width:.6]} as EscapeBounds)),
  ]) : null;
  if(escape)extensionReason=escape.reason;
  const surface =
    { garden: "#8c9d77", limestone: "#d5ceba", slate: "#7b8587" }[d.tile];
  box(0, .05, 0, 23.5, .24, 23.5, p.trim);
  parts[parts.length - 1].textureRole = "groundBorder";
  box(0, .2, 0, 22.8, .1, 22.8, surface);
  if (lod === "near" && d.tile !== "garden" && (!d.pavingPattern || d.pavingPattern === "classic")) {
    for (let g = -8; g <= 8; g += 4) {
      box(g, .26, 0, .035, .01, 22.7, "#a8ada4");
      box(0, .26, g, 22.7, .01, .035, "#a8ada4");
    }
  }
  box(0, .29, (entrance.z + 11.4) / 2, 3.2, .08, 11.4 - entrance.z, p.trim);
  parts.push(...groundsParts(d, lod));
  // Floor plates tessellate the union without overlapping faces at joined wings.
  for (const m of masses) {
    if (m.y === .65) {
      box(m.x, .45, m.z, m.width, .4, m.depth, p.wall);
      parts.at(-1)!.textureRole="wall";
      if(facadeEnabled)parts.at(-1)!.squareEdges=true;
    }
    // The foundation already reaches the ground-floor/door datum. An extra
    // slab above it buried the bottom 18cm of door leaves and frames.
    if (m.y > .65) {
      box(m.x, m.y + .09, m.z, m.width, .18, m.depth, p.trim);
      if(facadeEnabled){
        parts.at(-1)!.squareEdges=true;
        // The full-height native shell and preceding floor already close this
        // junction. A second lower slab shares the wall's outer face.
        if(lod!=="far"){parts.at(-1)!.fallback="facade";parts.at(-1)!.fallbackAsset="Floor_4x4";}
      }
    }
    box(m.x, m.y + m.height - .09, m.z, m.width, .18, m.depth, p.roof);
    if(facadeEnabled && lod!=="far"){
      parts.at(-1)!.fallback="facade";parts.at(-1)!.fallbackAsset="Floor_4x4";
      const countX=Math.ceil(m.width/4),countZ=Math.ceil(m.depth/4),w=m.width/countX,dep=m.depth/countZ;
      for(let ix=0;ix<countX;ix++)for(let iz=0;iz<countZ;iz++){
        attach("Floor_4x4",m.x-m.width/2+(ix+.5)*w,m.y+m.height-.18,m.z-m.depth/2+iz*dep,0,1,"floor");
        attachments.at(-1)!.axisScale=[w/4,1.8,dep/4];
      }
    }
  }
  const family = {
    glass: ["Metal_Window_Half", "Metal_Plain_3", "Cornice_Metal_Center"],
    brick: ["Brick_Window_Trim", "Brick_Plain_3", "Cornice_Brick_Center"],
    boutique: ["Marble_Window", "Marble_Plain_3", "Cornice_Marble_Center"],
    creative: [
      "WhiteBrick_Window",
      "WhiteBrick_Plain_3",
      "Cornice_WhiteBrick_Center",
    ],
  }[detailArchitecture];
  if(nativeChoice?.wall)family[1]=nativeChoice.wall;
  if(nativeChoice?.cornice)family[2]=nativeChoice.cornice;
  const cornerAsset=detailArchitecture==="brick"?"Brick_Corner_Plain":detailArchitecture==="creative"?"WhiteBrick_Corner_Plain":detailArchitecture==="boutique"?"Marble_Corner_Plain":"Concrete_Corner";
  // Native L returns can shorten horizontally while retaining full floor height.
  // Reserve actual entrance-module width before choosing the return length.
  const nativeCorners=new Map<typeof corners[number],number>();
  if(facadeEnabled && lod!=="far")for(const c of corners){
    if(c.kind!=="convex")continue;
    const adjacent=walls.filter(w=>w.y===c.y && (w.nz ? Math.abs(w.z-c.z)<.001 && Math.abs(Math.abs(w.x-c.x)-w.length/2)<.001 : Math.abs(w.x-c.x)<.001 && Math.abs(Math.abs(w.z-c.z)-w.length/2)<.001));
    if(adjacent.length!==2)continue;
    let scale=c.height/3;
    for(const w of adjacent){
      scale=Math.min(scale,(w.length-.12)/4);
      if(nativeChoice){
        const panel=NATIVE_MODULES[nativeChoice.asset], desired=panel.span*c.height/panel.height;
        scale=Math.min(scale,Math.max(.03,(w.length-Math.min(desired,w.length-.24)-.12)/4));
      }
      if(w.y===.65 && w.nz===1 && Math.abs(w.z-entrance.z)<.01 && Math.abs(w.x)<w.length/2)
        scale=Math.min(scale,(Math.abs(c.x)-entryWidth/2-.06)/2);
      if(extensionWall===w)scale=Math.min(scale,(w.length-NATIVE_MODULES.Door_1.width-.12)/4);
    }
    if(kit?.frontage && kit.frontage!=="existing" && adjacent.some(w=>w.y===.65&&w.nz===1&&Math.abs(w.z-entrance.z)<.01))scale=Math.min(scale,.25);
    if(scale>.025)nativeCorners.set(c,scale);
  }
  for(const [c,scale] of nativeCorners){
    const adjacent=walls.filter(w=>w.y===c.y && (w.nz ? Math.abs(w.z-c.z)<.001 && Math.abs(Math.abs(w.x-c.x)-w.length/2)<.001 : Math.abs(w.x-c.x)<.001 && Math.abs(Math.abs(w.z-c.z)-w.length/2)<.001));
    const nx=adjacent.find(w=>w.nx)?.nx || 1,nz=adjacent.find(w=>w.nz)?.nz || 1;
    const angle=nx<0?(nz>0?0:-Math.PI/2):(nz>0?Math.PI/2:Math.PI);
    const cx=-scale,cz=2*scale;
    attach(cornerAsset,c.x-(cx*Math.cos(angle)+cz*Math.sin(angle)),c.y,c.z-(cz*Math.cos(angle)-cx*Math.sin(angle)),angle,scale,"facade");
    attachments.at(-1)!.axisScale=[scale,c.height/3,scale];
  }
  const bayWidth = residential ? (d.connectedArchitecture?.openingLayout==="compact"?.8:1.2) : facadeEnabled
    ? (detailArchitecture === "boutique" || detailArchitecture === "creative" ? 4 : 2)
    : d.architecture === "glass"
    ? 2.8
    : 1.6;
  for (const wall of walls) {
    const { x, z, nx, nz, y, height, length } = wall,
      angle = Math.atan2(nx, nz),
      horizontal = nz !== 0;
    const connected = d.generatorRevision !== "city-grammar-1" && d.finish === "procedural";
    const range = connected ? joinedWallRange(wall, walls, .3,d.generatorRevision==="city-connected-3") : {left:-length/2,right:length/2};
    const wallIndex = parts.length;
    const openings: {offset:number;height:number;centerY:number}[] = [];
    box(
      x - nx * .075,
      y + height / 2,
      z - nz * .075,
      horizontal ? length : .15,
      // Slabs own the bottom/top 18 cm; coplanar wall faces caused z-fighting.
      height - .36,
      horizontal ? .15 : length,
      d.crown === "penthouse" && y === masses.at(-1)!.y ? p.glass : p.wall,
    );
    box(
      x,
      y + height - .16,
      z,
      horizontal ? length : .22,
      .18,
      horizontal ? .22 : length,
      p.trim,
    );
    const top = !masses.some((m) =>
      Math.abs(m.y - y - height) < .001 && x - nx * .1 > m.x - m.width / 2 &&
      x - nx * .1 < m.x + m.width / 2 && z - nz * .1 > m.z - m.depth / 2 &&
      z - nz * .1 < m.z + m.depth / 2
    );
    if (!roofActive && top && d.roof === "parapet" && (!d.roofVariant || d.roofVariant === "standard")) {
      box(
        x,
        y + height + .24,
        z,
        horizontal ? length : .2,
        .48,
        horizontal ? .2 : length,
        p.trim,
      );
    }
    if (lod === "far" && !connected) continue;
    const detailAllowed = d.finish !== "procedural" && (d.detailScope === "entrance" ? y === .65 : d.detailScope === "crown" ? top : true);
    const column = ({brick:["Brick_Column_Small",.25,3,.35],creative:["WhiteBrick_Column_Half",.72,4,.25],boutique:["Marble_BevelColumn_Center",.57489,4,.20441],glass:["Metal_Column_Small_Center",.24888,3,.24911]} as const)[detailArchitecture];
    // Wall panels stop at slabs, but corner framing must bridge those slab margins.
    const columnBottom = y === .65 ? .25 : y;
    const columnScale = (y + height - columnBottom) / column[2];
    const columnWidth = column[1] * columnScale;
    // Only exposed walls receive details. Native pieces retain uniform XYZ scaling.
    const addDetail = (asset:string,offset:number,bottom:number,scale:number,size:readonly number[],role:string) => {
      if (extensionWall===wall && Math.abs(offset)<Math.max(1.4,NATIVE_MODULES.Door_1.width/2+.2)+size[0]*scale/2) return;
      const wx=x+(horizontal?offset:0)+nx*.045,wz=z+(horizontal?0:offset)+nz*.045;
      const bounds={position:[wx+nx*size[2]*scale/2,bottom+size[1]*scale/2,wz+nz*size[2]*scale/2],size:[(horizontal?size[0]:size[2])*scale,size[1]*scale,(horizontal?size[2]:size[0])*scale]};
      if (Math.abs(bounds.position[0])+bounds.size[0]/2>11.5 || Math.abs(bounds.position[2])+bounds.size[2]/2>11.5) return;
      if (y===.65 && nz===1 && Math.abs(z-entrance.z)<.01 && Math.abs(wx)<entryWidth/2+.12+size[0]*scale/2) return;
      if (slots.some(slot=>slot.active && overlaps(bounds,slot))) return;
      if (advertising.signs.some(sign=>overlaps(bounds,{position:[sign.x,sign.y,sign.z],size:[sign.rotation? .6:sign.width,sign.height,sign.rotation?sign.width:.6]}))) return;
      attach(asset,wx,bottom,wz,angle,scale,role);
    };
    if (detailAllowed && lod === "near") {
      // Paired narrow pilasters finish both faces of convex corners, not courtyard elbows.
      for (const direction of [-1,1]) {
        const endX=x+(horizontal?direction*length/2:0),endZ=z+(horizontal?0:direction*length/2);
        if (kit?.corners!=="matching" && corners.some(c=>!nativeCorners.has(c) && c.kind==="convex" && c.y===y && Math.abs(c.x-endX)<.01 && Math.abs(c.z-endZ)<.01))
          addDetail(column[0],direction*(length/2-columnWidth/2),columnBottom,columnScale,[column[1],column[2],column[3]],"column");
      }
      if ((!kit?.roofline || kit.roofline==="existing") && !roofActive && top && d.roof==="parapet" && (!d.roofVariant || d.roofVariant==="standard")) {
        // A single curated crown course, never the old cornice on every storey edge.
        const crownScale=.4, crownWidth=.8;
        for(const offset of fitBays(length,crownWidth,0,.45))
          addDetail(family[2],offset,y+height-.04,crownScale,[2,1,detailArchitecture==="brick"?.62:.3],"cornice");
      }
    }
    if (facadeEnabled) {
      // Centre-only WhiteBrick sections require proprietary neighbours. Use its
      // complete perimeter module for standalone cells and measured native fillers.
      const frontAsset = y===.65 && nz===1 && kit?.frontage && kit.frontage!=="existing" ? ({cafe:"Brick_Inset_Window",boutique:"Marble_ShopWindow",department:"Trim_FirstFloor_Window"} as const)[kit.frontage] : undefined;
      const windowAsset = frontAsset ?? nativeChoice?.asset ?? (detailArchitecture === "brick" ? (d.facadeSeed%3===0 ? "Brick_RedWhite_DoubleWindow" : "Brick_Window_Square_Single")
        : detailArchitecture === "boutique" ? (y===.65 && d.base==="storefront" ? "Marble_ShopWindow" : "Marble_Window_Single")
        : detailArchitecture === "creative" ? "WhiteBrick_Window"
        : y===.65 ? "Metal_FirstFloor_Window" : "Metal_Window");
      const module=NATIVE_MODULES[windowAsset], nativeW=module.span,nativeH=module.height;
      const gap=detailAllowed?columnWidth+.04:.12;
      const endInset=(direction:number)=>2*([...nativeCorners].find(([c])=>c.y===y && Math.abs(c.x-(x+(horizontal?direction*length/2:0)))<.001 && Math.abs(c.z-(z+(horizontal?0:direction*length/2)))<.001)?.[1] || 0);
      const leftInset=endInset(-1),rightInset=endInset(1),usable=length-leftInset-rightInset,shift=(leftInset-rightInset)/2;
      // Treat the footprint as a packing envelope: keep the chosen panel's
      // proportions, then use native head/sill infill rather than dropping it.
      const projection=Math.max(0,module.depth-module.face);
      const projectionRoom=11.5-Math.abs(horizontal?z:x);
      const frontageClearWidth=frontAsset?Math.max(entryWidth,...slots.filter(s=>s.active&&(s.selected==="brand"||s.selected==="campaign")&&s.rotation===0&&Math.abs(s.position[0])<.01&&Math.abs(s.position[2]-z)<.6&&s.position[1]-s.size[1]/2<y+height).map(s=>s.size[0]+.2)):entryWidth;
      const leftRoom=(-x-frontageClearWidth/2)-(-length/2+leftInset),rightRoom=(length/2-rightInset)-(-x+frontageClearWidth/2);
      const frontScale=frontAsset?Math.max(.01,Math.min(leftRoom,rightRoom)-.3)/nativeW:Infinity;
      const windowScale=Math.min(height/nativeH,Math.max(.01,usable-.2)/nativeW,projection>0?projectionRoom/projection:Infinity,frontScale);
      const width=nativeW*windowScale,windowHeight=nativeH*windowScale;
      const windowBottom=y===.65?0:(height-windowHeight)/2;
      const offsets=frontAsset && Math.min(leftRoom,rightRoom)>.5
        ? [-x-frontageClearWidth/2-.15-width/2,-x+frontageClearWidth/2+.15+width/2]
        : fitBays(usable,width,gap,.1).map(offset=>offset+shift);
      const bays=offsets.filter((offset,index)=>{
        if((d.stairExtension==="spiral" || d.stairExtension==="straight") && nx===1 && Math.abs(z+offset)<width/2+(d.stairExtension==="straight"?3.7:1.3))return false;
        if(extensionWall===wall && Math.abs(offset)<width/2+1.1)return false;
        if((d.solidSideWalls && nx!==0)||(y===.65 && d.base==="plinth")||(y>.65 && d.rhythm==="alternating" && (index+d.facadeSeed)%2===0))return false;
        const bounds={position:[x+(horizontal?offset:0),y+height/2,z+(horizontal?0:offset)],size:[horizontal?width:.6,height,horizontal?.6:width]};
        return !slots.some(slot=>slot.active && (slot.selected==="brand"||slot.selected==="campaign") && overlaps(bounds,slot));
      }).map(center=>({center,width,bottom:windowBottom,top:windowBottom+windowHeight}));
      const doors:{left:number;right:number;bottom:number;top:number}[]=[];
      if(y===.65 && nz===1 && Math.abs(z-entrance.z)<.01 && Math.abs(x)<length/2)
        doors.push({left:-x-entryWidth/2,right:-x+entryWidth/2,bottom:0,top:entryBase-.65+entryModule.height*entryScale});
      if(extensionWall===wall)doors.push({left:-NATIVE_MODULES.Door_1.width/2,right:NATIVE_MODULES.Door_1.width/2,bottom:stairLanding-y,top:stairLanding-y+NATIVE_MODULES.Door_1.height});
      const rects=partitionNativeWall(usable,height,bays.map(b=>({...b,center:b.center-shift})),doors.map(r=>({...r,left:r.left-shift,right:r.right-shift}))).map(r=>({...r,left:r.left+shift,right:r.right+shift}));
      const dependencies=new Set<string>([family[1],...(leftInset||rightInset?[cornerAsset]:[])]);
      for(const rect of rects){
        if(rect.kind==="door"){dependencies.add(extensionWall===wall?"Door_1":entryLeaf);if(extensionWall!==wall)dependencies.add(entryAsset);continue;}
        const offset=(rect.left+rect.right)/2, asset=rect.kind==="window"?windowAsset:family[1];
        const depthScale=rect.kind==="window"?windowScale:height/3;
        const rear=-NATIVE_MODULES[asset].face*depthScale;
        const cellCenter=rect.kind==="window"?module.center*windowScale:0;
        attach(asset,x+(horizontal?offset:0)+nx*rear-Math.cos(angle)*cellCenter,y+rect.bottom,z+(horizontal?0:offset)+nz*rear+Math.sin(angle)*cellCenter,angle,rect.kind==="window"?windowScale:1,"facade");
        if(rect.kind==="solid")attachments.at(-1)!.axisScale=[(rect.right-rect.left)/2,(rect.top-rect.bottom)/3,height/3];
        dependencies.add(asset);
        if(rect.kind==="window" && nativeChoice?.overlay){
          const overlay=NATIVE_MODULES[nativeChoice.overlay];
          const depth=(.04-overlay.face)*windowScale;
          attach(nativeChoice.overlay,x+(horizontal?offset:0)+nx*depth,y+rect.bottom+(windowHeight-overlay.height*windowScale)/2,z+(horizontal?0:offset)+nz*depth,angle,windowScale,"facade");
          dependencies.add(nativeChoice.overlay);
        }
      }
      // Native wall tiles replace the backing shell only after all required pieces load.
      attach(family[1],x-nx*.18,y+height-.25,z-nz*.18,angle,1,"band");
      // The band face sits 4 cm outside the wall; extend its ends to that same corner.
      attachments.at(-1)!.axisScale=[(length+.08)/2,.18/3,1.1];
      parts[wallIndex+1].fallback="facade";
      parts[wallIndex+1].fallbackAsset=family[1];
      parts[wallIndex].fallback="facade";
      parts[wallIndex].fallbackAssets=[...dependencies];
      if(detailAllowed && lod==="near" && kit?.corners!=="matching")for(let i=1;i<offsets.length;i++)
        addDetail(column[0],(offsets[i-1]+offsets[i])/2,columnBottom,columnScale,[column[1],column[2],column[3]],"column");
      continue;
    }
    for (
      const offset of fitBays(length, bayWidth, residential ? .65 : facadeEnabled ? 0 : .35, residential ? (d.connectedArchitecture?.openingLayout==="paired"?.55:1.2) : undefined)
    ) {
      const wx = x + (horizontal ? offset : 0),
        wz = z + (horizontal ? 0 : offset);
      const door = Math.abs(y - .65) < .01 && nz === 1 &&
        Math.abs(wz - entrance.z) < .01 && Math.abs(wx) < (bayWidth / 2 + (d.finish!=="procedural" ? entryWidth/2+.12 : 1.4));
      const reserved = slots.some((s) =>
        s.active && (s.selected === "brand" || s.selected === "campaign") &&
        overlaps({
          position: [wx + nx * .2, y + height / 2, wz + nz * .2],
          size: [
            horizontal ? bayWidth : .6,
            height,
            horizontal ? .6 : bayWidth,
          ],
        }, s)
      );
      const serviceDoor=extensionWall===wall && Math.abs(offset)<bayWidth/2+NATIVE_MODULES.Door_1.width/2+.12;
      if (door || reserved || serviceDoor || ((d.stairExtension==="spiral" || d.stairExtension==="straight") && nx===1 && Math.abs(wz)<bayWidth/2+(d.stairExtension==="straight"?3.7:1.3))) continue;
      if (y === .65 && d.base === "plinth") continue;
      const panel = y > .65 && d.rhythm === "alternating" &&
        (Math.round(offset / bayWidth) + d.facadeSeed) % 2 === 0;
      const balcony=!panel && residential && !!d.connectedArchitecture?.balconies && y>.65 && nz===1 && offset>=0 && offset<1.3 && z+1.3<10.6;
      const winH = panel?height-.6:balcony?2.35: residential ? (d.connectedArchitecture?.openingLayout==="compact"?1.2:1.4) : Math.min(
        height - .65,
        y === .65
          ? (d.base === "storefront" ? height - .75 : height - 1.1)
          : d.rhythm === "ribbon"
          ? 1.2
          : d.architecture === "glass"
          ? height - .75
          : 1.7,
      );
      const windowCenter=panel?y+height/2:balcony?y+.18+winH/2:residential?y+.9+winH/2:y+height*.5;
      if(balcony){
        balconyCount++;
        box(wx,y+.1,wz+.6,2.2,.16,1.3,p.trim);
        box(wx,y+.75,wz+1.22,2.2,1.1,.07,p.trim);
        for(const side of [-1,1])box(wx+side*1.07,y+.75,wz+.6,.06,1.1,1.2,p.trim);
      }
      openings.push({offset,height:winH,centerY:windowCenter});
      if(residential && y===.65)openingEnvelopes.push({label:"Window opening",position:[wx,windowCenter,wz],size:horizontal?[bayWidth,winH,.08]:[.08,winH,bayWidth]});
      box(
        wx - nx * .14,
        windowCenter,
        wz - nz * .14,
        horizontal ? bayWidth : .04,
        winH,
        horizontal ? .04 : bayWidth,
        panel ? p.trim : p.glass,
        facadeEnabled && d.rhythm !== "ribbon" && y > .65
          ? "facade"
          : undefined,
      );
      if(!panel && d.windowFamily==="arched" && d.finish==="procedural") {
        const pane=parts.at(-1)!;
        pane.kind="archedPane";
        pane.size=[bayWidth,winH,.04];pane.rotation=angle;
        parts.push({kind:"archInfill",position:[wx-nx*.15,windowCenter,wz-nz*.15],size:[bayWidth,winH,.3],rotation:angle,color:p.wall,textureRole:"wall"});
      }

    }
    if(d.windowFamily && d.finish==="procedural" && lod!=="far" && (!residential || lod==="near"))for(const opening of openings){
      for(const detail of windowDetails(d.windowFamily,bayWidth,opening.height,p.trim)) {
        const [dx,dy,dz]=detail.position;
        parts.push({...detail,position:[x+(horizontal?opening.offset+dx:0)+nx*dz,opening.centerY+dy,z+(horizontal?0:opening.offset+dx)+nz*dz],size:horizontal?detail.size:[detail.size[2],detail.size[1],detail.size[0]]});
      }
    }
    // A serving counter belongs to a real front window, never to an arbitrary
    // preset coordinate. It ends at the jambs and sits below the glass.
    if(d.archetype==="kiosk" && d.finish==="procedural" && y===.65 && nz===1 && lod!=="far") {
      for(const opening of openings){
        const sillY=y+height/2-opening.height/2;
        box(x+opening.offset,sillY-.07,z+.14,bayWidth,.14,.38,p.trim);
      }
    }
    if(residential && lod==="near")for(const opening of openings){
      const cx=x+(horizontal?opening.offset:0),cz=z+(horizontal?0:opening.offset),bottom=opening.centerY-opening.height/2;
      const detail=(offset:number,cy:number,w:number,h:number,depth:number,color:string)=>box(cx+(horizontal?offset:0)+nx*.1,cy,cz+(horizontal?0:offset)+nz*.1,horizontal?w:depth,h,horizontal?depth:w,color);
      detail(0,bottom-.06,bayWidth+.16,.12,.28,p.trim);
      detail(0,bottom+opening.height+.06,bayWidth+.16,.12,.2,p.trim);
      if(d.connectedArchitecture?.shutters && openings.every(o=>o===opening||Math.abs(o.offset-opening.offset)>bayWidth+1) && Math.abs(opening.offset)+bayWidth/2+.55<length/2-.3)for(const side of [-1,1])detail(side*(bayWidth/2+.24),opening.centerY,.4,opening.height,.13,p.roof);
      if(d.connectedArchitecture?.windowBoxes && y===.65)detail(0,bottom-.23,bayWidth,.25,.42,"#6c8254");
    }
    if (connected || openings.length || extensionWall===wall) {
      // Windows and service doors reserve actual holes in the procedural shell.
      // Leaving a default wall pier here previously put it through the door.
      parts.splice(wallIndex,1);
      const innerHeight=height-.36;
      const bays=openings.map(o=>({center:o.offset,width:bayWidth,bottom:o.centerY-y-.18-o.height/2,top:o.centerY-y-.18+o.height/2}));
      const doorCuts=extensionWall===wall ? [{left:-NATIVE_MODULES.Door_1.width/2-.06,right:NATIVE_MODULES.Door_1.width/2+.06,bottom:stairLanding-y-.18,top:stairLanding-y-.18+NATIVE_MODULES.Door_1.height+.06}] : [];
      if(d.finish!=="facade" && y===.65 && nz===1 && Math.abs(z-entrance.z)<.01 && Math.abs(x)<length/2) doorCuts.push({left:-x-1,right:-x+1,bottom:0,top:2.4-.18});
      for(const rect of partitionNativeWall(length,innerHeight,bays,doorCuts)){
        if(rect.kind!=="solid")continue;
        const left=connected && d.generatorRevision==="city-connected-3" && Math.abs(rect.left+length/2)<.00001?range.left:Math.max(rect.left,range.left),right=connected && d.generatorRevision==="city-connected-3" && Math.abs(rect.right-length/2)<.00001?range.right:Math.min(rect.right,range.right);
        if(right-left<.00001)continue;
        const along=(left+right)/2,w=right-left,h=rect.top-rect.bottom;
        box(x+(horizontal?along:0)-nx*.15,y+.18+rect.bottom+h/2,z+(horizontal?0:along)-nz*.15,
          horizontal?w:.3,h,horizontal?.3:w,p.wall);
        if(connected)parts.at(-1)!.squareEdges=true;
      }
    }
  }
  if(d.finish==="procedural" && d.doorFamily && d.doorFamily!=="automatic")parts.push(...proceduralEntrance(d.doorFamily,d.doorSurround||"framed",!!d.doorTransom,entrance.z,p,lod));
  else {
  box(0, 1.85, entrance.z + (d.finish === "procedural" ? -.16 : .12), 2, 2.4, d.finish === "procedural" ? .04 : .2, p.glass);
  if(d.finish!=="procedural"){parts.at(-1)!.fallback="facade";parts.at(-1)!.fallbackAssets=[entryAsset,entryLeaf];}
  }
  const frontAssembly=frontStructure(chosenEntry?"standard":d.entranceStyle, d.blueprint, entrance.z, masses[0].width, d.groundHeight, p.wall, p.trim);
  if(facadeEnabled && lod!=="far" && d.entranceStyle==="portico" && !frontAssembly.reason && frontAssembly.envelope){
    const archScale=Math.min(d.groundHeight/4.44324,frontAssembly.envelope.size[0]/4.04074,frontAssembly.envelope.size[2]/1.22758);
    attach("Prop_EntranceArch",0,.25,entrance.z+.05,0,archScale,"entrance");
    for(const part of frontAssembly.parts){part.fallback="facade";part.fallbackAsset="Prop_EntranceArch";}
  }
  parts.push(...frontAssembly.parts);
  const canopy = slots.find((s) => s.id === "canopy.entrance")!;
  if (canopy.active && !(d.generatorRevision==="city-connected-3" && d.connectedArchitecture?.porch && d.connectedArchitecture.porch!=="none")) {
    box(...canopy.position, ...canopy.size, brand);
    if(kit?.frontage && kit.frontage!=="existing"){parts.at(-1)!.fallback="facade";parts.at(-1)!.fallbackAsset="Prop_Awning_Long";}
  }
  if (d.finish !== "procedural" && lod !== "far") {
    for (let z = entrance.z + .3; z + 2 <= 11.4; z += 2) {
      attach("Floor_2x2", 0, .3, z, 0, 1, "paving");
    }
    {
      // One measured native entrance owns both accents and full-facade modes.
      // Accents sit in front of the procedural wall; facade mode has a real opening.
      const entryFace=entrance.z+(facadeEnabled?0:.3);
      if(entryStep)attach(entryStep,0,.25,entrance.z,0,entryScale,"steps");
      attach(entryAsset,-entryModule.center*entryScale,entryBase,entryFace-entryModule.face*entryScale,0,entryScale,"door");
      const opening=entryModule.opening;
      if(opening){
        const door=NATIVE_MODULES[entryLeaf];
        const openingWidth=(opening.right-opening.left)*entryScale,openingHeight=opening.top*entryScale;
        const count=Math.max(1,Math.round(openingWidth/(door.width*openingHeight/door.height)));
        // Uniformly fit native leaves to the measured frame aperture. The tiny
        // seating overlap is behind its reveal, not coplanar with the wall.
        const leafScale=Math.max(openingWidth/count/door.width,openingHeight/door.height)*1.002;
        for(let i=0;i<count;i++)attach(entryLeaf,((opening.left-entryModule.center)*entryScale)+(i+.5)*openingWidth/count,entryBase,entryFace-door.face*leafScale-.012,0,leafScale,"door");
      }
    }
  }
  const entranceWall = walls.find(w => w.y === .65 && w.nz === 1 && Math.abs(w.z - entrance.z) < .001 && Math.abs(w.x) < w.length / 2);
  const frontage = entranceWall ? 2 * Math.min(entranceWall.length / 2 - entranceWall.x, entranceWall.length / 2 + entranceWall.x) : masses[0].width;
  parts.push(...archetypeParts(d.archetype, frontage, masses[0].depth, entrance.z, d.groundHeight, p.trim, brand, lod, d.finish!=="procedural" ? [entryAsset,entryLeaf] : undefined));
  if (d.generatorRevision!=="city-connected-3" && !roofActive && d.roofVariant && d.roofVariant !== "standard") {
    const tops = masses.filter(m => !masses.some(upper => Math.abs(upper.y-m.y-m.height)<.001 && Math.abs(upper.x-m.x)<upper.width/2 && Math.abs(upper.z-m.z)<upper.depth/2));
    for (const m of tops) {
      const count = d.roofVariant === "sawtooth" ? 3 : 1;
      for (let i=0;i<count;i++) parts.push({kind:d.roofVariant === "mansard" ? "mansard" : d.roofVariant === "hip" ? "hip" : "shed", position:[m.x,m.y+m.height+(d.roofVariant==="mansard"?1.1:.7),m.z-m.depth/2+(i+.5)*m.depth/count],size:[m.width,d.roofVariant==="mansard"?2.2:1.4,m.depth/count],color:p.roof});
    }
  }
  const lastY = masses.at(-1)!.y;
  if (d.generatorRevision!=="city-connected-3" && !roofActive && d.roof === "pitched" && (!d.roofVariant || d.roofVariant === "standard")) {
    const m = masses.at(-1)!;
    parts.push({
      kind: "roof",
      position: [m.x, m.y + m.height + .7, m.z],
      size: [m.width, 1.4, m.depth],
      color: p.roof,
    });
  }
  if (!roofActive && (!d.roofVariant || d.roofVariant === "standard") && (d.roof === "planted" || d.crown === "terrace")) {
    for (const m of masses.filter((m) => m.y === lastY)) {
      box(
        m.x,
        m.y + m.height + .12,
        m.z,
        Math.max(1, m.width - 1),
        .24,
        Math.max(1, m.depth - 1),
        "#718d64",
      );
      if (lod === "near") {
        box(m.x, m.y + m.height + .35, m.z, 1.3, .45, 1.3, p.trim);
      }
    }
  }

  if (lod !== "far") {
    for (
      const slot of slots.filter((s) =>
        s.active && (s.selected === "planter" || s.selected === "bollards")
      )
    ) {
      const [x, y, z] = slot.position;
      const groundStart=parts.length;
      if (slot.selected === "bollards") {
        for (const dx of [-.6, .6]) box(x + dx, .75, z, .18, 1, .18, p.trim);
      } else {
        const terrace = slot.id.startsWith("terrace."), w = terrace ? 1.1 : 1.7;
        box(
          x,
          y - slot.size[1] / 2 + .25,
          z,
          w,
          .5,
          w,
          p.trim,
          d.finish !== "procedural" && !terrace && lod === "near" ? "props" : undefined,
        );
        if (lod === "near" && d.finish !== "procedural" && !terrace) {
          parts.at(-1)!.fallbackAsset = "Prop_Planter_Single";
          attach("Prop_Planter_Single", x, .25, z - 1, 0, 1, "props");
        }
        for (
          const offset of !terrace && d.density === "full"
            ? [-.35, 0, .35]
            : [0]
        ) {
          parts.push({
            kind: "tree",
            position: [x + offset, y + (terrace ? .1 : .25), z],
            size: terrace
              ? [.45, .45, .45]
              : d.density === "full"
              ? [.45, .6, .45]
              : [.7, .7, .7],
            color: "#648657",
          });
        }
      }
      if(slot.id.startsWith("ground."))for(const part of parts.slice(groundStart))part.sceneLayer="grounds";
    }
  }
  if (lod === "near" && d.finish === "procedural") {
    for (const corner of corners) {
      // Narrow procedural corner posts preserve clearance where 2 m native blocks cannot fit.
      if (corner.kind === "convex") {
        box(
          corner.x,
          corner.y + corner.height / 2,
          corner.z,
          .14,
          corner.height,
          .14,
          p.trim,
        );
      }
    }
  }
  const kitResult=kit ? architecturalDetails({kit,family:detailArchitecture,walls,corners,masses,entrance:{z:entrance.z,width:entryWidth},slots,signs,lod,roofActive,equipmentAllowed:!roofActive && (d.roof==="flat"||d.roof==="parapet") && (!d.roofVariant||d.roofVariant==="standard") && d.crown!=="terrace",seed:d.facadeSeed,clearances:extensionWall?[{position:[extensionWall.x,stairLanding+NATIVE_MODULES.Door_1.height/2,extensionWall.z],size:[.8,NATIVE_MODULES.Door_1.height+.2,NATIVE_MODULES.Door_1.width+.3]}]:(escape?.bounds?[escape.bounds]:[])}) : {parts:[],attachments:[],notes:[]};
  // Connected planters replace their single-piece counterpart only when the run fits.
  for(const a of kitResult.attachments.filter(a=>a.role==="planter-run"&&a.asset==="Prop_Planter_Center")){
    const index=attachments.findIndex(old=>old.asset==="Prop_Planter_Single"&&Math.abs(old.position[0]-a.position[0])<.01);
    if(index>=0)attachments.splice(index,1);
    for(const part of parts)if(part.fallbackAsset==="Prop_Planter_Single"&&Math.abs(part.position[0]-a.position[0])<.01)part.fallbackAssets=["Prop_Planter_Side_L","Prop_Planter_Center","Prop_Planter_Side_R"];
  }
  parts.push(...kitResult.parts);
  attachments.push(...kitResult.attachments);
  parts.push(...advertising.parts);
  if(escape?.bounds && lod!=="far") {
    // The stair envelope owns projecting decoration, never structural wall panels.
    for(let i=attachments.length-1;i>=0;i--) {
      const a=attachments[i];
      if(["cornice","column","accent","band","canopy","planter","rails"].includes(a.role) && KIT_DIMENSIONS[a.asset] && overlaps(escape.bounds,attachmentBounds(a))) attachments.splice(i,1);
    }
    attachments.push(...escape.attachments);
  }

  if((d.stairExtension==="spiral" || d.stairExtension==="straight")){
    const stairs=(d.stairExtension==="straight"?straightStair:spiralStair)(masses,p.trim);
    extensionReason=stairs.reason;
    if(d.roof!=="flat" || roofActive || (d.roofVariant && d.roofVariant!=="standard"))extensionReason="Exterior roof access requires a flat roof without a native roof assembly.";
    if(!extensionReason && stairs.bounds){
      const conflict=signs.some(sign=>overlaps(stairs.bounds!,{position:[sign.x,sign.y,sign.z],size:[sign.rotation?.6:sign.width,sign.height,sign.rotation?sign.width:.6]}));
      if(conflict)extensionReason="A sign occupies the stair clearance. Move that sign to enable the stairs.";
      else {
        for(let i=attachments.length-1;i>=0;i--){const a=attachments[i];if(["cornice","column","accent","band","canopy","planter","rails"].includes(a.role)&&KIT_DIMENSIONS[a.asset]&&overlaps(stairs.bounds,attachmentBounds(a)))attachments.splice(i,1);}
        parts.push(...stairs.parts);
      }
    }
  }
  const connectedNotes:string[]=[],assemblyEnvelopes:AssemblyEnvelope[]=[...openingEnvelopes],roofContours:[number,number][][]=[];
  if(d.generatorRevision==="city-connected-3"){
    const o=d.connectedArchitecture||{};
    if(o.balconies && !balconyCount)connectedNotes.push("Balconies need an upper-floor front opening and clear space inside the plot. The selection is retained.");
    const profile=d.roofVariant&&d.roofVariant!=="standard"?d.roofVariant:d.roof==="pitched"?"gable":"flat";
    const roof=connectedRoof(masses,profile,o,p,lod);
    if(!roofActive){parts.push(...roof.parts);roofContours.push(...roof.faces.map(f=>f.polygon));}
    else connectedNotes.push("The native roof assembly owns this roof. Select Existing roof to use the procedural roof controls.");
    connectedNotes.push(...roof.notes);
    const porch=connectedPorch(masses,o,p,entrance.z);
    const conflict=porch.envelopes.some(e=>signs.some(sign=>!(slots[0].active && sign.x===slots[0].position[0] && sign.y===slots[0].position[1]) && overlaps(e,{position:[sign.x,sign.y,sign.z],size:[sign.rotation?.6:sign.width,sign.height,sign.rotation?sign.width:.6]})));
    const stairBounds=d.stairExtension==="straight"?straightStair(masses,p.trim).bounds:d.stairExtension==="spiral"?spiralStair(masses,p.trim).bounds:escape?.bounds;
    const stairConflict=!!stairBounds && porch.envelopes.some(e=>overlaps(e,stairBounds));
    if(stairConflict)connectedNotes.push("The porch intersects the exterior stairs. Choose a different porch to restore it.");
    else if(conflict)connectedNotes.push("The porch intersects a sign. Move the sign to restore the porch.");
    else {parts.push(...porch.parts);assemblyEnvelopes.push(...porch.envelopes);}
    connectedNotes.push(...porch.notes);
    if(residential && authored.finish!=="procedural")connectedNotes.push("Residential openings retain their fitted procedural assembly; native facade choices are preserved for compatible commercial designs.");
  }
  return {
    roofContours,
    assemblyEnvelopes,
    parts,
    attachments,
    walls,
    masses,
    entrance,
    sign,
    kitNotes:[...connectedNotes,...(roofReason?[roofReason]:[]),...kitResult.notes],
    extensionReason,
    slots,
    signs,
    corners,
  };
}

function resolveSynarcKitV3(d:CityBuildingDesignV3,lod:'near'|'medium'|'far'):ResolvedV3{
  const masses=massesV3(d),walls=exposedWalls(masses),levels=[...new Set(masses.map(m=>m.y))].sort((a,b)=>a-b);
  const assembly=assembleSynarcKit(walls.map(w=>({...w,floor:levels.findIndex(y=>Math.abs(y-w.y)<.001)})),d.synarcKit!);
  const parts:DesignPart[]=[
    {kind:'box',position:[0,.22,0],size:[22.7,.12,22.7],color:d.palette.trim,sceneLayer:'grounds'},
    ...groundsParts(d,lod),
    ...walls.map(w=>({kind:'box' as const,position:[w.x,w.y+w.height/2,w.z] as [number,number,number],
      size:[w.nz?w.length:.3,w.height,w.nx?w.length:.3] as [number,number,number],color:d.palette.wall,
      fallback:'facade' as const,squareEdges:true})),
    ...assembly.infill.map(b=>({kind:'box' as const,position:[b.x,b.y,b.z] as [number,number,number],
      size:[b.width,b.height,b.depth] as [number,number,number],rotation:b.rotation,color:d.palette.wall,squareEdges:true})),
  ];
  const profile=d.roofVariant&&d.roofVariant!=='standard'?d.roofVariant:d.roof==='pitched'?'gable':'flat';
  const roof=connectedRoof(masses,profile,d.connectedArchitecture??{},d.palette,lod);
  parts.push(...roof.parts);
  const slots=buildingSlots(d,masses),signs:DesignSign[]=slots.filter(s=>s.active&&(s.selected==='brand'||s.selected==='campaign')).map(s=>({
    x:s.position[0],y:s.position[1],z:s.position[2],width:s.rotation?s.size[2]:s.size[0],
    height:s.size[1],rotation:s.rotation,campaign:s.selected==='campaign',
  }));
  const front=walls.filter(w=>w.nz>.5&&w.y===levels[0]).sort((a,b)=>b.z-a.z)[0];
  const entrance={x:assembly.entrance?.x??front?.x??0,z:assembly.entrance?.z??front?.z??d.depth/2};
  return {parts,attachments:[],walls,masses,entrance,
    sign:{...entrance,y:d.groundHeight-.5,width:3,height:.6},
    synarcKitAssembly:assembly,roofContours:roof.faces.map(f=>f.polygon),assemblyEnvelopes:[],
    kitNotes:[...roof.notes,...assembly.inactive.map(p=>p.reason)],extensionReason:null,slots,signs,
    corners:classifyCorners(masses)};
}
