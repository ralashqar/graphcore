import {writeFileSync} from 'node:fs';
import {COLLECTION_PRESETS,collectionPreset} from '../src/domain/cityCollectionPresets.ts';
import {initialLandDraft,type LandPlot} from '../src/domain/cityLand.ts';
import {resolveSculpt,validateSculpt} from '../src/domain/citySculpt.ts';
const plot={id:'collection-export',size:24,rotation:0,vegetationSeed:1} as LandPlot;
const presets=COLLECTION_PRESETS.map((p,i)=>{const draft=collectionPreset(initialLandDraft(plot),i,24);const error=validateSculpt(draft.sculpt!,draft.design.floors);if(error)throw Error(p.id+': '+error);const resolved=resolveSculpt(draft.sculpt!,draft.design);if(resolved.studio!.inactive.length)throw Error(JSON.stringify({preset:p.id,inactive:resolved.studio!.inactive}));return {...p,recipe:draft,studio:resolved.studio,foundation:resolved.vertices.trim};});
writeFileSync(new URL('../public/city/synarc-kit/v5/presets.json',import.meta.url),JSON.stringify(presets));console.log(`Exported ${presets.length} Blender collection recipes.`);
