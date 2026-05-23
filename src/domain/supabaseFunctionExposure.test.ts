import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const intentionallyPublicOrInternalFunctions = new Set([
  'apply-world-prompt-preview',
  'approve-world-prompt-op',
  'cancel-world-prompt-turn',
  'cleanup-active-generation',
  'continue-world-seed-generation',
  'extract-source-url',
  'fal-webhook',
  'join-waitlist',
  'muapi-webhook',
  'process-world-generation-jobs',
  'reject-world-prompt-op',
  'start-world-prompt-turn',
  'start-world-seed-inference',
  'stripe-webhook',
])

function functionSourcePath(functionName: string) {
  const directPath = path.join('supabase', 'functions', functionName, 'index.ts')
  if (existsSync(directPath)) return directPath
  return path.join('supabase', 'functions', ...functionName.split('-'), 'index.ts')
}

test('public Supabase functions are either explicitly allowed or require user auth in code', () => {
  const config = readFileSync('supabase/config.toml', 'utf8')
  const functionBlocks = [...config.matchAll(/\[functions\.([^\]]+)\]\s*\r?\n([\s\S]*?)(?=\r?\n\[|$)/g)]
  const unauditedFunctions: string[] = []

  for (const [, functionName, body] of functionBlocks) {
    if (!/verify_jwt\s*=\s*false/.test(body)) continue

    const sourcePath = functionSourcePath(functionName)
    const source = existsSync(sourcePath) ? readFileSync(sourcePath, 'utf8') : ''
    const requiresUser = source.includes('requireUserClient')

    if (!requiresUser && !intentionallyPublicOrInternalFunctions.has(functionName)) {
      unauditedFunctions.push(functionName)
    }
  }

  assert.deepEqual(unauditedFunctions, [])
})
