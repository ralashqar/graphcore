// Studio UI v2 state (docs/city-studio-ui-v2.md): the rail tool, Select granularity and selection, the brush target
// and size, and every recipe action the palettes, inspector, hotbar and keyboard share. The interaction hook stays the
// one place that turns pointer gestures into edits; this hook decides which of its tools is active.
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useThree} from '@react-three/fiber';
import type {PerspectiveCamera} from 'three';
import {STAMP_MAP,STUDIO_STOREFRONT_STAMPS,protectedStorefrontAtBay} from '../../../domain/cityStorefrontStamps';
import {enableBuildingVariation,previewStorefront,shuffleVariation} from '../../../domain/cityBuildingVariation';
import {shuffleFacadeRhythm} from '../../../domain/cityStudioFacadeRhythm';
import {removeFreeOpening} from '../../../domain/cityStudioFreeOpenings';
import {pruneFreeTrims,toggleFreeTrim,freeTrimKinds,type TrimKind} from '../../../domain/cityStudioTrimParts';
import {ROOF_OPENING_PRESETS,removeRoofOpening} from '../../../domain/cityStudioRoofOpenings';
import {fillPaintFace,paintRegionAt,recolorPaintRegion,erasePaintAt} from '../../../domain/cityStudioPaintRegions';
import {checkStudioDraft,liftStudioAnchors,freshStudio,paintStudioStroke,studioDraft,studioStyle,upgradeStudio} from '../../../domain/cityStudio';
import {furniturePlacementIssue} from '../../../domain/cityStudioFurniture';
import {STUDIO_COLORS,STUDIO_FAMILIES,STUDIO_MODULE_MAP,studioKitVersion} from '../../../domain/cityStudioCatalog';
import {applyComposition} from '../../../domain/cityBuildingV3';
import {studioExample} from '../../../domain/cityStudioExamples';
import {createFootState,type ExplorationSession} from '../../../domain/cityExploration';
import {landEntrance} from '../../../domain/cityLand';
import type {SculptVolume} from '../../../domain/citySculpt';
import type {StudioAnchor,StudioAssemblyKind,StudioBay,StudioChannel,StudioFurnitureKind,StudioRecipe,StudioRoom,StudioRoomFinish} from '../../../domain/cityStudioTypes';
import {useStudioInteraction,studioOutlineHandles,type StudioPick,type StudioTool} from '../useStudioInteraction';
import type {OutlineCornerMode,OutlineEdgeMode} from './studioHandles';
import {outlineRemovalSummary,splitStudioPartAtStorey} from '../../../domain/cityStudioOutlineEdit';
import {preparedStudioPlot} from '../cityStudioRegistry';
import {prepareSculpt} from '../citySculptService';
import {setSculptPreview,clearSculptPreview} from '../citySculptPreview';
import {clearStudioFloorView,setStudioFloorView,type StudioFloorView} from '../cityStudioView';
import {freeModuleTrayId,freeOpeningTrimChoices,freePresetFor} from '../studioFreeOpeningTool';
import {ownedPaintHit,type OwnedPaintHit} from '../studioPaintRegionTool';
import {useRhythmPanel} from '../CityRhythmPanel';
import {usePaintRules} from '../CityPaintRulesPanel';
import {useUnifiedFacade} from '../CityUnifiedFacade';
import {studioCueForEdit,studioJuiceBursts,type JuiceBurst} from '../studioJuice';
import {onStudioAudioMuted,playStudioCue,studioAudioMuted} from '../studioAudio';
import {studioDeleteTarget,studioDuplicateTarget} from '../studioKeys';
import {STUDIO_DICE_KEY,studioFloorStep} from '../studioTools';
import type {PaintRingChoice} from '../CityStudioPaintRing';
import {STUDIO_FOCUS_KEY,STUDIO_HELP_KEY,brushSizesFor,cycleSelectLevel,drillSelectLevel,studioCategoryFor,studioRailForKey,type StudioBrushSize,type StudioBrushTarget,type StudioRailTool,type StudioSelectLevel} from '../studioRail';
import {NO_SELECTION,assembliesAt,eraseStudioItems,kitOpeningAt,removeStudioOpenings,sameOpening,sameWall,selectionPart,stepUpSelection,toggleIn,ERASE_LABELS,type StudioEraseWhat,type StudioOpeningRef,type StudioSelection,type WallRef} from '../studioSelection';
import {useStudioCamera,type StudioViewKind} from './useStudioCamera';
import type {StudioStyleFilter} from './studioStyles';
import {useStudioHotbar,type HotbarItem} from './useStudioHotbar';
import type {CityLandController} from '../useCityLand';

export type BuildShape='block'|'round'|'oval'|'cut'|'outline';
export type OpeningGroup='Freeform'|'Windows'|'Doors'|'Walls';
export type RoofMode='roof'|'roof-opening'|'roof-detail';
type RoomsTool='interior-room'|'interior-partition'|'interior-door'|'interior-stair';
type FurnishTool='interior-furniture-select'|'interior-furniture';
const ASSEMBLY_KINDS:readonly StudioAssemblyKind[]=['balcony','cornice','canopy','stair','pilaster','ornament','planter','light'];
const ERASE_BY_TARGET:Record<StudioBrushTarget,StudioEraseWhat>={material:'paint',openings:'openings',storefronts:'storefronts',trims:'trims',decor:'decor',roof:'roof'};

