import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../../../..')

test('output prompt UI infers deliverable type instead of rendering preset buttons', () => {
  const source = readFileSync(resolve(repoRoot, 'src/features/world-builder/wiki/WorldOutputLibraryPanel.tsx'), 'utf8')
  const css = readFileSync(resolve(repoRoot, 'src/styles/features/world-builder/wiki-feed/output-library.css'), 'utf8')

  assert.match(source, /CompactPromptComposer/)
  assert.match(source, /Type inferred from prompt/)
  assert.doesNotMatch(source, /world-output-preset-row/)
  assert.doesNotMatch(source, /selectedPreset/)
  assert.doesNotMatch(source, /targetFormat: selectedPresetConfig\.targetFormat/)
  assert.doesNotMatch(source, /pageCount: selectedPresetConfig\.pageCount/)
  assert.doesNotMatch(css, /world-output-preset-row/)
  assert.match(css, /\.world-output-create-form \.compact-prompt-composer textarea\s*\{[\s\S]*min-height: 104px[\s\S]*max-height: 220px[\s\S]*resize: vertical/)
  assert.match(css, /\.world-output-create-form\.is-rail \.compact-prompt-composer textarea\s*\{[\s\S]*min-height: 126px/)
})
