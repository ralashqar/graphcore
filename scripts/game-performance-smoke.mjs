import {mkdir,writeFile} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import {createUnified} from '../src/domain/game/v3/recipes.ts'
import {performanceRecipe} from '../src/domain/game/v3/performance.ts'
import {mergeScopedMechanics} from '../src/domain/game/v3/mechanicCommands.ts'
import {compile} from '../src/domain/game/v3/compiler.ts'
const design=createUnified('exploration'),directory='output/game-performance-receiver'
design.nodes.find(n=>n.id==='keeper').position={x:0,y:0,z:-10.8}
design.mechanics=mergeScopedMechanics(undefined,'character.player',[],[],[],performanceRecipe('roll','character.player'))
design.mechanics=mergeScopedMechanics(design.mechanics,'character.player',[],[],[],performanceRecipe('uppercut','character.player',['character.keeper']))
const manifest=await compile(design,{id:crypto.randomUUID(),projectId:crypto.randomUUID(),draftId:crypto.randomUUID(),sourceRevision:1})
await mkdir(directory,{recursive:true});await writeFile(`${directory}/candidate.json`,JSON.stringify({manifest,assetUrls:{}}))
const code=await new Promise(resolve=>{const p=spawn(process.execPath,['scripts/game-browser-acceptance.mjs',directory],{stdio:'inherit'});p.on('error',()=>resolve(1));p.on('exit',resolve)})
if(code!==0)throw Error('Receiver keyboard acceptance failed')
console.log('Keyboard roll, uppercut impact, receiver recovery and checkpoints passed without provider access.')
