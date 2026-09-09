import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const directory=mkdtempSync(join(tmpdir(),'graphcore-mb-sql-'))
try {
 const files=[...(process.argv.includes('--existing')?[]:['supabase/migrations/20260909194613_game_motionbricks_provider.sql']), 'supabase/migrations/20260909203800_game_motionbricks_retarget_revision.sql','supabase/tests/game_animation.sql','supabase/tests/game_motionbricks.sql']
 const file=join(directory,'verify.sql')
 writeFileSync(file,['begin;',"set local graphcore.animation_test_transaction='on';",...files.map(p=>readFileSync(p,'utf8')),'rollback;'].join('\n'))
 const result=spawnSync(process.platform==='win32'?'npx.cmd':'npx',['supabase','db','query','--linked','--file',file],{stdio:'inherit',shell:process.platform==='win32'})
 if(result.error)throw result.error
 process.exitCode=result.status??1
} finally {rmSync(directory,{recursive:true,force:true})}
