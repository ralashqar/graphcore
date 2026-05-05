import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildEbookDocumentMetadata,
  buildEbookHtmlDocument,
  parseEbookMarkdown,
} from './ebookDocument.ts'

const sampleMarkdown = [
  '# The Human Override',
  '',
  '> A maintenance worker becomes the spark of a revolt.',
  '',
  '## Chapter 1: The Selection',
  '',
  'Ilya kept his hands visible as the checkpoint line moved.',
  '',
  'He watched the scanner pause on Anya and knew the day had turned.',
  '',
  '* * *',
  '',
  '### Lower City',
  '',
  'Nara found him below the transit pylons.',
  '',
  '## Chapter 2: The Key',
  '',
  'The stolen badge opened one door and condemned him at the next.',
  '',
  'Late chapter text that must survive rendering input preparation.',
].join('\n')

test('parseEbookMarkdown maps title, chapters, scene breaks, sections, and paragraphs', () => {
  const document = parseEbookMarkdown(sampleMarkdown)

  assert.equal(document.title, 'The Human Override')
  assert.equal(document.subtitle, 'A maintenance worker becomes the spark of a revolt.')
  assert.equal(document.metadata.chapterCount, 2)
  assert.equal(document.blocks.some((block) => block.type === 'scene_break'), true)
  assert.equal(document.blocks.some((block) => block.type === 'section' && block.title === 'Lower City'), true)
  assert.equal(document.blocks.some((block) => block.type === 'paragraph' && block.text.includes('Late chapter text')), true)
})

test('buildEbookHtmlDocument preserves late manuscript content without truncation', () => {
  const longTail = Array.from({ length: 320 }, (_, index) => `Paragraph ${index + 1} with complete manuscript text.`).join('\n\n')
  const markdown = `${sampleMarkdown}\n\n${longTail}\n\nFinal line after the old truncated range.`
  const { html, document } = buildEbookHtmlDocument(markdown)

  assert.match(html, /<section class="title-page">/)
  assert.match(html, /<section class="chapter"><h1>Chapter 1: The Selection<\/h1><\/section>/)
  assert.match(html, /<div class="scene-break" aria-label="Scene break">\* \* \*<\/div>/)
  assert.match(html, /Final line after the old truncated range\./)
  assert.equal(document.metadata.manuscriptCharacterCount, markdown.length)
})

test('buildEbookDocumentMetadata records renderer and manuscript size', () => {
  const metadata = buildEbookDocumentMetadata(sampleMarkdown, { title: 'Override' })

  assert.equal(metadata.renderer, 'chromium-html-css')
  assert.equal(metadata.documentMode, 'ebook')
  assert.equal(metadata.pageSize, '6in x 9in')
  assert.equal(metadata.manuscriptCharacterCount, sampleMarkdown.length)
  assert.equal(metadata.chapterCount, 2)
})

test('reference document mode uses handbook metadata and layout hints', () => {
  const metadata = buildEbookDocumentMetadata(sampleMarkdown, { title: 'Override Bible', documentMode: 'reference' })
  const { html } = buildEbookHtmlDocument(sampleMarkdown, { title: 'Override Bible', documentMode: 'reference' })

  assert.equal(metadata.documentMode, 'reference')
  assert.equal(metadata.pageSize, '8.5in x 11in')
  assert.match(html, /size: 8\.5in 11in/)
  assert.match(html, /text-align: left/)
  assert.doesNotMatch(html, /page-break-before: always;\n      padding-top: 0\.7in/)
})