export function useStudioState({land,session,camera,reduced}:{land:CityLandController;session:ExplorationSession;camera:PerspectiveCamera;reduced:boolean}){
 const plot=land.selected!,draft=land.draft!,recipe=draft.sculpt?.version===5||draft.sculpt?.version===6?draft.sculpt:null,walking=land.phase==='walkthrough';
 const {gl}=useThree();
 const cam=useStudioCamera({land,plot,draft,recipe,camera,reduced,walking});
 const latestDraft=useRef(draft);latestDraft.current=draft;
 const kitVersion=studioKitVersion(recipe?.studio.catalogue);

 // ---- Tool model: rail tool → (granularity | brush target + size | sub-tool) → interaction tool ----------------
 const [rail,setRailState]=useState<StudioRailTool>('select');
 const [level,setLevelState]=useState<StudioSelectLevel>('part');
 const [selection,setSelectionState]=useState<StudioSelection>(NO_SELECTION);
 const [target,setTargetState]=useState<StudioBrushTarget>('material');
 const [size,setSizeState]=useState<StudioBrushSize>('tile');
 const [buildShape,setBuildShape]=useState<BuildShape>('block');
 const [openingGroup,setOpeningGroup]=useState<OpeningGroup>('Freeform');
 const [openingKind,setOpeningKind]=useState<'free'|'kit'>('free');
 const [freePresetId,setFreePresetId]=useState('window');
 const [kitModule,setKitModule]=useState('window-sash');
 const [stampId,setStampId]=useState(STUDIO_STOREFRONT_STAMPS[0].id),[styleFilter,setStyleFilter]=useState<StudioStyleFilter>('all');
 const [trimKind,setTrimKind]=useState<TrimKind>('shutters');
 const [decorKind,setDecorKind]=useState<StudioAssemblyKind>('balcony');
 const [roofMode,setRoofMode]=useState<RoofMode>('roof');
 const [roomsTool,setRoomsTool]=useState<RoomsTool>('interior-room');
 const [furnishTool,setFurnishTool]=useState<FurnishTool>('interior-furniture-select');
 const [detailModule,setDetailModule]=useState(''),[roofPresetId,setRoofPresetId]=useState('skylight'),[roofModule,setRoofModule]=useState<string|null>(null),[roofRotation,setRoofRotation]=useState(0);
 const [floor,setFloor]=useState(0),[channel,setChannel]=useState<StudioChannel>('wall'),[color,setColor]=useState('#bdc8ad'),[texture,setTexture]=useState(''),[eyedropper,setEyedropper]=useState(false);
 const [destination,setDestination]=useState(1),[exitKind,setExitKind]=useState<'door'|'balcony'|'terrace'>('door'),[flip,setFlip]=useState(false),[look,setLook]=useState<'simple'|'ornate'>('simple');
 const [roofScope,setRoofScope]=useState<'part'|'connected'>('part');
 // Freeform brush: dab size in metres, full-width band mode, building-wide bands.
 const [freeBrush,setFreeBrush]=useState<number>(1),[band,setBand]=useState(false),[bandAround,setBandAround]=useState(false);
 const [outlineCornerMode,setOutlineCornerMode]=useState<OutlineCornerMode>('move'),[outlineEdgeMode,setOutlineEdgeMode]=useState<OutlineEdgeMode>('extrude');
 const [stairLayout,setStairLayout]=useState<'auto'|'straight'|'switchback'>('auto'),[stairEditing,setStairEditing]=useState<string|null>(null),[stairBusy,setStairBusy]=useState(false);
 const [interiorEditId,setInteriorEditId]=useState<string|null>(null),[floorViewMode,setFloorViewMode]=useState<StudioFloorView['mode']>('whole');
 const [interiorDoorStyle,setInteriorDoorStyle]=useState<'panelled'|'glazed'>('panelled'),[interiorDoorHinge,setInteriorDoorHinge]=useState<'left'|'right'>('left');
 const [selectedRoomId,setSelectedRoomId]=useState<string|null>(null),[furnitureKind,setFurnitureKind]=useState<StudioFurnitureKind>('table'),[furnitureRotation,setFurnitureRotation]=useState(0),[selectedFurnitureId,setSelectedFurnitureId]=useState<string|null>(null);
 // Panels: shortcut sheet, starters, overlapping-part chooser, replace confirm, palette and inspector drawers.
 const [help,setHelp]=useState(false),[starters,setStarters]=useState(false),[collection,setCollection]=useState(false),[parts,setParts]=useState(false),[replace,setReplace]=useState<number|null>(null);
 const [paletteOpen,setPaletteOpen]=useState(true),[inspectorOpen,setInspectorOpen]=useState(true),[rhythmOpen,setRhythmOpen]=useState(false),[variationOpen,setVariationOpen]=useState(false);

 const unifiedFacade=useUnifiedFacade({land,draft,recipe,plotId:plot.id,setIssue:message=>interaction.setIssue(message)});
 const unified=unifiedFacade.unified;
 const erase=rail==='erase';
 const category=studioCategoryFor(rail,target);
 const interior=category==='Rooms'||category==='Furniture';
 const sizes=brushSizesFor(target,erase),brushSize:StudioBrushSize=sizes.includes(size)?size:sizes[0]??'tile';
 const scope:'spot'|'wall'|'part'=target!=='material'?'spot':brushSize==='wall'?'wall':brushSize==='part'?'part':'spot';
 const paintBrush=brushSize==='free'?freeBrush:1,paintBand=brushSize==='free'&&band;
 const openingTool:StudioTool=openingKind==='free'||unified?'free-opening':'opening';
 const tool:StudioTool=rail==='select'?(level==='part'?'select':'pick')
  :rail==='build'?buildShape
  :rail==='paint'?(target==='material'?'surface':target==='openings'?openingTool:target==='storefronts'?'opening':target==='trims'?'pick':target==='decor'?decorKind:roofMode==='roof'?'roof-opening':roofMode)
  :rail==='erase'?(target==='material'&&(brushSize==='tile'||brushSize==='free')?'surface':'pick')
  :rail==='roof'?roofMode
  :rail==='garden'?'select'
  :rail==='rooms'?roomsTool:furnishTool;
 const freePreset=openingKind==='free'?freePresetFor(freePresetId):freePresetFor(freeModuleTrayId(kitModule));
 const freeArcade=tool==='free-opening'&&openingKind==='free'&&freePresetId==='arcade';
 const opening=target==='storefronts'?stampId:kitModule;

 /** The recipe as last edited (placement callbacks run before this render sees their commit). */
 const latestRecipe=()=>{const d=land.getDraft();return d?.sculpt?.version===5||d?.sculpt?.version===6?d.sculpt:recipe;};
 const commit=(next:StudioRecipe,label?:string)=>{const problem=checkStudioDraft(draft,next);if(problem){interaction.setIssue(problem);return false;}land.edit(studioDraft(draft,next),label?{label}:true);interaction.setIssue('');return true;};
 const paintRules=usePaintRules({recipe,commit:next=>commit(next),setIssue:message=>interaction.setIssue(message)});
 const rhythmPanel=useRhythmPanel({recipe,design:draft.design,floor,commit:next=>commit(next),setIssue:message=>interaction.setIssue(message)});
 // Rules panels take over clicks only after their own scope/action buttons were used since the last tool change,
 // so a rules section left open never blocks the brush or Select.
 const [rulesArmed,setRulesArmed]=useState<{rhythm:boolean;paint:boolean}>({rhythm:false,paint:false});
 useEffect(()=>{if(rhythmPanel.picking)setRulesArmed(a=>a.rhythm?a:{...a,rhythm:true});},[rhythmPanel.picking,rhythmPanel.scope,rhythmPanel.action,rhythmOpen]);
 useEffect(()=>{if(paintRules.picking)setRulesArmed(a=>a.paint?a:{...a,paint:true});},[paintRules.picking,paintRules.kind,paintRules.open]);
 const rhythmPicking=rhythmOpen&&rhythmPanel.picking&&rulesArmed.rhythm,paintPicking=paintRules.picking&&rulesArmed.paint;
 const effectiveTool:StudioTool=rhythmPicking?'rhythm-face':paintPicking?'surface':tool;

 // ---- Selection ----------------------------------------------------------------------------------------------
 const select=(next:StudioSelection)=>{setSelectionState(next);land.setSelectedVolume(selectionPart(next));};
 const setLevel=(next:StudioSelectLevel)=>{setLevelState(next);if(rail!=='select')chooseRail('select',next);};
 /** Breadcrumb / Esc: go to a coarser selection and make its level the click filter. */
 const goTo=(next:StudioSelection)=>{select(next);setLevelState(next.level==='building'?'part':next.level);};
 const stepUp=()=>{if(selection.level==='building'){if(land.selectedVolume){land.setSelectedVolume(null);return true;}return false;}goTo(stepUpSelection(selection));return true;};
 // The part selection lives in the land controller (handles, drawing and undo move it); finer levels follow it.
 useEffect(()=>{const part=land.selectedVolume;setSelectionState(s=>selectionPart(s)===part?s:part?{level:'part',partId:part}:NO_SELECTION);},[land.selectedVolume]);
 // Items removed by an edit or an undo drop out of the selection.
 useEffect(()=>{if(!recipe)return;setSelectionState(s=>{
  const partOk=(id:string|null)=>!id||recipe.volumes.some(v=>v.id===id);
  if(s.level!=='building'&&!partOk(s.partId))return NO_SELECTION;
  if(s.level==='opening'){const live=s.openings.filter(o=>o.kind==='free'?recipe.studio.freeOpenings?.some(x=>x.id===o.id):o.kind==='kit'?recipe.studio.openings.some(x=>x.id===o.id):recipe.studio.stamps?.some(x=>x.id===o.id));return live.length===s.openings.length?s:live.length?{...s,openings:live}:{level:'wall',partId:s.partId,walls:[s.wall]};}
  if(s.level==='object'){const o=s.object,alive=o.kind==='roof-opening'?recipe.studio.roofOpenings?.some(x=>x.id===o.id):o.kind==='roof-detail'?recipe.studio.roofDetails?.some(x=>x.id===o.id):o.kind==='assembly'?recipe.studio.assemblies.some(x=>x.id===o.id):true;return alive?s:s.partId?{level:'part',partId:s.partId}:NO_SELECTION;}
  return s;});},[recipe]);
 const bayWall=(bay:StudioBay):WallRef=>({shapeId:bay.anchor.shapeId,side:bay.anchor.side});
 const openingAt=(pick:StudioPick):StudioOpeningRef|null=>{if(!recipe)return null;if(pick.freeOpeningId)return {kind:'free',id:pick.freeOpeningId};if(!pick.bay)return null;const kit=kitOpeningAt(recipe,pick.bay.anchor);if(kit)return {kind:'kit',id:kit.id};const stamp=protectedStorefrontAtBay(recipe,pick.bay,interaction.bays);return stamp?{kind:'stamp',id:stamp.id}:null;};
 const objectAt=(pick:StudioPick):StudioSelection|null=>{if(!recipe)return null;
  if(pick.roofOpeningId){const o=recipe.studio.roofOpenings?.find(x=>x.id===pick.roofOpeningId);return {level:'object',partId:o?.partId??null,object:{kind:'roof-opening',id:pick.roofOpeningId}};}
  if(pick.roofDetailId){const d=recipe.studio.roofDetails?.find(x=>x.id===pick.roofDetailId);return {level:'object',partId:d?.partId??null,object:{kind:'roof-detail',id:pick.roofDetailId}};}
  if(pick.bay){const a=assembliesAt(recipe,pick.bay.anchor)[0];if(a)return {level:'object',partId:pick.bay.anchor.shapeId,object:{kind:'assembly',id:a.id}};}
  return null;};
 /** One Select click at a granularity; Shift adds walls, tiles or openings. */
 const selectAt=(at:StudioSelectLevel,pick:StudioPick)=>{
  const bay=pick.bay,shift=pick.shift;
  if(at==='part'){const part=pick.partId??bay?.anchor.shapeId??null;if(part)select({level:'part',partId:part});return;}
  if(at==='object'){const hit=objectAt(pick);if(hit){select(hit);interaction.setIssue('');}else interaction.setIssue('Click a decoration, skylight, dormer or roof detail.');return;}
  if(!bay){if(!shift)select(NO_SELECTION);return;}
  const wall=bayWall(bay),part=bay.anchor.shapeId;
  if(at==='wall'){const walls=selection.level==='wall'?toggleIn(selection.walls,wall,sameWall,shift):[wall];select(walls.length?{level:'wall',partId:walls[0].shapeId,walls}:{level:'part',partId:part});return;}
  if(at==='tile'){const keep=selection.level==='tile'&&shift&&sameWall(selection.wall,wall),bays=keep?toggleIn(selection.bays,bay.id,(a,b)=>a===b,true):[bay.id];select(bays.length?{level:'tile',partId:part,wall,bays}:{level:'wall',partId:part,walls:[wall]});return;}
  const ref=openingAt(pick);if(!ref){interaction.setIssue('Click a window, door or kit piece. Generated rhythm openings are edited from their wall.');return;}
  const openings=selection.level==='opening'&&shift&&sameWall(selection.wall,wall)?toggleIn(selection.openings,ref,sameOpening,true):[ref];
  interaction.setIssue('');select(openings.length?{level:'opening',partId:part,wall,openings}:{level:'wall',partId:part,walls:[wall]});
 };
 const onSelectPick=(pick:StudioPick)=>{if(pick.detail>=2){const next=drillSelectLevel(level);if(next){setLevelState(next);selectAt(next,pick);}}};

 // ---- Brush picks: erase and trims ------------------------------------------------------------------------------
 const eraseWhere=(pick:StudioPick,sizeNow:StudioBrushSize)=>{const part=pick.bay?.anchor.shapeId??pick.roofPartId;return sizeNow==='part'&&part?{parts:[part]}:sizeNow==='wall'&&pick.bay?{walls:[bayWall(pick.bay)]}:null;};
 const eraseItems=(what:StudioEraseWhat,where:{walls?:WallRef[];parts?:string[]},place:string)=>{if(!recipe)return false;const next=eraseStudioItems(recipe,what,where);if(next===recipe){interaction.setIssue(`No ${ERASE_LABELS[what]} to erase on this ${place}.`);return false;}return commit(next,`Remove ${ERASE_LABELS[what]} on ${place==='part'?'this part':place==='wall'?'this wall':place}`);};
 const erasePick=(pick:StudioPick)=>{if(!recipe)return;const what=ERASE_BY_TARGET[target],where=eraseWhere(pick,brushSize);
  if(where){eraseItems(what,where,where.parts?'part':'wall');return;}
  const bay=pick.bay;
  if(target==='openings'){const ref=openingAt(pick);if(!ref||ref.kind==='stamp'){interaction.setIssue(ref?'Storefronts are erased with the Storefronts target.':'Click a window or door to erase it.');return;}if(ref.kind==='kit'&&bay?.entrance){interaction.setIssue('Keep a door at the main entrance.');return;}commit(removeStudioOpenings(recipe,[ref]),'Remove opening');return;}
  if(target==='storefronts'){const stamp=bay&&protectedStorefrontAtBay(recipe,bay,interaction.bays);if(!stamp){interaction.setIssue('Click a storefront to erase it.');return;}commit(removeStudioOpenings(recipe,[{kind:'stamp',id:stamp.id}]),'Remove storefront');return;}
  if(target==='trims'){const id=pick.freeOpeningId;if(!id||!freeTrimKinds(recipe,id).length){interaction.setIssue('Click a dressed opening to strip its trims.');return;}commit(pruneFreeTrims({...recipe,studio:{...recipe.studio,freeTrims:recipe.studio.freeTrims?.filter(t=>t.openingId!==id)}}),'Remove trims');return;}
  if(target==='decor'){const found=bay?assembliesAt(recipe,bay.anchor):[];if(!found.length){interaction.setIssue('Click a balcony, cornice, canopy or other decoration to erase it.');return;}const ids=new Set(found.map(a=>a.id));commit({...recipe,studio:{...recipe.studio,assemblies:recipe.studio.assemblies.filter(a=>!ids.has(a.id))}},'Remove decoration');return;}
  if(target==='roof'){if(pick.roofOpeningId){commit(removeRoofOpening(recipe,pick.roofOpeningId),'Remove roof opening');return;}if(pick.roofDetailId){commit({...recipe,studio:{...recipe.studio,roofDetails:recipe.studio.roofDetails?.filter(d=>d.id!==pick.roofDetailId)}},'Remove roof detail');return;}interaction.setIssue('Click a skylight, dormer or roof detail to erase it.');return;}
  // Material at wall/part size arrives here; tile and freeform use the paint tool in erase mode.
  if(bay){const owned=pick.point&&ownedPaintHit(plot.id,bay.anchor,{x:pick.point[0],y:pick.point[1],z:pick.point[2]});if(owned){const next=erasePaintAt(recipe,owned.shapeId,owned.side,owned.x,owned.y,channel==='trim'?'trim':'wall');if(next!==recipe){commit(next);return;}}commit(paintStudioStroke(recipe,[bay.anchor],'spot',channel,null));}
 };
 const trimPick=(pick:StudioPick)=>{if(!recipe)return;const id=pick.freeOpeningId;if(!id){interaction.setIssue('Click a free window or door to dress it.');return;}const choices=freeOpeningTrimChoices(recipe,draft.design,id,interaction.bays);if(!choices?.kinds.includes(trimKind)){interaction.setIssue(`${TRIM_LABELS[trimKind]} do not suit this opening.`);return;}const wall={shapeId:recipe.studio.freeOpenings!.find(o=>o.id===id)!.shapeId,side:recipe.studio.freeOpenings!.find(o=>o.id===id)!.side};commit(toggleFreeTrim(recipe,id,trimKind));select({level:'opening',partId:wall.shapeId,wall,openings:[{kind:'free',id}]});};
 const onPick=(pick:StudioPick)=>{if(rail==='select'){if(pick.detail>=2){const next=drillSelectLevel(level);if(next){setLevelState(next);selectAt(next,pick);return;}}selectAt(level,pick);return;}if(rail==='erase'){erasePick(pick);return;}if(rail==='paint'&&target==='trims')trimPick(pick);};

 // ---- Interaction ---------------------------------------------------------------------------------------------
 const sample=(bay:StudioBay)=>{setColor(bay.finishes[channel]?.color??STUDIO_FAMILIES[bay.family][channel]);setTexture(bay.finishes[channel]?.texture??'');setEyedropper(false);};
 const highestStorey=cam.highestStorey;
 const interaction=useStudioInteraction({onPick,onSelectPick,onEscape:()=>onEscape(),onRhythmFace:(shapeId,side,info)=>rhythmPanel.onWall(shapeId,side,info),roofOpeningPreset:(ROOF_OPENING_PRESETS.find(p=>p.id===roofPresetId)??ROOF_OPENING_PRESETS[0]).preset,
  onRoofOpeningSelect:id=>{const o=id?latestRecipe()?.studio.roofOpenings?.find(x=>x.id===id):null;if(o)select({level:'object',partId:o.partId,object:{kind:'roof-opening',id:o.id}});else if(selection.level==='object'&&selection.object.kind==='roof-opening')goTo(stepUpSelection(selection));},
  onFreeOpeningSelect:id=>{const o=id?latestRecipe()?.studio.freeOpenings?.find(x=>x.id===id):null;if(o){const wall={shapeId:o.shapeId,side:o.side};select({level:'opening',partId:o.shapeId,wall,openings:[{kind:'free',id:o.id}]});}else if(selection.level==='opening')goTo(stepUpSelection(selection));},
  freeArcade,roofDetail:effectiveTool==='roof-detail'&&roofModule?{module:roofModule,size:(STUDIO_MODULE_MAP.get(roofModule)?.size??[1,1,1]) as [number,number,number],rotation:roofRotation}:undefined,onRoofDetailPlace:(partId,u,v)=>void placeRoofDetail(partId,u,v),onRoofDetailRotate:()=>setRoofRotation(r=>(r+1)%4),
  freePreset,paintBrush,paintBand,paintBandAround:bandAround,onPaintPick:paintPicking?paintRules.onWall:undefined,land,plot,draft,recipe,camera,tool:effectiveTool,setTool:t=>setToolFromGesture(t),outlineCornerMode,outlineEdgeMode,floor,opening,scope,channel,color,texture,erase,eyedropper,onSample:sample,onFillApplied:()=>{},
  destination:Math.min(destination,highestStorey),exitKind,layout:stairLayout,flip,look,detailModule,interiorEditId,interiorDoorStyle,interiorDoorHinge,furnitureKind,furnitureRotation,furnitureEditId:selectedFurnitureId,onFurnitureSelect:id=>selectFurniture(id),onFurnitureRotate:()=>rotateFurniture(),onRoomSelect:setSelectedRoomId,walking,roofConnected:roofScope==='connected',onRoofSelect:()=>{}});
 /** Tools the interaction hook switches to after a gesture (draw → select, outline, roof handles, furniture Esc). */
 function setToolFromGesture(t:StudioTool){
  if(t==='select'){setRailState('select');setLevelState('part');}
  else if(t==='block'||t==='round'||t==='oval'||t==='cut'||t==='outline'){setRailState('build');setBuildShape(t);}
  else if(t==='roof'){setRailState('roof');setRoofMode('roof');}
  else if(t==='roof-opening'||t==='roof-detail'){if(rail!=='paint')setRailState('roof');setRoofMode(t);}
  else if(t==='interior-furniture-select'||t==='interior-furniture'){setRailState('furnish');setFurnishTool(t);}
  else if(t==='interior-room'||t==='interior-partition'||t==='interior-door'||t==='interior-stair'){setRailState('rooms');setRoomsTool(t);}
  else if(t==='surface'){setRailState('paint');setTargetState('material');}
  else if(t==='free-opening'||t==='opening'){setRailState('paint');setTargetState('openings');}
  else if((ASSEMBLY_KINDS as string[]).includes(t)){setRailState('paint');setTargetState('decor');setDecorKind(t as StudioAssemblyKind);}
 }
 useEffect(()=>{setStudioFloorView(plot.id,{mode:floorViewMode,floor});},[plot.id,floorViewMode,floor]);
 useEffect(()=>()=>clearStudioFloorView(plot.id),[plot.id]);

 // ---- Rail, targets and brush choices --------------------------------------------------------------------------
 function chooseRail(next:StudioRailTool,nextLevel?:StudioSelectLevel){
  interaction.cancel();setEyedropper(false);setStarters(false);setInteriorEditId(null);setSelectedFurnitureId(null);setPaletteOpen(true);
  if(next!==rail)setRulesArmed({rhythm:false,paint:false});
  const into=next==='rooms'||next==='furnish',from=rail==='rooms'||rail==='furnish';
  if(into&&!(from&&rail===next)){setFloorViewMode('floor');cam.focusInteriorFloor(floor);}else if(!into&&from)setFloorViewMode('whole');
  if(next==='rooms')setRoomsTool('interior-room');if(next==='furnish')setFurnishTool('interior-furniture-select');
  if(next==='roof'&&rail!=='roof')setRoofMode('roof');
  if(nextLevel)setLevelState(nextLevel);
  setRailState(next);
 }
 /** E toggles between painting and erasing with the same target; from other tools it opens Erase. */
 const toggleErase=()=>chooseRail(rail==='erase'?'paint':'erase');
 const chooseTarget=(next:StudioBrushTarget)=>{interaction.cancel();setEyedropper(false);setTargetState(next);if(next==='roof'&&roofMode==='roof')setRoofMode('roof-opening');if(rail!=='paint'&&rail!=='erase')setRailState('paint');};
 const chooseSize=(next:StudioBrushSize)=>{setSizeState(next);if(next!=='free')setBand(false);setEyedropper(false);};
 const brush=(t:StudioBrushTarget)=>{if(rail!=='erase')setRailState('paint');setTargetState(t);interaction.cancel();setEyedropper(false);};
 const hotbar=useStudioHotbar();
 const chooseColor=(c:string)=>{setColor(c);setEyedropper(false);brush('material');hotbar.record({id:`color:${c}`,target:'material',label:c,color:c});};
 const chooseTexture=(id:string,label:string)=>{setTexture(id);setEyedropper(false);brush('material');hotbar.record({id:`texture:${id||'smooth'}`,target:'material',label,texture:id});};
 const chooseFreePreset=(id:string,label:string)=>{setOpeningKind('free');setFreePresetId(id);brush('openings');hotbar.record({id:`free:${id}`,target:'openings',label,free:id});};
 const chooseKitModule=(id:string,label:string)=>{setOpeningKind('kit');setKitModule(id);brush('openings');hotbar.record({id:`kit:${id}`,target:'openings',label,kit:id});};
 const chooseStamp=(id:string,label:string)=>{setStampId(id);brush('storefronts');hotbar.record({id:`stamp:${id}`,target:'storefronts',label,stamp:id});};
 const chooseTrim=(kind:TrimKind)=>{setTrimKind(kind);brush('trims');hotbar.record({id:`trim:${kind}`,target:'trims',label:TRIM_LABELS[kind],trim:kind});};
 const chooseDecor=(kind:StudioAssemblyKind,module='')=>{setDecorKind(kind);setDetailModule(module);brush('decor');hotbar.record({id:`decor:${kind}:${module}`,target:'decor',label:module?STUDIO_MODULE_MAP.get(module)?.label??module:DECOR_LABELS[kind],decor:kind,module});};
 const chooseRoofOpening=(id:string,label:string)=>{interaction.cancel();setRoofPresetId(id);setRoofMode('roof-opening');if(rail!=='roof')brush('roof');hotbar.record({id:`roof-opening:${id}`,target:'roof',label,roofOpening:id});};
 const chooseRoofDetail=(module:string)=>{interaction.cancel();setRoofModule(module);setRoofMode('roof-detail');if(rail!=='roof')brush('roof');hotbar.record({id:`roof-detail:${module}`,target:'roof',label:STUDIO_MODULE_MAP.get(module)?.label??module,roofDetail:module});};
 const useHotbar=(item:HotbarItem)=>{setRailState(rail==='erase'?'erase':'paint');setTargetState(item.target);interaction.cancel();setEyedropper(false);
  if(item.color)setColor(item.color);if(item.texture!==undefined)setTexture(item.texture);
  if(item.free){setOpeningKind('free');setFreePresetId(item.free);}if(item.kit){setOpeningKind('kit');setKitModule(item.kit);}
  if(item.stamp)setStampId(item.stamp);if(item.trim)setTrimKind(item.trim as TrimKind);if(item.decor){setDecorKind(item.decor);setDetailModule(item.module??'');}
  if(item.roofOpening){setRoofPresetId(item.roofOpening);setRoofMode('roof-opening');}if(item.roofDetail){setRoofModule(item.roofDetail);setRoofMode('roof-detail');}
  hotbar.record(item);};

 // ---- Recipe actions (moved from CityStudio) -------------------------------------------------------------------
 const shown=interaction.transient??recipe,selected=shown?.volumes.find(v=>v.id===land.selectedVolume),style=recipe&&selected?studioStyle(recipe,selected.id):recipe?.studio.defaults;
 const partName=(id:string)=>{const i=recipe?.volumes.filter(v=>v.operation==='add').findIndex(v=>v.id===id)??-1;if(i<0){const cut=recipe?.volumes.findIndex(v=>v.id===id)??-1;return cut<0?'Part':`Cutout ${cut+1}`;}return i===0?'Main part':`Part ${i+1}`;};
 const tryAnotherLook=()=>{if(!recipe)return;if(recipe.studio.facadeRhythm){commit({...recipe,studio:{...recipe.studio,facadeRhythm:shuffleFacadeRhythm(recipe.studio.facadeRhythm)}});return;}const varied=recipe.studio.variation?{...recipe,studio:{...recipe.studio,variation:shuffleVariation(recipe.studio.variation)}}:enableBuildingVariation(recipe);commit(varied);};
 const diceReady=kitVersion===5||!!recipe?.studio.facadeRhythm;
 const placingRoof=useRef(false);
 async function placeRoofDetail(partId:string,u:number,v:number){if(!recipe||!roofModule||placingRoof.current)return;placingRoof.current=true;const id=crypto.randomUUID(),next={...recipe,studio:{...recipe.studio,roofDetails:[...(recipe.studio.roofDetails??[]),{id,partId,module:roofModule,u,v,rotation:roofRotation}]}};
  try{const result=await prepareSculpt(next,studioDraft(draft,next).design,true);if(latestDraft.current!==draft)return;const invalid=result.studio?.inactive.find(p=>p.id===id);if(invalid){interaction.setIssue(invalid.reason);playStudioCue('invalid');}else commit(next);}catch(e){interaction.setIssue(e instanceof Error?e.message:'Unable to place this roof detail.');}finally{placingRoof.current=false;}}
 const removeInactive=(id:string)=>{if(!recipe)return;if(id.startsWith('generated/')){setVariationOpen(true);setInspectorOpen(true);goTo(NO_SELECTION);return;}if(recipe.version===6&&(recipe.interior.partitions.some(p=>p.id===id)||recipe.interior.doors.some(p=>p.id===id)||recipe.interior.stairs.some(p=>p.id===id)||recipe.interior.roomFinishes?.some(p=>p.id===id)||recipe.interior.furniture?.some(p=>p.id===id))){commit({...recipe,interior:{...recipe.interior,partitions:recipe.interior.partitions.filter(p=>p.id!==id),doors:recipe.interior.doors.filter(p=>p.id!==id),stairs:recipe.interior.stairs.filter(p=>p.id!==id),roomFinishes:recipe.interior.roomFinishes?.filter(p=>p.id!==id),furniture:recipe.interior.furniture?.filter(p=>p.id!==id)}});return;}commit({...recipe,studio:{...recipe.studio,stamps:recipe.studio.stamps?.filter(a=>a.id!==id),assemblies:recipe.studio.assemblies.filter(a=>a.id!==id),openings:recipe.studio.openings.filter(a=>a.id!==id),roofDetails:recipe.studio.roofDetails?.filter(a=>a.id!==id)}});};
 function selectFurniture(id:string|null){interaction.cancel();setSelectedFurnitureId(id);const item=recipe?.version===6?recipe.interior.furniture?.find(item=>item.id===id):null;if(item){setFurnitureKind(item.kind);setFurnitureRotation(item.rotation);}setToolFromGesture('interior-furniture-select');}
 const chooseFurniture=(kind:StudioFurnitureKind)=>{interaction.cancel();setSelectedFurnitureId(null);setFurnitureKind(kind);setToolFromGesture('interior-furniture');};
 function rotateFurniture(){const rotation=(furnitureRotation+Math.PI/2)%(Math.PI*2);if(tool==='interior-furniture'||!selectedFurnitureId){setFurnitureRotation(rotation);return;}if(recipe?.version!==6)return;const item=recipe.interior.furniture?.find(item=>item.id===selectedFurnitureId),prepared=preparedStudioPlot(plot.id)?.result;if(!item||!prepared)return;const next={...item,rotation},reason=furniturePlacementIssue(next,prepared.interiorLevels?.[floor],prepared.decks,prepared.portals??[]);if(reason){interaction.setIssue(reason);return;}setFurnitureRotation(rotation);commit({...recipe,interior:{...recipe.interior,furniture:recipe.interior.furniture?.map(other=>other.id===item.id?next:other)}});}
 const removeFurniture=()=>{if(recipe?.version!==6||!selectedFurnitureId)return;commit({...recipe,interior:{...recipe.interior,furniture:recipe.interior.furniture?.filter(item=>item.id!==selectedFurnitureId)}});selectFurniture(null);};
 const chooseStair=(id:string)=>{const a=recipe?.studio.assemblies.find(a=>a.id===id);if(!a)return;setStairEditing(id);setDestination(a.destination??1);setExitKind(a.exitKind??'door');setStairLayout(a.layout??'auto');setFlip(!!a.flip);setLook(a.look);setToolFromGesture('stair');};
 const refitStair=async()=>{if(!recipe||!stairEditing||stairBusy||interaction.active)return;const next=structuredClone(recipe),assembly=next.studio.assemblies.find(a=>a.id===stairEditing);if(!assembly)return;
  Object.assign(assembly,{destination:Math.min(destination,highestStorey),exitKind,layout:stairLayout,flip,look,exit:undefined});const problem=checkStudioDraft(draft,next);if(problem){interaction.setIssue(problem);return;}
  setStairBusy(true);try{const result=await prepareSculpt(next,studioDraft(draft,next).design,true),inactive=result.studio?.inactive.find(a=>a.id===stairEditing),route=result.studio?.accessRoutes?.find(a=>a.id===stairEditing);if(latestDraft.current!==draft){interaction.setIssue('The building changed while fitting this stair. Choose it again.');return;}if(inactive||!route){interaction.setIssue(inactive?.reason??'This stair could not reach its exit.');return;}assembly.exit=route.exit;assembly.exitKind=route.kind;commit(next);}catch(error){interaction.setIssue(error instanceof Error?error.message:String(error));}finally{setStairBusy(false);}
 };
 const removeStair=()=>{if(!recipe||!stairEditing)return;commit({...recipe,studio:{...recipe.studio,assemblies:recipe.studio.assemblies.filter(a=>a.id!==stairEditing)}});setStairEditing(null);};
 const editPart=(patch:Partial<SculptVolume>)=>{if(!recipe||!selected)return;commit(liftStudioAnchors({...recipe,volumes:recipe.volumes.map(v=>v.id===selected.id?{...v,...patch}:v)},selected.id,(patch.startFloor??selected.startFloor)-selected.startFloor));};
 const editStyle=(patch:NonNullable<typeof style>,part:boolean=!!selected)=>{if(!recipe)return;commit({...recipe,studio:{...recipe.studio,...(part&&selected?{parts:{...recipe.studio.parts,[selected.id]:{...recipe.studio.parts[selected.id],...patch}}}:{defaults:{...recipe.studio.defaults,...patch}})}});};
 const followWall=()=>{const b=interaction.hover;if(!recipe||!b)return;const nx=Math.sin(b.rotation),nz=Math.cos(b.rotation);const anchors=interaction.bays.filter(other=>other.anchor.floor===b.anchor.floor&&Math.abs(Math.cos(other.rotation-b.rotation)-1)<.001&&Math.abs((other.x-b.x)*nx+(other.z-b.z)*nz)<.03).map(other=>other.anchor);commit({...recipe,studio:{...recipe.studio,assemblies:[...recipe.studio.assemblies,{id:crypto.randomUUID(),kind:'cornice',anchors,look,variant:['synarc-kit-4','synarc-kit-5'].includes(recipe.studio.catalogue)?'nyc':undefined}]}});};
 /** Per-storey outlines: the storeys from the current one up become their own part (Inspector › Part › Outline). */
 const splitAtStorey=()=>{const r=latestRecipe(),v=r?.volumes.find(x=>x.id===land.selectedVolume);if(!r||!v)return;const at=floor>v.startFloor&&floor<v.startFloor+v.spanFloors?floor:v.startFloor+1,id=crypto.randomUUID(),out=splitStudioPartAtStorey(r,v.id,at,id,draft.design);if('reason' in out){interaction.setIssue(out.reason);return;}const summary=outlineRemovalSummary(out.removed,1);if(commit(out.recipe,`Split part at storey ${at+1}${summary?` · ${summary}`:''}`))land.setSelectedVolume(floor>=at?id:v.id);};
 const duplicate=()=>{if(!recipe||!selected)return;const id=crypto.randomUUID();commit({...recipe,volumes:[...recipe.volumes,{...selected,id,x:selected.x+.5,z:selected.z+.5}],studio:{...recipe.studio,parts:{...recipe.studio.parts,[id]:structuredClone(style??{})}}});land.setSelectedVolume(id);};
 const remove=()=>{if(!recipe||!selected)return;commit({...recipe,volumes:recipe.volumes.filter(v=>v.id!==selected.id)});land.setSelectedVolume(null);};
 const empty=()=>{if(!recipe)return;commit({...recipe,volumes:[],attachments:[],studio:freshStudio()});land.setSelectedVolume(null);setStarters(false);chooseRail('build');setBuildShape('block');};
 const starter=(index:number)=>{if(index<=-2){land.edit(studioExample(draft,-index-2,plot.size));land.setSelectedVolume(null);setStarters(false);setReplace(null);return;}const design=applyComposition(draft.design,index),next=upgradeStudio({...draft,sculpt:undefined,design},plot.size);if(next){land.edit(next);land.setSelectedVolume(null);setStarters(false);setReplace(null);}};
 /** Current brush finish as a stored finish (texture only when set). */
 const finish=texture?{color,texture}:{color};
 /** Paint a whole wall or part with the current brush finish (inspector actions). */
 const paintWalls=(walls:WallRef[])=>{if(!recipe)return;let next=recipe;const faces=preparedStudioPlot(plot.id)?.result.freeFaces??[];
  for(const w of walls){const face=faces.find(f=>f.shapeId===w.shapeId&&f.side===w.side);if(face&&(channel==='wall'||channel==='trim')){next=fillPaintFace(next,{shapeId:w.shapeId,side:w.side,channel,height:face.height,finish});continue;}
   const anchors=interaction.bays.filter(b=>b.anchor.shapeId===w.shapeId&&b.anchor.side===w.side).map(b=>b.anchor);next=paintStudioStroke(next,anchors,'wall',channel,finish);}
  if(next!==recipe)commit(next,'Paint');};
 const paintPart=(partId:string)=>{if(!recipe)return;const anchor=interaction.bays.find(b=>b.anchor.shapeId===partId)?.anchor;if(!anchor){interaction.setIssue('This part has no exposed walls to paint.');return;}commit(paintStudioStroke(recipe,[anchor],'part',channel,finish),'Paint');};
 const paintTiles=(ids:string[])=>{if(!recipe)return;const anchors=interaction.bays.filter(b=>ids.includes(b.id)).map(b=>b.anchor);if(anchors.length)commit(paintStudioStroke(recipe,anchors,'spot',channel,finish),'Paint');};
 /** Deletes the Select selection at its level (Delete key and inspector buttons). */
 const deleteSelection=()=>{if(!recipe)return;const s=selection;
  if(s.level==='opening'){commit(removeStudioOpenings(recipe,s.openings),s.openings.length>1?'Remove openings':'Remove opening');goTo({level:'wall',partId:s.partId,walls:[s.wall]});return;}
  if(s.level==='object'){const o=s.object;if(o.kind==='roof-opening')commit(removeRoofOpening(recipe,o.id),'Remove roof opening');else if(o.kind==='roof-detail')commit({...recipe,studio:{...recipe.studio,roofDetails:recipe.studio.roofDetails?.filter(d=>d.id!==o.id)}},'Remove roof detail');else if(o.kind==='assembly')commit({...recipe,studio:{...recipe.studio,assemblies:recipe.studio.assemblies.filter(a=>a.id!==o.id)}},'Remove decoration');goTo(stepUpSelection(s));}
 };
 const removeFreeOpeningById=(id:string)=>{if(recipe)commit(pruneFreeTrims(removeFreeOpening(recipe,id)));};

 // ---- Floors, rooms and furniture ------------------------------------------------------------------------------
 const chooseInteriorFloor=(next:number)=>{interaction.cancel();setFloor(next);setSelectedRoomId(null);setSelectedFurnitureId(null);setFloorViewMode('floor');cam.focusInteriorFloor(next);};
 const chooseFloor=(next:number)=>{if(interior){chooseInteriorFloor(next);return;}interaction.cancel();setFloor(next);};
 const addInteriorStorey=()=>{if(!recipe||highestStorey>=8)return;const atTop=recipe.volumes.filter(v=>v.operation==='add'&&v.startFloor+v.spanFloors===highestStorey);if(!atTop.length){interaction.setIssue('Add a building shape before adding a floor.');return;}const next={...recipe,volumes:recipe.volumes.map(v=>v.startFloor+v.spanFloors===highestStorey?{...v,spanFloors:v.spanFloors+1}:v)};const problem=checkStudioDraft(draft,next);if(problem){interaction.setIssue(problem);return;}commit(next);chooseFloor(highestStorey);};
 const toggleInteriorFloor=()=>{if(recipe?.version!==6||floor===0)return;const existing=recipe.interior.openFloors??[],open=existing.includes(floor);commit({...recipe,interior:{...recipe.interior,openFloors:open?existing.filter(value=>value!==floor):[...existing,floor].sort((a,b)=>a-b)}});};
 const prepared=preparedStudioPlot(plot.id)?.result,inactive=prepared?.inactive??[];
 const roomChoices=prepared?.interiorLevels?.[floor]?.rooms??[],selectedRoom=roomChoices.find(room=>room.id===selectedRoomId);
 const editRoom=(room:StudioRoom,patch:Partial<StudioRoomFinish>)=>{if(recipe?.version!==6)return;const existing=recipe.interior.roomFinishes?.find(item=>item.id===room.id),id=existing?.id??crypto.randomUUID();const intent={id,floor,x:room.x,z:room.z,boundaryIds:room.boundaryIds,...existing,...patch};commit({...recipe,interior:{...recipe.interior,roomFinishes:[...(recipe.interior.roomFinishes??[]).filter(item=>item.id!==room.id),intent]}});setSelectedRoomId(id);};

 // ---- Feel: sounds, bursts, drag ticks, room chime -------------------------------------------------------------
 const [bursts,setBursts]=useState<JuiceBurst[]>([]),[muted,setMuted]=useState(studioAudioMuted);
 const clearBurst=useCallback((id:string)=>setBursts(list=>list.filter(b=>b.id!==id)),[]);
 useEffect(()=>onStudioAudioMuted(setMuted),[]);
 const previousRecipe=useRef(recipe);
 useEffect(()=>{const edit=land.lastEdit;if(!edit)return;playStudioCue(studioCueForEdit(edit.label,edit.continuous));if(edit.continuous)return;const fresh=studioJuiceBursts(previousRecipe.current,recipe,interaction.bays,draft.design.groundHeight,draft.design.upperHeight).map(b=>({...b,id:`${b.id}/${edit.id}`}));if(fresh.length)setBursts(list=>[...list,...fresh].slice(-48));},[land.lastEdit?.id]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{previousRecipe.current=recipe;},[recipe]);
 useEffect(()=>{if(land.notice)playStudioCue(land.notice.kind);},[land.notice?.id]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(interaction.issue)playStudioCue('invalid');},[interaction.issue]);
 const ghost=interaction.transient?.volumes.find(v=>!recipe?.volumes.some(old=>old.id===v.id));
 const dragKey=interaction.active?[ghost?.width,ghost?.depth,selected?.spanFloors,selected?.startFloor,selected?.x,selected?.z,selected?.width,selected?.depth].join():'';
 useEffect(()=>{if(dragKey)playStudioCue('tick');},[dragKey]);
 const roomCount=useRef(roomChoices.length);
 useEffect(()=>{if(category==='Rooms'&&roomChoices.length>roomCount.current)playStudioCue('chime');roomCount.current=roomChoices.length;},[roomChoices.length,floor]);// eslint-disable-line react-hooks/exhaustive-deps

 // ---- Quick paint ring (C) -------------------------------------------------------------------------------------
 const pointer=useRef({x:0,y:0});
 useEffect(()=>{const track=(e:PointerEvent)=>{pointer.current={x:e.clientX,y:e.clientY};};window.addEventListener('pointermove',track);return()=>window.removeEventListener('pointermove',track);},[]);
 const [ring,setRing]=useState<{x:number;y:number;anchor:StudioAnchor;owned:OwnedPaintHit|null}|null>(null);
 // On generated walls the ring recolours the region under the pointer, or fills the face when none.
 const ringRecipe=(choice:PaintRingChoice)=>{if(!recipe||!ring)return null;const finishNow={color:choice.color??color,texture:(choice.texture??texture)||undefined},o=ring.owned;
  if(o&&scope!=='part'&&(channel==='wall'||channel==='trim')){const clean=finishNow.texture?finishNow:{color:finishNow.color},region=paintRegionAt(recipe.studio.paintRegions,o.shapeId,o.side,o.x,o.y,channel);return region?recolorPaintRegion(recipe,region.id,clean):fillPaintFace(recipe,{shapeId:o.shapeId,side:o.side,channel,height:o.height,finish:clean});}
  return paintStudioStroke(recipe,[ring.anchor],scope,channel,finishNow);};
 const openRing=()=>{const bay=interaction.hover;if(!bay||!recipe)return;const rect=gl.domElement.getBoundingClientRect();interaction.cancel();setRing({x:pointer.current.x-rect.left,y:pointer.current.y-rect.top,anchor:bay.anchor,owned:interaction.ownedHit()});playStudioCue('tick');};
 const closeRing=useCallback(()=>{setRing(null);clearSculptPreview(plot.id);},[plot.id]);
 const previewRing=(choice:PaintRingChoice|null)=>{const next=choice&&ringRecipe(choice);if(next)setSculptPreview(plot.id,next,draft.design);else clearSculptPreview(plot.id);};
 const pickRing=(choice:PaintRingChoice)=>{const next=ringRecipe(choice);setRing(null);if(!next)return;if(choice.color)setColor(choice.color);if(choice.texture!==undefined)setTexture(choice.texture);setEyedropper(false);if(rail==='erase')setRailState('paint');commit(next);clearSculptPreview(plot.id,true);};

 // ---- Camera, walking and keys ---------------------------------------------------------------------------------
 const view=(kind:StudioViewKind)=>cam.view(kind,{selected,interior,floor});
 const walk=()=>{if(land.previewStatus.pending||land.previewStatus.error)return;const ready=preparedStudioPlot(plot.id);if(!ready){interaction.setIssue('Your building is still preparing.');return;}cam.saveForWalk();const entry=landEntrance(plot);Object.assign(session.foot,createFootState(entry.x,entry.z,entry.heading));session.mode='on-foot';land.setPhase('walkthrough');};
 function onEscape(){if(help){setHelp(false);return true;}if(parts||starters){setParts(false);setStarters(false);return true;}if(rail==='rooms'||rail==='furnish')return false;if(rail!=='select'){chooseRail('select');return true;}return stepUp();}
 const keyState={walking,category,rail,level,selection,selectedFurnitureId,selectedId:selected?.id??null,remove,removeFurniture,deleteSelection,duplicate,chooseRail,toggleErase,chooseFloor,floor,highestStorey,view,dice:tryAnotherLook,openRing,ringAllowed:rail==='paint'&&target==='material'&&!!interaction.hover&&!ring,diceReady,busy:interaction.active,stepUp,setLevel:setLevelState,useSlot:(i:number)=>{const item=hotbar.items[i];if(item)useHotbar(item);},help:()=>setHelp(h=>!h)};
 const keyActions=useRef(keyState);keyActions.current=keyState;
 // Clicking the world returns keyboard focus to it (pointer events suppress the usual blur), so Tab, Delete and
 // letter keys act on the building instead of the last panel button.
 useEffect(()=>{const canvas=gl.domElement,blur=()=>{const a=document.activeElement;if(a instanceof HTMLElement&&a!==document.body&&a.closest('.city-studio'))a.blur();};canvas.addEventListener('pointerdown',blur,true);return()=>canvas.removeEventListener('pointerdown',blur,true);},[gl]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{const k=keyActions.current,el=e.target as HTMLElement;if(k.walking||e.defaultPrevented||el?.closest?.('input,textarea,select')||document.querySelector('.studio-ring-backdrop'))return;
   if(e.key==='Delete'){const t=studioDeleteTarget({category:k.category,furnitureId:k.selectedFurnitureId,partId:k.selectedId,level:k.rail==='select'?(k.selection.level==='building'?'part':k.selection.level):undefined});if(t)e.preventDefault();if(t==='furniture')k.removeFurniture();else if(t==='part')k.remove();else if(t==='opening'||t==='object')k.deleteSelection();return;}
   if(e.key==='Backspace'&&!e.ctrlKey&&!e.metaKey){if(k.rail==='select'&&k.stepUp())e.preventDefault();return;}
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();if(studioDuplicateTarget({category:k.category,partId:k.selectedId,level:k.rail==='select'?(k.selection.level==='building'?'part':k.selection.level):undefined}))k.duplicate();return;}
   if(e.ctrlKey||e.metaKey||e.altKey||k.busy)return;
   if(e.key==='Tab'){const focus=document.activeElement;if(focus instanceof HTMLElement&&focus.closest('.city-studio'))return;e.preventDefault();if(k.rail!=='select')k.chooseRail('select');k.setLevel(cycleSelectLevel(k.level,e.shiftKey?-1:1));return;}
   if(e.key===STUDIO_HELP_KEY){e.preventDefault();k.help();return;}
   if(e.key.toLowerCase()==='c'&&k.ringAllowed){e.preventDefault();k.openRing();return;}
   if(/^[1-9]$/.test(e.key)){e.preventDefault();k.useSlot(Number(e.key)-1);return;}
   const railTool=studioRailForKey(e.key);if(railTool){e.preventDefault();if(railTool==='erase')k.toggleErase();else k.chooseRail(railTool);return;}
   if(e.key===STUDIO_DICE_KEY&&!el?.closest?.('button')){e.preventDefault();if(k.diceReady)k.dice();return;}
   if(e.key==='PageUp'||e.key==='PageDown'){e.preventDefault();k.chooseFloor(studioFloorStep(k.floor,k.highestStorey,e.key==='PageUp'?1:-1));return;}
   if(e.key.toLowerCase()===STUDIO_FOCUS_KEY&&k.selectedId){e.preventDefault();k.view('focus');}};
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);

 // ---- Derived 3D/overlay helpers -------------------------------------------------------------------------------
 const storefrontPreview=useMemo(()=>recipe&&interaction.hover&&effectiveTool==='opening'&&STAMP_MAP.has(opening)?previewStorefront(recipe,draft.design,opening,interaction.hover.anchor):null,[recipe,draft.design,interaction.hover,effectiveTool,opening]);
 // Generated walls paint regions with the brush cursor instead of tile highlights.
 const hoverOwned=!!interaction.hover&&scope!=='part'&&(channel==='wall'||channel==='trim')&&!!prepared?.freeFaces?.some(f=>f.shapeId===interaction.hover!.anchor.shapeId&&f.side===interaction.hover!.anchor.side);
 const paintTargets=effectiveTool==='surface'&&interaction.hover&&!hoverOwned&&!paintPicking?(scope==='part'?interaction.bays.filter(b=>b.anchor.shapeId===interaction.hover!.anchor.shapeId):scope==='wall'?interaction.bays.filter(b=>b.anchor.shapeId===interaction.hover!.anchor.shapeId&&b.anchor.side===interaction.hover!.anchor.side&&b.anchor.floor===interaction.hover!.anchor.floor):[interaction.hover]):[];
 const protectedStamp=recipe?.studio.stamps?.find(stamp=>stamp.id===interaction.protectedStampId)??(recipe&&interaction.hover?protectedStorefrontAtBay(recipe,interaction.hover,interaction.bays):undefined);
 const outlineHandles=useMemo(()=>selected?studioOutlineHandles(selected,draft.design.groundHeight,new Set(interaction.bays.filter(b=>b.anchor.shapeId===selected.id).map(b=>b.anchor.side)),outlineEdgeMode,interaction.bays,draft.design.upperHeight,outlineCornerMode):[],[selected,draft.design.groundHeight,interaction.bays,outlineEdgeMode,outlineCornerMode]);// eslint-disable-line react-hooks/exhaustive-deps
 const selectedFreeId=selection.level==='opening'&&selection.openings.length===1&&selection.openings[0].kind==='free'?selection.openings[0].id:null;
 const freeChoice=useMemo(()=>selectedFreeId&&recipe?freeOpeningTrimChoices(recipe,draft.design,selectedFreeId,interaction.bays):null,[selectedFreeId,recipe,draft.design,interaction.bays]);
 const rhythmMarks=rhythmOpen?rhythmPanel.highlight(interaction.bays,effectiveTool==='rhythm-face'?interaction.hover:null):null;
 const placedStairs=recipe?.studio.assemblies.filter(a=>a.kind==='stair')??[];

 return {land,plot,draft,recipe,walking,camera,reduced,cam,kitVersion,unified,unifiedFacade,interaction,commit,
  rail,chooseRail,toggleErase,level,setLevel,selection,select,goTo,stepUp,deleteSelection,target,chooseTarget,size:brushSize,sizes,chooseSize,category,interior,tool,effectiveTool,erase,scope,
  buildShape,setBuildShape,openingGroup,setOpeningGroup,openingKind,freePresetId,kitModule,stampId,trimKind,decorKind,roofMode,setRoofMode,roomsTool,setRoomsTool,furnishTool,
  chooseColor,chooseTexture,chooseFreePreset,chooseKitModule,chooseStamp,chooseTrim,chooseDecor,chooseRoofOpening,chooseRoofDetail,useHotbar,hotbar,
  detailModule,roofPresetId,roofModule,roofRotation,floor,channel,setChannel,color,setColor,texture,setTexture,eyedropper,setEyedropper,finish,
  destination,setDestination,exitKind,setExitKind,flip,setFlip,look,setLook,roofScope,setRoofScope,freeBrush,setFreeBrush,band,setBand,bandAround,setBandAround,
  outlineCornerMode,setOutlineCornerMode,outlineEdgeMode,setOutlineEdgeMode,stairLayout,setStairLayout,stairEditing,stairBusy,chooseStair,refitStair,removeStair,placedStairs,
  interiorEditId,setInteriorEditId,floorViewMode,setFloorViewMode,interiorDoorStyle,setInteriorDoorStyle,interiorDoorHinge,setInteriorDoorHinge,
  selectedRoomId,setSelectedRoomId,selectedRoom,roomChoices,editRoom,furnitureKind,furnitureRotation,selectedFurnitureId,selectFurniture,chooseFurniture,rotateFurniture,removeFurniture,moveFurniture:()=>setToolFromGesture('interior-furniture'),
  help,setHelp,starters,setStarters,collection,setCollection,styleFilter,setStyleFilter,parts,setParts,replace,setReplace,paletteOpen,setPaletteOpen,inspectorOpen,setInspectorOpen,rhythmOpen,setRhythmOpen,variationOpen,setVariationOpen,
  paintRules,paintPicking,rhythmPanel,rhythmPicking,rhythmMarks,partName,tryAnotherLook,diceReady,removeInactive,editPart,editStyle,followWall,duplicate,remove,empty,starter,
  paintWalls,paintPart,paintTiles,eraseItems,removeFreeOpeningById,
  chooseFloor,addInteriorStorey,toggleInteriorFloor,highestStorey,prepared,inactive,shown,selected,style,ghost,splitAtStorey,
  bursts,clearBurst,muted,ring,openRing,closeRing,previewRing,pickRing,view,walk,
  storefrontPreview,hoverOwned,paintTargets,protectedStamp,outlineHandles,cornerSelected:(i:number)=>interaction.outlineSelection?.partId===selected?.id&&!!interaction.outlineSelection?.indices.includes(i),selectedFreeId,freeChoice,
  colors:STUDIO_COLORS};
}
export type StudioState=ReturnType<typeof useStudioState>;

export const TRIM_LABELS:Record<TrimKind,string>={shutters:'Shutters','window-box':'Flower box',keystone:'Keystone',hood:'Hood moulding',lintel:'Stone lintel','sill-brackets':'Sill brackets',canopy:'Canopy',lamps:'Lamps'};
export const DECOR_LABELS:Record<StudioAssemblyKind,string>={balcony:'Balcony',cornice:'Cornice',canopy:'Canopy',stair:'Stair',pilaster:'Pilaster',ornament:'Ornament',planter:'Planter',light:'Light'};
