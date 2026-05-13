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

test('wiki entity page styles include page, relationship, and backlink surfaces', () => {
  const shellCss = readFileSync(resolve(repoRoot, 'src/styles/features/world-builder/wiki-feed/wiki-shell.css'), 'utf8')

  assert.match(shellCss, /\.world-wiki-entity-page\s*\{/)
  assert.match(shellCss, /\.world-wiki-entity-page-body\s*\{/)
  assert.match(shellCss, /grid-template-columns: minmax\(0, 1fr\) minmax\(420px, 48%\)/)
  assert.match(shellCss, /\.world-wiki-entity-main-column,\s*\n\.world-wiki-entity-side-column/)
  assert.match(shellCss, /\.world-wiki-entity-hero-art\s*\{/)
  assert.match(shellCss, /object-fit: cover/)
  assert.match(shellCss, /min-width: 100%/)
  assert.match(shellCss, /min-height: 100%/)
  assert.match(shellCss, /\.world-wiki-entity-art-expand\s*\{[\s\S]*width: 38px/)
  assert.match(shellCss, /\.world-wiki-entity-relationship-row/)
  assert.match(shellCss, /\.world-wiki-entity-backlink/)
  assert.match(shellCss, /@media \(max-width: 1040px\)/)
})

test('wiki image splash modal renders above the workspace chrome', () => {
  const modalCss = readFileSync(resolve(repoRoot, 'src/styles/features/world-builder/wiki-feed/wiki-modals-prompt.css'), 'utf8')

  assert.match(modalCss, /\.world-wiki-modal-backdrop\s*\{[\s\S]*position: fixed/)
  assert.match(modalCss, /\.world-wiki-modal-backdrop\s*\{[\s\S]*z-index: 180/)
})
