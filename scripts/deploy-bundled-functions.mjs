// Deploys edge functions that exceed Supabase's 5 MB source limit by pre-bundling them with esbuild.
//
// Usage: node scripts/deploy-bundled-functions.mjs <function> [<function>...]
//
// Package imports (npm:, jsr:, node:, https://, @supabase/*, zod) stay external so the Edge runtime
// resolves them through the function's deno.json; project source is bundled into one minified index.ts
// with function names kept (error messages and handler registries rely on them). The bundle is deployed
// from a temporary workdir so the repository is never modified. verify_jwt follows supabase/config.toml.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectRef = process.env.SUPABASE_PROJECT_REF || 'znwdatidqdkzidempvkt'
const names = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
if (!names.length) {
  console.error('usage: node scripts/deploy-bundled-functions.mjs <function> [<function>...]')
  process.exit(1)
}
const toml = fs.readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8')
const noJwt = new Set([...toml.matchAll(/\[functions\.([^\]]+)\]\s*\nverify_jwt = false/g)].map((m) => m[1]))
const esbuild = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild')

for (const name of names) {
  const source = path.join(root, 'supabase', 'functions', name, 'index.ts')
  if (!fs.existsSync(source)) throw new Error(`Unknown function: ${name}`)
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `fn-bundle-${name}-`))
  const fnDir = path.join(work, 'supabase', 'functions', name)
  fs.mkdirSync(fnDir, { recursive: true })
  fs.copyFileSync(path.join(root, 'supabase', 'config.toml'), path.join(work, 'supabase', 'config.toml'))
  const out = path.join(fnDir, 'index.ts')
  execFileSync(esbuild, [
    source,
    '--bundle', '--format=esm', '--platform=neutral', '--target=esnext',
    '--minify-whitespace', '--minify-syntax', '--keep-names', '--legal-comments=none',
    '--external:npm:*', '--external:jsr:*', '--external:node:*', '--external:https://*', '--external:@supabase/*', '--external:zod', '--external:zod/*',
    `--outfile=${out}`,
  ], { stdio: 'inherit', shell: true })
  // Functions without their own deno.json inherit the shared import map so bare specifiers (zod, functions-js) resolve.
  const denoConfig = path.join(root, 'supabase', 'functions', name, 'deno.json')
  const fallbackConfig = path.join(root, 'supabase', 'functions', 'director-command', 'deno.json')
  fs.copyFileSync(fs.existsSync(denoConfig) ? denoConfig : fallbackConfig, path.join(fnDir, 'deno.json'))
  console.log(`${name}: bundle ${(fs.statSync(out).size / 1e6).toFixed(2)} MB${noJwt.has(name) ? ' (no-verify-jwt)' : ''}`)
  try {
    execFileSync('npx', ['supabase', 'functions', 'deploy', name, '--project-ref', projectRef, '--workdir', work, ...(noJwt.has(name) ? ['--no-verify-jwt'] : [])], { stdio: 'inherit', shell: true, cwd: work })
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}
