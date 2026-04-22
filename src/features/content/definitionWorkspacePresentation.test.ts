import test from 'node:test'
import assert from 'node:assert/strict'

import type { DefinitionBase } from '../../domain/graphcore.ts'
import { buildDefinitionCollectionItemViewModel, buildDefinitionDossierViewModel, labelForDefinitionKind } from './definitionWorkspacePresentation.ts'

const baseDefinition: DefinitionBase = {
  id: 'def-1',
  key: 'character.hero',
  name: 'Hero',
  kind: 'character',
  summary: 'Lead point-of-view character.',
  status: 'draft',
  archetypeKey: 'archetype.hero',
  iconAssetKey: null,
  tags: ['lead', 'player'],
  schemaVersion: 1,
  metadata: {},
  llmHints: {},
  assetRefs: [],
  definitionData: {},
  fieldValues: [],
  customFields: [],
  components: [],
}

test('builds collection item state from a definition', () => {
  const viewModel = buildDefinitionCollectionItemViewModel({
    archetypes: [],
    assets: [],
    definition: baseDefinition,
    isActive: true,
  })

  assert.equal(viewModel.title, 'Hero')
  assert.equal(viewModel.subtitle, 'Character')
  assert.equal(viewModel.meta, 'archetype.hero')
  assert.equal(viewModel.statusTone, 'neutral')
})

test('builds dossier state for a definition', () => {
  const viewModel = buildDefinitionDossierViewModel({
    archetypes: [],
    assets: [],
    definition: baseDefinition,
    linkedCinematicCount: 2,
    fieldCount: 4,
  })

  assert.equal(viewModel.title, 'Hero')
  assert.match(viewModel.subtitle, /Character/)
  assert.deepEqual(viewModel.stats, [
    { label: 'Fields', value: '4' },
    { label: 'Components', value: '0' },
    { label: 'Links', value: '2' },
  ])
})

test('returns readable labels for supported kinds', () => {
  assert.equal(labelForDefinitionKind('world_model'), 'World Model')
})
