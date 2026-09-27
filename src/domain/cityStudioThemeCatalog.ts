/**
 * Facade themes (local construction studio only; docs/city-studio-themes.md).
 *
 * A theme is pure data describing how a whole part (or building) looks: its facade rhythm (pools, coverage, pattern,
 * uniformity per layer), colours and materials, roof, paint rules, a ground-floor storefront plan, facade decorations
 * (balconies, fire escapes, AC units, signs, lanterns, awnings, cornices, belt courses, piers, street objects) and
 * rooftop props. Applying a theme (cityStudioThemes.applyFacadeTheme) writes its rhythm, colours and roof as ordinary
 * editable settings and stores a small reference, `studio.facadeThemes`: [{id, theme, partId?, seed, palette?, tune?,
 * locks?, seeds?, detached?}]. Everything else resolves from that reference at resolve time
 * (cityStudioThemeExpand: storefronts, paint rules, edge strips, entrance; cityStudioThemeDecor: decorations and roof
 * props), so a theme re-fits when a part is resized or reshaped, and fills around hand-placed items.
 *
 * This module is a leaf (no runtime imports): cityStudio.validateStudio imports its validator.
 */
import type {StudioFamily,StudioFinish,StudioRoof,StudioRoofSettings} from './cityStudioTypes.ts';
import type {RhythmLayers,RhythmStyle,RhythmTrims} from './cityStudioFacadeRhythm.ts';
import type {PaintRuleBand,PaintRuleFloors,PaintRuleKind} from './cityStudioPaintRules.ts';

/** Style tags, the same ids as the studio's style filter. */
export type ThemeTag='tokyo'|'nyc'|'paris'|'london'|'italian'|'modern'|'classic';
export const THEME_DECOR_KINDS=['fire-escape','balcony','sign','lantern','pipes','ac','awning','shop-lights','lamp','cornice','belt','pier','street','ornament'] as const;
export type ThemeDecorKind=typeof THEME_DECOR_KINDS[number];
/** Tunable, lockable and rerollable aspects stored on the reference (rhythm layers tune the rhythm itself). */
export const THEME_ASPECTS=['shops',...THEME_DECOR_KINDS,'roof'] as const;
export type ThemeAspect=typeof THEME_ASPECTS[number];
/** Storeys a decoration uses: building floor indices, or relative to the part (`top` = its top storey). */
export type ThemeFloors='ground'|'upper'|'top'|'below-top'|'all'|number[];
export type ThemeBalcony='iron'|'classic'|'slab'|'juliet';
export type ThemeDecor={kind:ThemeDecorKind;
 /** Weighted kit modules (the kind's default when absent). */
 modules?:[string,number][];
 /** Per-slot probability (0..1): per column cell, per face for edge strips and lines, per ground bay for street objects. */
 density:number;floors?:ThemeFloors;
 /** How rolls are shared: stacked (per column, all storeys), alternating (per column, every other storey), random (per cell), row (per storey). */
 align?:'stacked'|'alternating'|'random'|'row';
 /** Outer columns: avoid them, use only them, or any. */
 corners?:'avoid'|'only'|'any';
 /** Faces used: the street faces (the default for ground-level kinds) or every dressed face. */
 sides?:'street'|'all';
 /** Balconies. */
 variant?:ThemeBalcony;span?:'column'|'run';depth?:number;
 /** Edge strips (sign, lantern, pipes): which end of the face. */
 edge?:'left'|'right'|'either'};
/** Ground-floor storefronts: stamp families (`stamp-sf-bodega`, `stamp-tokyo-ramen`...; every span of the family fits). */
export type ThemeShops={pool:[family:string,weight:number][];density:number;
 /** 0: shops and gaps alternate regularly; 1: gaps fall at random. */
 random:number;
 /** A kit door for the upper floors' entrance, on its own bay. */
 entrance?:{module:string;at:'start'|'end'|'centre'|'random'};
 sides?:'street'|'all'};
export type ThemePaint={kind:PaintRuleKind;channel?:'wall'|'trim';finish:StudioFinish|'trim'|'frame'|'door';floors?:PaintRuleFloors;band?:PaintRuleBand;quoins?:{width:number;course?:number};alternate?:{phase:0|1}};
export type ThemePalette={wall:StudioFinish;trim:string;frame:string;door:string};
export type FacadeTheme={id:string;label:string;blurb:string;tags:ThemeTag[];
 /** The rhythm style this theme replaces in the old style chooser. */
 legacy?:RhythmStyle;
 /** Standard building for thumbnails and empty plots. */
 starter:{width:number;depth:number;floors:number};
 rhythm:{style:RhythmStyle;variety:number;bay?:number;density?:number;trims:RhythmTrims;layers?:RhythmLayers};
 look:{family:StudioFamily;palettes:ThemePalette[];roof:StudioRoof;roofSettings?:StudioRoofSettings};
 paint?:ThemePaint[];shops?:ThemeShops;decor:ThemeDecor[];roof?:{pool:[string,number][];density:number}};

const m=(id:string)=>`module:${id}`;
const pool=(...entries:[string,number][])=>entries.map(([id,weight])=>({id,weight}));
const brick=(color:string):StudioFinish=>({color,texture:'brick'}),plaster=(color:string):StudioFinish=>({color,texture:'plaster'}),concrete=(color:string):StudioFinish=>({color,texture:'concrete'});
const P=(wall:StudioFinish,trim:string,frame:string,door:string):ThemePalette=>({wall,trim,frame,door});

