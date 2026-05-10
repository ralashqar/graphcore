import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const projectRoot = process.cwd()

function readSource(relativePath: string) {
  return readFileSync(join(projectRoot, relativePath), 'utf8')
}

test('world builder and app runtime do not import the Supabase client directly', () => {
  for (const relativePath of ['src/App.tsx', 'src/features/world-builder/WorldGraphPage.tsx']) {
    const source = readSource(relativePath)
    assert.doesNotMatch(source, /from ['"].*utils\/supabase['"]/, `${relativePath} should use application ports instead of the Supabase client`)
    assert.doesNotMatch(source, /supabase\.(functions|from|channel|removeChannel)/, `${relativePath} should not issue Supabase I/O directly`)
  }
})

test('GraphCore application ports are backed by focused infrastructure adapters', () => {
  const portsIndex = readSource('src/application/ports/index.ts')
  const adapterSource = readSource('src/infrastructure/graphcore/graphcoreApis.ts')

  for (const portName of ['AssetApi', 'RealtimeApi', 'WorkspaceSnapshotApi', 'WorldGraphApi']) {
    assert.match(portsIndex, new RegExp(`\\b${portName}\\b`), `${portName} should be exported from the application port index`)
  }

  for (const adapterName of ['graphcoreAssetApi', 'graphcoreRealtimeApi', 'graphcoreWorkspaceSnapshotApi', 'graphcoreWorldGraphApi']) {
    assert.match(adapterSource, new RegExp(`\\b${adapterName}\\b`), `${adapterName} should be available as a focused infrastructure adapter`)
  }
})
