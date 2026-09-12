// Reuses saved source motions. This script has no provider or credential access.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import assert from 'node:assert/strict'
import {fabricMannequin} from '../src/domain/game/v3/mannequin.ts'
import {motionRecipeSchema} from '../src/domain/game/v3/animation.ts'
import {decodeProviderMotion} from '../src/domain/game/v3/animationProviders.ts'
const rig=await fabricMannequin(),manifest=JSON.parse(readFileSync('output/game-animation-soma/import.json'))
for(const clip of manifest.clips){
 const directory=`output/game-fabric-kimodo/${clip.recipe.state}`;mkdirSync(directory,{recursive:true})
 const recipe=motionRecipeSchema.parse({...clip.recipe,id:`fabric.${clip.recipe.state}.v1`,rigRevision:rig.revision,retargetRevision:'soma-fabric-1.0.0'})
 const source=JSON.parse(readFileSync(`${clip.folder}/source.json`));decodeProviderMotion(recipe,source)
 writeFileSync(`${directory}/recipe.json`,JSON.stringify(recipe));writeFileSync(`${directory}/rig.json`,JSON.stringify(rig));copyFileSync(`${clip.folder}/source.json`,`${directory}/source.json`)
 for(const stage of ['retarget','process','export','validate']){
  const r=spawnSync(process.env.GAME_BLENDER_BINARY??'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe',['-b','--factory-startup','--disable-autoexec','--python-exit-code','1','--python','workers/game/animation/bake.py','--',directory,stage],{encoding:'utf8',timeout:180000})
  writeFileSync(`${directory}/${stage}.log`,r.stdout+r.stderr);assert.equal(r.status,0,`${clip.recipe.state}/${stage}: ${r.stdout+r.stderr}`)
 }
 const validation=JSON.parse(readFileSync(`${directory}/validate.json`));console.log(JSON.stringify({state:recipe.state,...validation}));assert.equal(validation.accepted,true)
}
