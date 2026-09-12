import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
const dir=mkdtempSync(join(tmpdir(),'graphcore-motion-sets-'))
try{
 const files=[...(process.argv.includes('--existing')?[]:['supabase/migrations/20260909214012_game_motion_sets.sql']),'supabase/tests/game_motion_sets.sql']
 const file=join(dir,'verify.sql');writeFileSync(file,['begin;',"set local graphcore.animation_test_transaction='on';",...files.map(p=>readFileSync(p,'utf8')),'rollback;'].join('\n'))
 const r=spawnSync(process.platform==='win32'?'npx.cmd':'npx',['supabase','db','query','--linked','--file',file],{stdio:'inherit',shell:process.platform==='win32'});if(r.error)throw r.error;process.exitCode=r.status??1
}finally{if(!resolve(dir).startsWith(resolve(tmpdir())))throw Error('Invalid temporary path');rmSync(dir,{recursive:true,force:true})}
