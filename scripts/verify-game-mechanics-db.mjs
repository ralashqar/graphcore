import { mkdtempSync,readFileSync,writeFileSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const dir=mkdtempSync(join(tmpdir(),'graphcore-mechanics-db-'))
try{
 const file=join(dir,'verify.sql')
 writeFileSync(file,['begin;',...(process.argv.includes('--existing')?[]:[readFileSync('supabase/migrations/20260909140823_game_mechanic_composition.sql','utf8')]),readFileSync('supabase/tests/game_mechanics.sql','utf8'),'rollback;'].join('\n'))
 const result=spawnSync(process.platform==='win32'?'npx.cmd':'npx',['supabase','db','query','--linked','--file',file],{stdio:'inherit',shell:process.platform==='win32'})
 if(result.error)throw result.error
 process.exitCode=result.status??1
}finally{rmSync(dir,{recursive:true,force:true})}
