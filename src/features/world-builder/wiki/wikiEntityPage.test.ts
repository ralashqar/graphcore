import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../../../..')

test('wiki entity cards navigate to in-wiki entity pages', () => {
  const sectionsSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/wiki/WorldWikiSections.tsx'), 'utf8')
  const entityCardSource = sectionsSource.slice(
    sectionsSource.indexOf('function renderEntityCard'),
    sectionsSource.indexOf('function renderTimelineCard'),
  )
  const timelineCardSource = sectionsSource.slice(
    sectionsSource.indexOf('function renderTimelineCard'),
    sectionsSource.indexOf("if (section.kind === 'style')"),
  )

  assert.match(entityCardSource, /onOpenWikiEntityPage\(section\.kind, entity\.key\)/)
  assert.match(timelineCardSource, /onOpenWikiEntityPage\(section\.kind, entity\.key\)/)
  assert.doesNotMatch(entityCardSource, /onOpenWikiDetailModal\(/)
  assert.doesNotMatch(timelineCardSource, /onOpenWikiDetailModal\(/)
  assert.doesNotMatch(entityCardSource, /referenceSheetUrlByEntityKey/)
})

test('wiki panel renders entity-page navigation with sibling rows', () => {
  const panelSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/wiki/WorldWikiPanel.tsx'), 'utf8')

  assert.match(panelSource, /activeWikiEntityPage/)
  assert.match(panelSource, /world-wiki-entity-nav-crumb/)
  assert.match(panelSource, /Back to world view/)
  assert.doesNotMatch(panelSource, /activeEntity\?\.name \|\| activeEntitySection\.title/)
  assert.match(panelSource, /world-wiki-entity-subnav-row/)
  assert.match(panelSource, /onOpenWikiEntityPage\(activeEntitySection\.kind, entity\.key\)/)
  assert.match(panelSource, /onCloseWikiEntityPage/)
  assert.match(panelSource, /renderWikiEntityPage\(\)/)
  assert.doesNotMatch(panelSource, /<small>\{labelForWorldEntity\(entity\.nodeType\)\}<\/small>/)
})

test('world graph entity page resolves relationships, output backlinks, and full art', () => {
  const worldGraphSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')

  assert.match(worldGraphSource, /function openWikiEntityPageByKey\(entityKey: string\)/)
  assert.match(worldGraphSource, /function renderWikiEntityPage\(\)/)
  assert.match(worldGraphSource, /referenceSheetUrlByEntityKey\.get\(entity\.key\) \?\? wikiImageUrlByEntityKey\.get\(entity\.key\)/)
  assert.match(worldGraphSource, /worldRelationships\s*\n\s*\.filter\(\(relationship\) => relationship\.sourceEntityKey === entity\.key \|\| relationship\.targetEntityKey === entity\.key\)/)
  assert.match(worldGraphSource, /openWikiEntityPageByKey\(connectedEntity\.key\)/)
  assert.match(worldGraphSource, /outputLibraryModel\.rows\s*\n\s*\.filter\(\(row\) => row\.entityRefs\.some\(\(ref\) => ref\.key === entity\.key\)\)/)
  assert.match(worldGraphSource, /onOpenOutputStudio\(row\.id, row\.canOpenTimeline \? 'timeline' : 'details'\)/)
  assert.match(worldGraphSource, /<span>Canon Added<\/span>/)
  assert.match(worldGraphSource, /<EntityIcon id="expand" \/>/)
  assert.match(worldGraphSource, /type WikiEntityHeroImageMeasurement = \{/)
  assert.match(worldGraphSource, /setWikiEntityHeroImageMeasurementByUrl/)
  assert.match(worldGraphSource, /orientation: 'landscape' \| 'portrait' \| 'square'/)
  assert.match(worldGraphSource, /`is-\$\{largeImageMeasurement\.orientation\}`/)
  assert.doesNotMatch(
    worldGraphSource.slice(worldGraphSource.indexOf('const fieldCards = ['), worldGraphSource.indexOf('].filter((entry): entry is { label: string; value: string }')),
    /label: 'Summary'/,
  )
  assert.doesNotMatch(
    worldGraphSource.slice(worldGraphSource.indexOf('function renderWikiEntityPage()'), worldGraphSource.indexOf('function renderWikiSection')),
    /world-wiki-entity-meta-row/,
  )
  assert.doesNotMatch(worldGraphSource.slice(worldGraphSource.indexOf('function renderWikiEntityPage()'), worldGraphSource.indexOf('function renderWikiSection')), /className="world-wiki-entity-back"/)
})

test('wiki entity pages synchronize with browser history query state', () => {
  const worldGraphSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')

  assert.match(worldGraphSource, /const WIKI_ENTITY_ROUTE_ENTITY_PARAM = 'wikiEntity'/)
  assert.match(worldGraphSource, /const WIKI_ENTITY_ROUTE_SECTION_PARAM = 'wikiSection'/)
  assert.match(worldGraphSource, /function readWikiEntityPageRoute\(\): ActiveWikiEntityPageState/)
  assert.match(worldGraphSource, /function writeWikiEntityPageRoute\(page: ActiveWikiEntityPageState, mode: 'push' \| 'replace' = 'push'\)/)
  assert.match(worldGraphSource, /window\.history\[mode === 'replace' \? 'replaceState' : 'pushState'\]/)
  assert.match(worldGraphSource, /window\.addEventListener\('popstate', syncWikiEntityRoute\)/)
  assert.match(worldGraphSource, /writeWikiEntityPageRoute\(page, 'push'\)/)
  assert.match(worldGraphSource, /writeWikiEntityPageRoute\(null, 'replace'\)/)
})

test('wiki sequence units render a bespoke chapter page', () => {
  const worldGraphSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  const shellCss = readFileSync(resolve(repoRoot, 'src/styles/features/world-builder/wiki-feed/wiki-shell.css'), 'utf8')

  assert.match(worldGraphSource, /entity\.nodeType === 'sequence_unit'/)
  assert.match(worldGraphSource, /validateWorldSequenceUnitCompleteness\(entity\)/)
  assert.match(worldGraphSource, /world-wiki-sequence-page/)
  assert.match(worldGraphSource, /Authored chapter/)
  assert.match(worldGraphSource, /Chapter brief/)
  assert.match(worldGraphSource, /Dramatic question/)
  assert.match(worldGraphSource, /Cause and effect/)
  assert.match(worldGraphSource, /Character movement/)
  assert.match(worldGraphSource, /Sequence links/)
  assert.match(worldGraphSource, /Story ingredients/)
  assert.match(shellCss, /\.world-wiki-sequence-hero\s*\{/)
  assert.match(shellCss, /\.world-wiki-sequence-layout\s*\{/)
  assert.match(shellCss, /\.world-wiki-sequence-consequence-list article\s*\{/)
  assert.match(shellCss, /\.world-wiki-sequence-arc-list article\s*\{/)
})

test('wiki entity pages can open a direct-neighborhood graph modal with relationship inspection', () => {
  const worldGraphSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  const shellCss = readFileSync(resolve(repoRoot, 'src/styles/features/world-builder/wiki-feed/wiki-shell.css'), 'utf8')
  const feedCss = readFileSync(resolve(repoRoot, 'src/styles/features/world-builder/wiki-feed/feed.css'), 'utf8')

  assert.match(worldGraphSource, /wikiEntityGraphModalEntityKey/)
  assert.match(worldGraphSource, /function openWikiEntityGraphModal\(entityKey: string\)/)
  assert.match(worldGraphSource, /world-wiki-entity-graph-button/)
  assert.match(worldGraphSource, /Direct neighborhood/)
  assert.match(worldGraphSource, /onEdgeClick=\{\(event, edge\) =>/)
  assert.match(worldGraphSource, /setWikiEntityGraphModalSelectedRelationshipKey\(edge\.id\)/)
  assert.match(worldGraphSource, /Selected relationship/)
  assert.match(worldGraphSource, /wikiEntityGraphModalModel\.selectedRelationship/)
  assert.match(shellCss, /\.world-wiki-entity-graph-button\s*\{/)
  assert.match(feedCss, /\.world-feed-graph-preview\.is-entity-neighborhood\s*\{/)
  assert.match(feedCss, /\.world-wiki-relationship-inspector dl\s*\{/)
})

test('wiki entity page styles include page, relationship, and backlink surfaces', () => {
  const shellCss = readFileSync(resolve(repoRoot, 'src/styles/features/world-builder/wiki-feed/wiki-shell.css'), 'utf8')

  assert.match(shellCss, /\.world-wiki-entity-page\s*\{/)
  assert.match(shellCss, /\.world-wiki-entity-page-body\s*\{/)
  assert.match(shellCss, /grid-template-columns: minmax\(0, 1fr\) minmax\(420px, 48%\)/)
  assert.match(shellCss, /\.world-wiki-entity-main-column,\s*\n\.world-wiki-entity-side-column/)
  assert.match(shellCss, /\.world-wiki-entity-page-copy h2\s*\{[\s\S]*font-size: clamp\(1\.7rem, 2\.4vw, 2\.6rem\)/)
  assert.match(shellCss, /\.world-wiki-entity-hero-art\s*\{/)
  assert.match(shellCss, /aspect-ratio: 1 \/ 1/)
  assert.match(shellCss, /\.world-wiki-entity-hero-art > img\.world-wiki-entity-hero-image\s*\{[\s\S]*width: 100%[\s\S]*height: 100%[\s\S]*object-fit: contain[\s\S]*max-width: 100%[\s\S]*max-height: 100%/)
  assert.doesNotMatch(shellCss, /\.world-wiki-entity-hero-art > img\.world-wiki-entity-hero-image\.is-landscape\s*\{/)
  assert.doesNotMatch(shellCss, /\.world-wiki-entity-hero-art > img\.world-wiki-entity-hero-image\.is-portrait\s*\{/)
  assert.match(shellCss, /\.world-wiki-entity-art-expand\s*\{[\s\S]*width: 38px/)
  assert.match(shellCss, /\.world-wiki-reference-regenerate-button\s*\{/)
  assert.match(shellCss, /\.world-wiki-entity-relationship-row/)
  assert.match(shellCss, /\.world-wiki-entity-backlink/)
  assert.match(shellCss, /@media \(max-width: 1040px\)/)
})

test('wiki entity reference-sheet regeneration uses durable visual jobs and modal guidance', () => {
  const worldGraphSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  const modalCss = readFileSync(resolve(repoRoot, 'src/styles/features/world-builder/wiki-feed/wiki-modals-prompt.css'), 'utf8')

  assert.match(worldGraphSource, /EntityReferenceSheetRegenerationState/)
  assert.match(worldGraphSource, /openEntityReferenceSheetRegenerationModal/)
  assert.match(worldGraphSource, /handleConfirmEntityReferenceSheetRegeneration/)
  assert.match(worldGraphSource, /onUploadEntityReferenceGuidanceImage/)
  assert.match(worldGraphSource, /onRefineWorldEntityVisualProfile/)
  assert.match(worldGraphSource, /requestedFrom: 'wiki_entity_reference_sheet_regenerate'/)
  assert.match(worldGraphSource, /referenceImageAssetKey/)
  assert.match(worldGraphSource, /shouldUseGridArtForWorldEntity\(entity\)/)
  assert.match(worldGraphSource, /world-wiki-entity-art-loading/)
  assert.match(modalCss, /\.world-wiki-reference-regeneration-modal\s*\{/)
  assert.match(modalCss, /\.world-wiki-reference-upload\s*\{/)
})

test('wiki image splash modal renders above the workspace chrome', () => {
  const modalCss = readFileSync(resolve(repoRoot, 'src/styles/features/world-builder/wiki-feed/wiki-modals-prompt.css'), 'utf8')

  assert.match(modalCss, /\.world-wiki-modal-backdrop\s*\{[\s\S]*position: fixed/)
  assert.match(modalCss, /\.world-wiki-modal-backdrop\s*\{[\s\S]*z-index: 180/)
})
