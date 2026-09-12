import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
const dir=mkdtempSync(join(tmpdir(),'synarc-studio-verify-'))
try{
 const files=process.argv.includes('--flexible')?[...(process.argv.includes('--existing')?[]:['supabase/migrations/20260912132026_animation_studio_flexible.sql']),'supabase/tests/animation_studio_flexible.sql']:[...(process.argv.includes('--existing')?[]:['supabase/migrations/20260912123937_animation_studio.sql']),'supabase/tests/animation_studio.sql']
 const file=join(dir,'verify.sql')
 writeFileSync(file,['begin;',"set local graphcore.animation_test_transaction='on';",...files.map(p=>readFileSync(p,'utf8')),'rollback;'].join('\n'))
 const r=spawnSync(process.platform==='win32'?'npx.cmd':'npx',['supabase','db','query','--linked','--file',file],{stdio:'inherit',shell:process.platform==='win32'})
 if(r.error)throw r.error;process.exitCode=r.status??1
}finally{if(!resolve(dir).startsWith(resolve(tmpdir())))throw Error('Invalid temporary directory');rmSync(dir,{recursive:true,force:true})}
