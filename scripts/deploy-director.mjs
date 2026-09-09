import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
const fly=process.platform==='win32'?join(homedir(),'.fly','bin','fly.exe'):'fly'
const result=spawnSync(fly,['deploy','--config','fly.director.toml','--remote-only','--ha=false'],{stdio:'inherit'})
if(result.error)console.error(result.error.message)
process.exit(result.status??1)