export const FACADE_THEMES:FacadeTheme[]=[
 {id:'nyc-tenement',label:'NYC walk-up tenement',tags:['nyc'],blurb:'Five brick storeys of sashes with fire escapes, window AC units, a pressed-metal cornice and a bodega or deli below.',
  starter:{width:12,depth:10,floors:5},
  rhythm:{style:'shopfront',variety:.3,bay:2.8,trims:'simple',layers:{upper:{pool:pool([m('window-nyc-sash'),3],[m('window-nyc-paired'),1]),uniformity:.75},attic:{pool:pool([m('window-nyc-sash'),1]),uniformity:1},trims:{pool:pool(['lintel',1],['sill-brackets',.4]),coverage:.9}}},
  look:{family:'warm-brick',palettes:[P(brick('#9a5a45'),'#e8dcc6','#2f3a36','#6d2e24'),P(brick('#7c4a3a'),'#d9cdb4','#343c3a','#2f4a3e'),P(brick('#a8745a'),'#efe4cf','#3b3530','#7a2c2c')],roof:'flat',roofSettings:{boundary:'parapet'}},
  shops:{pool:[['stamp-sf-bodega',3],['stamp-sf-deli',2],['stamp-sf-laundromat',1],['stamp-sf-barber',1]],density:.8,random:.3,entrance:{module:'door-lobby',at:'start'}},
  decor:[{kind:'fire-escape',density:.9},{kind:'ac',density:.28,floors:'upper',align:'random'},{kind:'cornice',modules:[['nyc-cornice',1]],density:1},{kind:'belt',modules:[['nyc-band',1]],density:1,floors:[1]}],
  roof:{pool:[['nyc-water-tank',2],['nyc-chimney',1],['nyc-vent',1],['nyc-hatch',1]],density:.55}},
 {id:'nyc-cast-iron',label:'NYC cast-iron loft',tags:['nyc'],legacy:'loft',blurb:'SoHo cast iron: tall uniform loft windows between piers, a storey band on every floor and a full glazed storefront base.',
  starter:{width:14,depth:12,floors:5},
  rhythm:{style:'loft',variety:.15,bay:2.9,trims:'none',layers:{upper:{pool:pool([m('window-nyc-loft'),4],[m('window-nyc-industrial'),1]),uniformity:.95},attic:{pool:pool([m('window-nyc-loft'),1]),uniformity:1}}},
  look:{family:'pale-limestone',palettes:[P(plaster('#d9d2c1'),'#efe9dc','#39403f','#2c3432'),P(plaster('#c7cdc6'),'#e6ebe4','#2e3533','#4b2e28'),P(plaster('#d8c6a8'),'#f1e7d3','#443a33','#2d3b44')],roof:'flat',roofSettings:{boundary:'parapet'}},
  shops:{pool:[['stamp-sf-boutique',3],['stamp-sf-deli',1],['stamp-sf-closed',1]],density:.95,random:.1,entrance:{module:'door-collection-bank',at:'centre'}},
  decor:[{kind:'pier',modules:[['nyc-pier',1]],density:1,corners:'any',floors:'upper'},{kind:'belt',modules:[['nyc-band',1]],density:1,floors:'upper'},{kind:'cornice',modules:[['nyc-cornice',1]],density:1}],
  roof:{pool:[['nyc-water-tank',1],['nyc-hatch',1],['collection-skylight',1]],density:.45}},
 {id:'nyc-brownstone',label:'NYC brownstone',tags:['nyc'],blurb:'Symmetric sandstone row house: arched parlour windows, hooded sashes with flower boxes and a lamp-lit entrance.',
  starter:{width:8,depth:12,floors:4},
  rhythm:{style:'townhouse',variety:.2,bay:2.8,trims:'rich',layers:{ground:{pool:pool(['arch',2],[m('window-collection-bay'),1]),uniformity:.8},upper:{pool:pool([m('window-nyc-sash'),3],['arch',1]),uniformity:.85},attic:{pool:pool([m('window-nyc-sash'),1]),uniformity:1},trims:{pool:pool(['hood',2],['keystone',1],['window-box',1],['canopy',1],['lamps',1]),coverage:.9}}},
  look:{family:'warm-brick',palettes:[P(plaster('#7a5243'),'#c9b494','#2b2a28','#3a2a22'),P(plaster('#8a6250'),'#d6c2a0','#303230','#5a2a22'),P(plaster('#6b4a3e'),'#c2ab8a','#282a28','#243a30')],roof:'flat',roofSettings:{boundary:'parapet'}},
  paint:[{kind:'band',finish:'trim',band:{at:'base',offset:0,height:.9}}],
  decor:[{kind:'cornice',modules:[['nyc-cornice',1]],density:1},{kind:'balcony',variant:'juliet',density:.35,floors:[1],align:'stacked',corners:'avoid'},{kind:'lamp',density:.8,sides:'street'}],
  roof:{pool:[['nyc-chimney',2],['nyc-vent',1]],density:.5}},
 {id:'tokyo-zakkyo',label:'Tokyo zakkyo building',tags:['tokyo'],legacy:'tokyo',blurb:'Dense and random: ribbon windows, AC units, a stack of vertical signs, pipes and a rooftop billboard over konbini and izakaya.',
  starter:{width:8,depth:12,floors:6},
  rhythm:{style:'tokyo',variety:.55,bay:2.4,trims:'none',layers:{upper:{pool:pool([m('window-tokyo-strip'),2],[m('window-tokyo-sash-ac'),1.4],[m('window-tokyo-sash'),1],[m('window-tokyo-grille'),.5]),uniformity:.2,pattern:'independent'},attic:{pool:pool([m('window-tokyo-strip'),1],[m('window-tokyo-sash-ac'),.5]),uniformity:.6}}},
  look:{family:'pale-limestone',palettes:[P(concrete('#c9c5bb'),'#f1efe8','#8f989c','#b23a2e'),P(concrete('#b9bcb8'),'#e9ebe7','#6f7a80','#2f4a7a'),P(plaster('#d6cfc2'),'#f4f0e8','#7d8589','#a7332b')],roof:'flat',roofSettings:{boundary:'parapet'}},
  shops:{pool:[['stamp-tokyo-konbini',2],['stamp-tokyo-izakaya',2],['stamp-tokyo-ramen',2],['stamp-sf-shokudo',1]],density:.85,random:.6,entrance:{module:'door-tokyo-stair',at:'start'}},
  decor:[{kind:'sign',modules:[['wall-tokyo-sign',2],['wall-tokyo-sign-flat',1]],density:.95,floors:'upper',edge:'right'},{kind:'pipes',density:.5,floors:'all',edge:'left'},{kind:'ac',density:.18,floors:'upper',align:'random'}],
  roof:{pool:[['tokyo-roof-billboard',1],['tokyo-roof-water-tank',2],['tokyo-roof-ac-cluster',2],['tokyo-roof-antenna',1],['tokyo-roof-stairhouse',1]],density:.75}},
 {id:'tokyo-shotengai',label:'Tokyo shotengai shophouse',tags:['tokyo'],blurb:'Shutter shops, ramen and izakaya under awnings and lanterns, with rail balconies and laundry above.',
  starter:{width:10,depth:10,floors:3},
  rhythm:{style:'tokyo',variety:.5,bay:2.4,trims:'none',layers:{upper:{pool:pool([m('window-tokyo-balcony-rail'),2],[m('window-tokyo-sash-ac'),1],[m('window-tokyo-sash'),1],[m('window-tokyo-shoji'),.6]),uniformity:.25}}},
  look:{family:'pale-limestone',palettes:[P(plaster('#d8cfbf'),'#f3efe4','#7d8589','#2f4a7a'),P(plaster('#cfc4b0'),'#efe7d6','#5a4636','#a7332b'),P(concrete('#c4c3bd'),'#f1efe8','#6f7a80','#3f6a4a')],roof:'flat',roofSettings:{boundary:'rail'}},
  shops:{pool:[['stamp-tokyo-shutter',2],['stamp-tokyo-ramen',2],['stamp-tokyo-izakaya',1],['stamp-tokyo-konbini',1]],density:.95,random:.4},
  decor:[{kind:'lantern',density:.55,floors:[1],edge:'either'},{kind:'ac',density:.2,floors:'upper',align:'random'},{kind:'street',modules:[['street-bicycle',2],['street-tokyo-pots',2],['street-floor-lanterns',1]],density:.35}],
  roof:{pool:[['tokyo-roof-laundry',2],['tokyo-roof-water-tank',1],['tokyo-roof-antenna',1]],density:.6}},
 {id:'tokyo-mansion',label:'Tokyo mansion apartment',tags:['tokyo'],blurb:'Uniform enclosed and rail balconies with laundry poles, a glazed lobby, meters and AC units on every floor.',
  starter:{width:10,depth:11,floors:5},
  rhythm:{style:'tokyo',variety:.2,bay:2.4,trims:'none',layers:{ground:{pool:pool([m('window-tokyo-grille'),2],[m('window-tokyo-shop-shutter-closed'),1]),uniformity:.7},upper:{pool:pool([m('window-tokyo-balcony'),3],[m('window-tokyo-balcony-rail'),1]),uniformity:.85},attic:{pool:pool([m('window-tokyo-balcony'),1]),uniformity:1}}},
  look:{family:'pale-limestone',palettes:[P(plaster('#e0ddd4'),'#f4f2ec','#9aa2a6','#56687a'),P(concrete('#d2d0c8'),'#eeede7','#8c9498','#6b5a48'),P(plaster('#e6dccb'),'#f6f0e2','#a39a8e','#4b5d6b')],roof:'flat',roofSettings:{boundary:'parapet'}},
  shops:{pool:[['stamp-tokyo-konbini',1]],density:.2,random:.5,entrance:{module:'door-tokyo-sliding',at:'centre'}},
  decor:[{kind:'pipes',density:.8,floors:'all',edge:'right'},{kind:'ac',density:.3,floors:'upper',align:'stacked'}],
  roof:{pool:[['tokyo-roof-water-tank',2],['tokyo-roof-stairhouse',1],['tokyo-roof-antenna',1],['tokyo-roof-railing',1]],density:.6}},
 {id:'london-georgian',label:'London Georgian townhouse',tags:['london'],legacy:'townhouse',blurb:'Stock brick over a stucco ground floor: symmetric sashes, tall first-floor windows with iron balconettes, a string course and cornice.',
  starter:{width:9,depth:12,floors:4},
  rhythm:{style:'townhouse',variety:.1,bay:2.4,trims:'simple',layers:{upper:{pool:pool(['rect',4],['tall',.4]),uniformity:.95},attic:{pool:pool(['rect',1]),uniformity:1},trims:{pool:pool(['lintel',2],['keystone',1],['canopy',1],['lamps',1]),coverage:1}}},
  look:{family:'warm-brick',palettes:[P(brick('#b59a78'),'#f1ebdd','#1f2a26','#1d2b3a'),P(brick('#a88468'),'#eee6d6','#26302c','#3a1f24'),P(brick('#c1a887'),'#f5efe2','#2a2f2c','#243a2c')],roof:'mansard',roofSettings:{boundary:'parapet',finish:'slate'}},
  paint:[{kind:'floors',finish:{color:'#efe8da',texture:'plaster'},floors:'ground'},{kind:'band',finish:'trim',band:{at:'storeys',offset:-.12,height:.24}}],
  decor:[{kind:'balcony',variant:'juliet',density:.8,floors:[1],align:'row',corners:'any'},{kind:'cornice',modules:[['cornice',1]],density:1},{kind:'lamp',density:.6,sides:'street'}],
  roof:{pool:[['nyc-chimney',1]],density:.5}},
 {id:'london-high-street',label:'London Victorian high street',tags:['london'],legacy:'shopfront',blurb:'A parade of pub, bookshop, butcher and greengrocer with bay windows, hanging baskets and a brick cornice line.',
  starter:{width:16,depth:10,floors:3},
  rhythm:{style:'shopfront',variety:.35,bay:2.8,trims:'simple',layers:{upper:{pool:pool([m('window-collection-bay'),2],['paired',1.4],['arch',.6]),uniformity:.55},trims:{pool:pool(['hood',1],['keystone',1],['sill-brackets',.5]),coverage:.8}}},
  look:{family:'warm-brick',palettes:[P(brick('#b2785c'),'#efe6d2','#233d33','#3d5a8a'),P(brick('#8f5a44'),'#e9dcc4','#2b2b2b','#5b2a2a'),P(brick('#c08a68'),'#f3ead8','#243344','#2f5a3a')],roof:'pitched',roofSettings:{boundary:'parapet',finish:'slate',ridge:'x'}},
  paint:[{kind:'band',finish:'trim',band:{at:'storeys',offset:-.1,height:.2}}],
  shops:{pool:[['stamp-sf-pub',2],['stamp-sf-bookshop',2],['stamp-sf-butcher',1],['stamp-sf-greengrocer',2]],density:.9,random:.3,entrance:{module:'door-collection-cottage',at:'start'}},
  decor:[{kind:'cornice',modules:[['cornice',1]],density:1},{kind:'ornament',modules:[['floral-relief',1]],density:.25,floors:'top',align:'row'}],
  roof:{pool:[['nyc-chimney',1]],density:.7}},
 {id:'paris-haussmann',label:'Paris Haussmann',tags:['paris'],blurb:'Limestone boulevard block: French windows, continuous wrought balconies on the second and fifth floors, a mansard and a café ground floor.',
  starter:{width:16,depth:12,floors:6},
  rhythm:{style:'townhouse',variety:.1,bay:2.5,trims:'simple',layers:{upper:{pool:pool(['tall',4],['rect',.3]),uniformity:.97},attic:{pool:pool(['rect',2],['round',1]),uniformity:.6},trims:{pool:pool(['keystone',1],['sill-brackets',1],['lintel',1]),coverage:1}}},
  look:{family:'pale-limestone',palettes:[P(plaster('#e3d8c3'),'#efe6d4','#1f2a30','#1f3b4d'),P(plaster('#d9ccb3'),'#ebe1cc','#2a2f33','#6d2230'),P(plaster('#e8e0cf'),'#f3ecdd','#2b3a3a','#2c4a3a')],roof:'mansard',roofSettings:{boundary:'none',finish:'slate'}},
  paint:[{kind:'band',finish:'trim',band:{at:'storeys',offset:-.12,height:.24}}],
  shops:{pool:[['stamp-sf-cafe',3],['stamp-sf-boulangerie',2],['stamp-sf-florist',2],['stamp-sf-pharmacy',1],['stamp-sf-modiste',1]],density:.9,random:.35,entrance:{module:'door-collection-villa',at:'random'}},
  decor:[{kind:'balcony',variant:'iron',span:'run',density:1,floors:[2,5]},{kind:'balcony',variant:'juliet',density:.7,floors:[1,3,4],align:'row'},{kind:'cornice',modules:[['collection-civic-cornice',1]],density:1},{kind:'belt',modules:[['string-course',1]],density:1,floors:[1]}],
  roof:{pool:[['nyc-chimney',1]],density:.4}},
 {id:'amsterdam-canal',label:'Amsterdam canal house',tags:['classic'],blurb:'Narrow and tall in dark brick with a steep gable, white window frames stacked up the front and bicycles by the door.',
  starter:{width:6,depth:12,floors:4},
  rhythm:{style:'townhouse',variety:.15,bay:2.1,trims:'simple',layers:{upper:{pool:pool(['rect',3],['tall',1]),uniformity:.9},attic:{pool:pool(['arch',1],['round',1]),uniformity:.7},trims:{pool:pool(['lintel',1],['keystone',1]),coverage:.8}}},
  look:{family:'warm-brick',palettes:[P(brick('#6b3a2e'),'#f4f1ea','#f4f1ea','#1f4a3a'),P(brick('#4f3a33'),'#efeae0','#efeae0','#243a55'),P(brick('#7e4a36'),'#f6f2e8','#f6f2e8','#5a1f24')],roof:'pitched',roofSettings:{rise:4,ridge:'z',finish:'slate',overhang:.1}},
  shops:{pool:[['stamp-sf-bookshop',1],['stamp-sf-florist',1]],density:.25,random:.8},
  decor:[{kind:'street',modules:[['street-bicycle',2],['street-bike-rack',1],['street-planters-pair',1]],density:.45},{kind:'lamp',density:.5,sides:'street'}]},
 {id:'italian-palazzo',label:'Italian palazzo',tags:['italian'],blurb:'Ochre render over an arched stone ground floor, shuttered arched windows, a stone balcony on the piano nobile and a trattoria.',
  starter:{width:16,depth:12,floors:4},
  rhythm:{style:'civic',variety:.25,bay:3,trims:'rich',layers:{upper:{pool:pool(['arch',3],['rect',1]),uniformity:.85},trims:{pool:pool(['shutters',2],['keystone',1],['sill-brackets',.5]),coverage:.9}}},
  look:{family:'pastel-stucco',palettes:[P(plaster('#d9a86c'),'#f0e2c4','#51613c','#9c3a2a'),P(plaster('#c98a5e'),'#efdcc0','#3f5a44','#6b2e22'),P(plaster('#e0b884'),'#f4e8cf','#5b6a3a','#7a3a2a')],roof:'hip',roofSettings:{finish:'terracotta',overhang:.45,rise:2}},
  paint:[{kind:'floors',finish:{color:'#cdbb9c',texture:'plaster'},floors:'ground'},{kind:'quoins',finish:'trim',quoins:{width:.6,course:.45}}],
  shops:{pool:[['stamp-sf-trattoria',2],['stamp-sf-gelateria',1],['stamp-sf-alimentari',1]],density:.45,random:.4},
  decor:[{kind:'balcony',variant:'classic',density:.5,floors:[1],align:'row',corners:'avoid'},{kind:'cornice',modules:[['collection-civic-cornice',1]],density:1},{kind:'lamp',density:.5,sides:'street'}],
  roof:{pool:[['nyc-chimney',1]],density:.3}},
 {id:'mediterranean-village',label:'Mediterranean village house',tags:['italian'],blurb:'Whitewashed and sparse: a few small, randomly placed shuttered windows, blue doors, flower pots and a flat terrace.',
  starter:{width:9,depth:9,floors:2},
  rhythm:{style:'cottage',variety:.7,bay:2.6,trims:'simple',layers:{ground:{pool:pool(['rect',2],['arch',1],['blind',1]),coverage:.75,uniformity:.3,pattern:'independent'},upper:{pool:pool(['rect',2],['round',.7],['arch',.6],['blind',1]),coverage:.6,uniformity:.25,pattern:'independent'},trims:{pool:pool(['shutters',2],['window-box',1]),coverage:.6,pattern:'independent',uniformity:.4}}},
  look:{family:'pastel-stucco',palettes:[P(plaster('#f1ede4'),'#f7f4ee','#2f5f8f','#2f5f8f'),P(plaster('#efe4d0'),'#f6efe2','#3f7a6a','#b0552f'),P(plaster('#f3efe8'),'#faf8f2','#6a8fb5','#1f4e7a')],roof:'terrace',roofSettings:{boundary:'parapet'}},
  decor:[{kind:'street',modules:[['street-planters-pair',2],['street-planter-trough',1],['street-tokyo-pots',1]],density:.45,sides:'all'},{kind:'lamp',density:.35,sides:'all'}],
  roof:{pool:[['collection-lantern',1],['nyc-vent',1]],density:.3}},
 {id:'scandi-modern',label:'Scandinavian modern',tags:['modern'],blurb:'Clean timber and white render, large uniform windows, glass-railed balconies and a dark lean-to roof.',
  starter:{width:12,depth:10,floors:3},
  rhythm:{style:'loft',variety:.1,bay:2.8,trims:'none',layers:{ground:{pool:pool(['wide',2],[m('window-collection-modern'),1]),uniformity:.9},upper:{pool:pool(['wide',3],['tall',1]),uniformity:.9},attic:{pool:pool(['wide',1]),uniformity:1}}},
  look:{family:'pale-limestone',palettes:[P({color:'#8a6a4c',texture:'timber'},'#f2f0ea','#2b2e30','#2b2e30'),P(plaster('#f2f0ea'),'#e6e3db','#2b2e30','#8a6a4c'),P({color:'#4a4d4f',texture:'timber'},'#e9e6df','#1f2224','#c49a5a')],roof:'shed',roofSettings:{finish:'metal',color:'#3a3d40',rise:1.4,overhang:.3}},
  decor:[{kind:'balcony',variant:'slab',density:.35,floors:'upper',align:'stacked',corners:'avoid'}],
  roof:{pool:[['collection-solar',2]],density:.4}},
 {id:'brutalist-civic',label:'Brutalist civic',tags:['modern'],blurb:'Raw concrete, deep and regular: identical windows between projecting fins, heavy slab edges and a blank attic.',
  starter:{width:18,depth:14,floors:5},
  rhythm:{style:'civic',variety:0,bay:3.2,trims:'none',layers:{ground:{pool:pool(['wide',1]),uniformity:1},upper:{pool:pool(['rect',1]),uniformity:1,coverage:1},attic:{pool:pool(['wide',1],['blind',1]),uniformity:1,spacing:1}}},
  look:{family:'pale-limestone',palettes:[P(concrete('#9e9a92'),'#8c8880','#3a3c3c','#4a4c4c'),P(concrete('#b3aea4'),'#a19c92','#2f3131','#5a3a2a'),P(concrete('#8d8a84'),'#7c7973','#2a2c2c','#3a4a5a')],roof:'flat',roofSettings:{boundary:'parapet'}},
  decor:[{kind:'pier',modules:[['collection-civic-pilaster',1]],density:1,corners:'any',floors:'all'},{kind:'belt',modules:[['collection-modern-band',1]],density:1,floors:'upper'},{kind:'cornice',modules:[['collection-deco-band',1]],density:1}],
  roof:{pool:[['collection-hvac',2],['nyc-hatch',1]],density:.5}},
 {id:'art-deco-office',label:'Art deco office',tags:['modern','nyc'],blurb:'Limestone and gold: vertical piers, deco windows, a banded crown and a bronze bank entrance.',
  starter:{width:16,depth:14,floors:6},
  rhythm:{style:'loft',variety:.1,bay:2.8,trims:'none',layers:{ground:{pool:pool([m('window-collection-museum'),2],[m('window-collection-deco'),1]),uniformity:.9},upper:{pool:pool([m('window-collection-deco'),3],[m('window-collection-hotel'),.5]),uniformity:.95},attic:{pool:pool([m('window-collection-deco'),1]),uniformity:1}}},
  look:{family:'pale-limestone',palettes:[P(plaster('#d8cfb8'),'#c8a24a','#2d2a24','#6a4f22'),P(plaster('#cfc6b2'),'#b8b0a0','#262626','#3a3a3a'),P(plaster('#e0d4bc'),'#a8844a','#2b2620','#5b3a22')],roof:'flat',roofSettings:{boundary:'parapet'}},
  shops:{pool:[['stamp-sf-boutique',1]],density:.25,random:.3,entrance:{module:'door-collection-bank',at:'centre'}},
  decor:[{kind:'pier',modules:[['collection-deco-pilaster',1]],density:1,corners:'any',floors:'upper'},{kind:'belt',modules:[['collection-deco-band',1]],density:1,floors:[1]},{kind:'cornice',modules:[['collection-deco-band',1]],density:1}],
  roof:{pool:[['collection-hvac',1],['collection-lantern',1]],density:.4}},
 {id:'glass-office',label:'Glass modern office',tags:['modern'],blurb:'A curtain wall of floor-to-ceiling glass with thin slab bands, a glazed lobby and a coffee kiosk.',
  starter:{width:16,depth:14,floors:6},
  rhythm:{style:'loft',variety:0,bay:2.8,trims:'none',layers:{ground:{pool:pool([m('window-collection-bridge'),2],[m('window-collection-modern'),1]),uniformity:.9},upper:{pool:pool([m('window-collection-curtain'),1]),uniformity:1},attic:{pool:pool([m('window-collection-curtain'),1]),uniformity:1}}},
  look:{family:'pale-limestone',palettes:[P({color:'#4a5057',texture:'metal'},'#8d949b','#2a2f33','#2a2f33'),P({color:'#6b7680',texture:'metal'},'#b9c2c9','#1f2428','#3a4a5a'),P({color:'#2f3438',texture:'metal'},'#6f777d','#1a1d20','#8a6a3a')],roof:'flat',roofSettings:{boundary:'rail'}},
  shops:{pool:[['stamp-sf-kiosk',1],['stamp-sf-boutique',1]],density:.25,random:.5,entrance:{module:'door-collection-museum',at:'centre'}},
  decor:[{kind:'belt',modules:[['collection-modern-band',1]],density:1,floors:'upper'}],
  roof:{pool:[['collection-hvac',2],['collection-solar',1]],density:.6}},
 {id:'suburban-cottage',label:'Suburban cottage',tags:['classic'],legacy:'cottage',blurb:'Two pastel storeys of cottage windows with shutters and flower boxes, a lamp by the door and a gabled roof.',
  starter:{width:10,depth:9,floors:2},
  rhythm:{style:'cottage',variety:.3,bay:2.9,trims:'rich',layers:{ground:{pool:pool([m('window-collection-craftsman'),2],[m('window-collection-cottage'),1]),uniformity:.7},upper:{pool:pool([m('window-collection-cottage'),3],['round',.3]),uniformity:.8},trims:{pool:pool(['shutters',2],['window-box',1],['lamps',1],['canopy',1]),coverage:.85}}},
  look:{family:'pastel-stucco',palettes:[P(plaster('#bdc8ad'),'#f0e6cf','#5d7163','#546f64'),P(plaster('#e2c9b5'),'#f6ecdc','#6b5a4a','#7a3a3a'),P(plaster('#c9d6e0'),'#f3f1ea','#4a5f70','#2f4a5f')],roof:'pitched',roofSettings:{finish:'terracotta',overhang:.35,ridge:'x',rise:2.2}},
  shops:{pool:[],density:0,random:0,entrance:{module:'door-collection-cottage',at:'centre'}},
  decor:[{kind:'street',modules:[['street-planters-pair',1],['street-bench-planter',1]],density:.3}],
  roof:{pool:[['nyc-chimney',1]],density:.4}},
 {id:'warehouse-conversion',label:'Warehouse conversion',tags:['nyc','classic'],legacy:'warehouse',blurb:'Brick warehouse turned lofts: arched industrial windows, a painted sign band, a fire escape, a closed shutter shop and water tanks.',
  starter:{width:18,depth:14,floors:4},
  rhythm:{style:'warehouse',variety:.3,bay:3.2,trims:'simple',layers:{upper:{pool:pool([m('window-nyc-industrial'),2],['arch',1],['paired',.6]),uniformity:.7}}},
  look:{family:'warm-brick',palettes:[P(brick('#8e4f3a'),'#d8c7ae','#2f3432','#4a3a2e'),P(brick('#a56a50'),'#e3d4bd','#3a3f3c','#2f4a3e'),P(brick('#6f4436'),'#cdbca3','#2a2e2c','#7a2c24')],roof:'flat',roofSettings:{boundary:'parapet'}},
  shops:{pool:[['stamp-sf-closed',2],['stamp-sf-laundromat',1],['stamp-sf-kiosk',1]],density:.45,random:.5},
  decor:[{kind:'fire-escape',density:.6},{kind:'belt',modules:[['nyc-sign',1]],density:.7,floors:[1]},{kind:'cornice',modules:[['nyc-parapet',1]],density:1}],
  roof:{pool:[['nyc-water-tank',2],['collection-hvac',1],['collection-skylight',2]],density:.6}},
 {id:'chinatown-shophouse',label:'Chinatown shophouse',tags:['tokyo','nyc'],blurb:'Busy shop signs and red lanterns, striped awnings over every shop and a first-floor veranda balcony.',
  starter:{width:12,depth:12,floors:4},
  rhythm:{style:'shopfront',variety:.4,bay:2.8,trims:'simple',layers:{upper:{pool:pool(['paired',2],[m('window-tokyo-grille'),1],['rect',1]),uniformity:.55},trims:{pool:pool(['lintel',1],['sill-brackets',1]),coverage:.6}}},
  look:{family:'pastel-stucco',palettes:[P(plaster('#cfd8c6'),'#f1eee4','#8a2a24','#b23a2e'),P(plaster('#e8d8b8'),'#f6eedd','#2f5a4a','#b23a2e'),P(plaster('#d6c3c3'),'#f3ebe8','#3a4a5a','#a7332b')],roof:'flat',roofSettings:{boundary:'rail'}},
  shops:{pool:[['stamp-tokyo-konbini',1],['stamp-tokyo-izakaya',1],['stamp-sf-shokudo',1],['stamp-sf-bodega',1]],density:.95,random:.3},
  decor:[{kind:'sign',modules:[['wall-tokyo-sign',1],['wall-tokyo-sign-flat',1]],density:.8,floors:'upper',edge:'either'},{kind:'lantern',density:.6,floors:'upper',edge:'either'},{kind:'shop-lights',modules:[['shop-lanterns-pair',1]],density:.6},{kind:'balcony',variant:'classic',span:'run',density:.6,floors:[1]}],
  roof:{pool:[['tokyo-roof-water-tank',1],['tokyo-roof-ac-cluster',1],['tokyo-roof-antenna',1]],density:.5}},
 {id:'seaside',label:'Beach and seaside',tags:['modern','italian'],blurb:'Bright pastel render, striped awnings, open balconies, a gelateria with parasols and a sunny roof terrace.',
  starter:{width:12,depth:10,floors:3},
  rhythm:{style:'cottage',variety:.35,bay:2.7,trims:'simple',layers:{ground:{pool:pool(['wide',2],['door',1]),uniformity:.6},upper:{pool:pool(['tall',3],['rect',1]),uniformity:.8},trims:{pool:pool(['shutters',1]),coverage:.5}}},
  look:{family:'pastel-stucco',palettes:[P(plaster('#a8d8c8'),'#fbf8f0','#2f6f8f','#2f6f8f'),P(plaster('#f2c6c2'),'#fdf7f2','#3f7a9a','#e07a4a'),P(plaster('#f3dc8a'),'#fbf6e6','#2f6a7a','#2f6a7a')],roof:'terrace',roofSettings:{boundary:'rail'}},
  shops:{pool:[['stamp-sf-gelateria',2],['stamp-sf-kiosk',1]],density:.4,random:.6},
  decor:[{kind:'balcony',variant:'slab',density:.55,floors:'upper',align:'stacked'},{kind:'awning',modules:[['canopy-awning',1]],density:.7,sides:'street'},{kind:'street',modules:[['street-cafe-parasol',2],['street-bench',1],['street-ice-cream-freezer',1]],density:.4}],
  roof:{pool:[['collection-lantern',1]],density:.2}},
 {id:'soviet-block',label:'Soviet panel block',tags:['modern'],blurb:'Prefabricated concrete panels in a strict grid, stacked slab balconies, panel joints on every floor and antennas on the roof.',
  starter:{width:20,depth:12,floors:6},
  rhythm:{style:'loft',variety:0,bay:2.7,trims:'none',layers:{ground:{pool:pool(['rect',1]),uniformity:1},upper:{pool:pool(['rect',3],[m('window-tokyo-balcony'),1]),uniformity:.8,pattern:'aligned'},attic:{pool:pool(['rect',1]),uniformity:1}}},
  look:{family:'pale-limestone',palettes:[P(concrete('#b7b2a6'),'#9b968b','#6a6e6c','#5a4a3a'),P(concrete('#c4bfb3'),'#a8a397','#4f5a60','#6a4a3a'),P(concrete('#a9aea8'),'#8f948e','#5a5f5c','#3a4a5a')],roof:'flat',roofSettings:{boundary:'none'}},
  paint:[{kind:'band',finish:{color:'#8f8b82',texture:'concrete'},band:{at:'storeys',offset:-.04,height:.08}},{kind:'alternate',finish:{color:'#aaa497',texture:'concrete'},alternate:{phase:0},floors:'upper'}],
  shops:{pool:[],density:0,random:0,entrance:{module:'door-lobby',at:'centre'}},
  decor:[{kind:'balcony',variant:'slab',density:.35,floors:'upper',align:'stacked',corners:'avoid'}],
  roof:{pool:[['tokyo-roof-antenna',2],['tokyo-roof-stairhouse',1],['nyc-vent',1]],density:.6}},
 {id:'mexican-colonial',label:'Mexican colonial',tags:['classic','italian'],blurb:'Saturated colours, an arcade of arches along the street, iron balconies over shuttered windows and a painted plinth.',
  starter:{width:14,depth:12,floors:2},
  rhythm:{style:'civic',variety:.3,bay:3,trims:'rich',layers:{upper:{pool:pool(['tall',2],['arch',1]),uniformity:.8},trims:{pool:pool(['shutters',1],['keystone',1],['window-box',.5]),coverage:.8}}},
  look:{family:'pastel-stucco',palettes:[P(plaster('#d9573f'),'#f3e3c3','#2f3a4a','#1f4a8a'),P(plaster('#2f6fb0'),'#f5ead0','#3a2a22','#d9a13f'),P(plaster('#e8b33f'),'#f7ecd2','#6a2a22','#2f7a5a')],roof:'flat',roofSettings:{boundary:'parapet'}},
  paint:[{kind:'band',finish:'trim',band:{at:'base',offset:0,height:.8}},{kind:'band',finish:'trim',band:{at:'top',offset:0,height:.35}}],
  decor:[{kind:'balcony',variant:'iron',density:.6,floors:'upper',align:'stacked'},{kind:'lamp',density:.5,sides:'street'},{kind:'street',modules:[['street-planters-pair',1],['street-produce-baskets',1]],density:.3}],
  roof:{pool:[['collection-lantern',1],['nyc-vent',1]],density:.3}},
 {id:'victorian-terrace',label:'Victorian terrace',tags:['london'],blurb:'Red-brick terraced houses with canted bay windows, hooded sashes, cream string courses, chimneys and a slate roof.',
  starter:{width:12,depth:10,floors:3},
  rhythm:{style:'townhouse',variety:.2,bay:2.8,trims:'rich',layers:{ground:{pool:pool([m('window-collection-bay'),3],['arch',1]),uniformity:.85},upper:{pool:pool([m('window-collection-townhouse'),2],['arch',1]),uniformity:.8},trims:{pool:pool(['hood',2],['keystone',1],['lamps',1],['canopy',1]),coverage:.9}}},
  look:{family:'warm-brick',palettes:[P(brick('#a4523e'),'#efe3c8','#2a3a34','#2f3f6a'),P(brick('#8a4a3a'),'#e8dcc0','#2a2a2a','#6a2a2a'),P(brick('#b56a4e'),'#f3e8d0','#304030','#2f5a3a')],roof:'pitched',roofSettings:{finish:'slate',ridge:'x',rise:2.4}},
  paint:[{kind:'band',finish:'trim',band:{at:'storeys',offset:-.1,height:.2}}],
  decor:[{kind:'ornament',modules:[['floral-relief',1]],density:.3,floors:'top',align:'row'}],
  roof:{pool:[['nyc-chimney',1]],density:.8}},
 {id:'german-half-timber',label:'Old-town half-timber',tags:['classic'],blurb:'Cream plaster criss-crossed by dark timber bands and corner posts over a stone plinth, small paired windows and a steep roof.',
  starter:{width:9,depth:10,floors:3},
  rhythm:{style:'cottage',variety:.3,bay:2.4,trims:'simple',layers:{ground:{pool:pool(['rect',2],['arch',1]),coverage:.85},upper:{pool:pool(['paired',2],['rect',1]),uniformity:.7},attic:{pool:pool(['rect',1],['round',1])},trims:{pool:pool(['shutters',1],['window-box',1]),coverage:.6}}},
  look:{family:'pastel-stucco',palettes:[P(plaster('#efe6d2'),'#4a3526','#4a3526','#5a2a22'),P(plaster('#f2e9d8'),'#3a2a20','#3a2a20','#2f4a3a'),P(plaster('#e8dcc4'),'#5a3a2a','#5a3a2a','#6a2a22')],roof:'pitched',roofSettings:{finish:'terracotta',rise:4.2,ridge:'x',overhang:.35}},
  paint:[{kind:'band',finish:{color:'#9a9184',texture:'plaster'},band:{at:'base',offset:0,height:.8}},{kind:'band',finish:{color:'#4a3526',texture:'timber'},band:{at:'storeys',offset:-.14,height:.28}},{kind:'quoins',finish:{color:'#4a3526',texture:'timber'},quoins:{width:.3},floors:'upper'},{kind:'band',finish:{color:'#4a3526',texture:'timber'},band:{at:'top',offset:0,height:.25}}],
  decor:[{kind:'lamp',density:.5,sides:'street'}],
  roof:{pool:[['nyc-chimney',1]],density:.5}},
 {id:'civic-classical',label:'Civic classical',tags:['classic'],legacy:'civic',blurb:'Stone arcade on the street, pilasters between tall arched windows, round attic lights and a heavy cornice.',
  starter:{width:18,depth:14,floors:4},
  rhythm:{style:'civic',variety:.2,bay:3.1,trims:'simple'},
  look:{family:'pale-limestone',palettes:[P(plaster('#ddd3bf'),'#eee6d4','#565c59','#5d6665'),P(plaster('#cfc4ad'),'#e6dcc6','#3a3f3c','#4a3a2a'),P(plaster('#e6dfd0'),'#f3eee2','#4a4f4c','#2f3a4a')],roof:'flat',roofSettings:{boundary:'parapet'}},
  paint:[{kind:'floors',finish:{color:'#cfc3aa',texture:'plaster'},floors:'ground'}],
  decor:[{kind:'pier',modules:[['collection-civic-pilaster',1]],density:1,corners:'any',floors:'upper'},{kind:'cornice',modules:[['collection-civic-cornice',1]],density:1},{kind:'belt',modules:[['string-course',1]],density:1,floors:[1]},{kind:'lamp',density:.6,sides:'street'}],
  roof:{pool:[['collection-lantern',1]],density:.3}},
];
export const THEME_MAP=new Map(FACADE_THEMES.map(t=>[t.id,t]));
/** The theme an old rhythm style maps onto (the style chooser's "full theme"). */
export const themeForStyle=(style:RhythmStyle)=>FACADE_THEMES.find(t=>t.legacy===style);
export const THEME_THUMBNAIL=(id:string)=>`/city/themes/${id}.jpg`;
/** Default decoration modules per kind. */
export const THEME_DECOR_DEFAULTS:Record<ThemeDecorKind,[string,number][]>={
 'fire-escape':[['nyc-balcony',1]],balcony:[['nyc-balcony',1]],sign:[['wall-tokyo-sign',1]],lantern:[['wall-tokyo-lantern',1]],pipes:[['wall-tokyo-pipes',1]],ac:[['wall-tokyo-ac',1]],
 awning:[['canopy-awning',1]],'shop-lights':[['shop-lanterns-pair',1]],lamp:[['wall-lamp',1]],cornice:[['cornice',1]],belt:[['string-course',1]],pier:[['nyc-pier',1]],street:[['street-planters-pair',1]],ornament:[['floral-relief',1]],
};
export const THEME_ASPECT_LABELS:Record<ThemeAspect,string>={shops:'Storefronts','fire-escape':'Fire escapes',balcony:'Balconies',sign:'Vertical signs',lantern:'Lanterns',pipes:'Pipes and meters',ac:'AC units',awning:'Awnings','shop-lights':'Shop lights',lamp:'Wall lamps',cornice:'Cornice',belt:'Belt courses',pier:'Piers',street:'Street objects',ornament:'Ornaments',roof:'Rooftop props'};
/** Aspects a theme actually uses (for the panel). */
export function themeAspects(t:FacadeTheme):ThemeAspect[]{
 const kinds=new Set(t.decor.map(x=>x.kind));
 return THEME_ASPECTS.filter(a=>a==='shops'?!!t.shops&&t.shops.pool.length>0:a==='roof'?!!t.roof:kinds.has(a as ThemeDecorKind));
}
/** The theme's own density for an aspect (the largest of its entries). */
export function themeAspectDefault(t:FacadeTheme,a:ThemeAspect):number{
 if(a==='shops')return t.shops?.density??0;if(a==='roof')return t.roof?.density??0;
 return Math.max(0,...t.decor.filter(x=>x.kind===a).map(x=>x.density));
}

