import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

export function serverKey(name = 'RUNPOD_GRAPHCORE') {
  if (!/^[A-Z][A-Z0-9_]+$/.test(name)) throw new Error('Invalid environment variable name')
  if (process.env[name]) return process.env[name]
  for (const path of ['.env.local', '.env']) {
    if (!existsSync(path)) continue
    execFileSync('git', ['check-ignore', '--quiet', path])
    const match = readFileSync(path, 'utf8').match(new RegExp(`^${name}\\s*=\\s*(.+)$`, 'm'))
    if (match) return match[1].trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  throw new Error(`${name} is not configured in the environment or an ignored env file`)
}

export const deploymentKey = () => serverKey('FAL_ADMIN_KEY')

if (process.argv[1]?.endsWith('game-animation-auth.mjs')) {
  const response = await fetch('https://api.runpod.io/v2/serverless', {
    headers: { Authorization: `Bearer ${serverKey()}` },
    signal: AbortSignal.timeout(30000),
  })
  // Never print provider bodies: key-management responses can contain credentials.
  console.log(JSON.stringify({ runpodAuthenticationStatus: response.status }))
  if (!response.ok) process.exitCode = 1
}
