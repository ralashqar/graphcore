/** Export the SAME worker-resolved placements used in the game for Blender assembly. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {NYC_PRESETS,nycPreset} from '../src/domain/cityNycPresets.ts';
import {initialLandDraft} from '../src/domain/cityLand.ts';
import {resolveSculpt} from '../src/domain/citySculpt.ts';
import type {LandPlot} from '../src/domain/cityLand.ts';
const output=new URL('../public/city/synarc-kit/v4/',import.meta.url);mkdirSync(output,{recursive:true});
const plot={id:'nyc-export',size:24,rotation:0,vegetationSeed:1} as LandPlot;
const presets=NYC_PRESETS.map((p,i)=>{const draft=nycPreset(initialLandDraft(plot),i,24),resolved=resolveSculpt(draft.sculpt!,draft.design);if(resolved.studio!.inactive.length)throw Error(JSON.stringify({preset:p.id,inactive:resolved.studio!.inactive}));return {...p,recipe:draft,studio:resolved.studio};});
writeFileSync(new URL('presets.json',output),JSON.stringify(presets));console.log(`Exported ${presets.length} resolved NYC buildings.`);