// ---- recipe reference -------------------------------------------------------------------------
export type StudioThemeRef={id:string;theme:string;partId?:string;seed:number;palette?:number;
 /** Absolute densities per aspect (0..1), replacing the theme's own. */
 tune?:Partial<Record<ThemeAspect,number>>;locks?:ThemeAspect[];seeds?:Partial<Record<ThemeAspect,number>>;
 /** Detached: storefronts, paint and roof props were turned into ordinary items; only the decorations still resolve. */
 detached?:boolean};
export const THEME_LIMITS={refs:33,seed:999999,palettes:8} as const;
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const intIn=(v:unknown,lo:number,hi:number)=>typeof v==='number'&&Number.isInteger(v)&&v>=lo&&v<=hi;
const idOk=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=100&&!['__proto__','constructor','prototype'].includes(v);
/** Local construction studio only: business and profile validators reject `studio.facadeThemes` (their key whitelists). */
export function validateFacadeThemes(v:unknown):string|null{
 if(v===undefined)return null;
 const bad='A facade theme is invalid.';
 if(!Array.isArray(v)||v.length>THEME_LIMITS.refs)return 'Too many facade themes.';
 const ids=new Set<string>(),scopes=new Set<string>();
 for(const ref of v){
  if(!obj(ref)||Object.keys(ref).some(k=>!['id','theme','partId','seed','palette','tune','locks','seeds','detached'].includes(k)))return bad;
  if(!idOk(ref.id)||ids.has(ref.id as string)||!THEME_MAP.has(ref.theme as string)||ref.partId!==undefined&&!idOk(ref.partId)||!intIn(ref.seed,0,THEME_LIMITS.seed))return bad;
  if(ref.palette!==undefined&&!intIn(ref.palette,0,THEME_LIMITS.palettes-1)||ref.detached!==undefined&&typeof ref.detached!=='boolean')return bad;
  const aspect=(k:string)=>(THEME_ASPECTS as readonly string[]).includes(k);
  if(ref.tune!==undefined&&(!obj(ref.tune)||Object.entries(ref.tune).some(([k,n])=>!aspect(k)||typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)))return bad;
  if(ref.seeds!==undefined&&(!obj(ref.seeds)||Object.entries(ref.seeds).some(([k,n])=>!aspect(k)||!intIn(n,0,THEME_LIMITS.seed))))return bad;
  if(ref.locks!==undefined&&(!Array.isArray(ref.locks)||ref.locks.some(k=>typeof k!=='string'||!aspect(k))||new Set(ref.locks).size!==ref.locks.length))return bad;
  const scope=ref.partId as string??'*';if(scopes.has(scope))return 'Each part takes one facade theme.';
  ids.add(ref.id as string);scopes.add(scope);
 }
 return null;
}
