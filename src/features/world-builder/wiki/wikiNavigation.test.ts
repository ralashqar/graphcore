import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../../../..')

test('wiki scroll spy follows rendered section markers instead of model order', () => {
  const worldGraphSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')

  assert.match(worldGraphSource, /root\.querySelectorAll<HTMLElement>\('\[data-world-wiki-section-kind\]'\)/)
  assert.match(worldGraphSource, /element\.dataset\.worldWikiSectionKind/)
  assert.match(worldGraphSource, /visibleSections\[visibleSections\.length - 1\]\.kind/)
  assert.doesNotMatch(worldGraphSource, /const sectionKinds = wikiModel\.sections\.map/)
  assert.doesNotMatch(worldGraphSource, /document\.getElementById\(`world-wiki-section-\$\{kind\}`\)/)
})

test('wiki sections expose stable section markers including suggested actions', () => {
  const wikiPanelSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/wiki/WorldWikiPanel.tsx'), 'utf8')
  const wikiSectionsSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/wiki/WorldWikiSections.tsx'), 'utf8')

  assert.match(wikiPanelSource, /data-world-wiki-section-kind="overview"/)
  assert.match(wikiPanelSource, /id="world-wiki-section-gaps"/)
  assert.match(wikiPanelSource, /data-world-wiki-section-kind="gaps"/)
  assert.match(wikiSectionsSource, /data-world-wiki-section-kind=\{section\.kind\}/)
})

test('suggested actions has a canonical gaps navigation item', () => {
  const wikiPanelSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/wiki/WorldWikiPanel.tsx'), 'utf8')
  const labelsSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/wiki/wikiSectionLabels.ts'), 'utf8')
  const worldGraphSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')

  assert.match(wikiPanelSource, /visibleWikiGaps\.length > 0/)
  assert.match(wikiPanelSource, /activeWikiSectionKind === 'gaps'/)
  assert.match(wikiPanelSource, /onScrollToWikiSection\('gaps'\)/)
  assert.match(wikiPanelSource, /<strong>Suggested actions<\/strong>/)
  assert.match(labelsSource, /case 'gaps':\s*return 'activity'/)
  assert.match(labelsSource, /case 'gaps':\s*return 'Suggested Actions'/)
  assert.match(worldGraphSource, /sectionKind === 'gaps' \? 'world-wiki-section-gaps'/)
})

test('wiki overview banner has fixed-height logline behavior with full-text modal', () => {
  const wikiPanelSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/wiki/WorldWikiPanel.tsx'), 'utf8')
  const worldGraphSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  const conceptOverrideCss = readFileSync(resolve(repoRoot, 'src/styles/features/world-builder/wiki-feed/wiki-sections/concept-image-override.css'), 'utf8')
  const modalCss = readFileSync(resolve(repoRoot, 'src/styles/features/world-builder/wiki-feed/wiki-modals-prompt.css'), 'utf8')

  assert.match(wikiPanelSource, /className="world-wiki-logline-text"/)
  assert.match(wikiPanelSource, /wikiOverviewFullLogline: string/)
  assert.match(wikiPanelSource, /const overviewLoglineModalText = wikiOverviewFullLogline\.trim\(\) \|\| wikiOverviewDisplayLogline/)
  assert.match(wikiPanelSource, /onOpenWikiDetailModal\(\{/)
  assert.match(wikiPanelSource, /eyebrow: 'Logline'/)
  assert.match(wikiPanelSource, /body: overviewLoglineModalText/)
  assert.match(worldGraphSource, /onOpenWikiDetailModal=\{openWikiDetailModal\}/)
  assert.match(worldGraphSource, /wikiOverviewFullLogline=\{liveWikiGenerationState\.active/)
  assert.match(conceptOverrideCss, /\.world-wiki-overview\s*\{[\s\S]*height: clamp\(252px, 21vw, 310px\) !important/)
  assert.match(conceptOverrideCss, /\.world-wiki-overview-bottom-row\s*\{[\s\S]*position: absolute !important/)
  assert.match(conceptOverrideCss, /\.world-wiki-logline-text/)
  assert.match(conceptOverrideCss, /-webkit-line-clamp: 2/)
  assert.match(modalCss, /\.world-wiki-modal-body\s*\{[\s\S]*max-height: none/)
  assert.match(modalCss, /\.world-wiki-modal-body\s*\{[\s\S]*-webkit-line-clamp: unset/)
})
