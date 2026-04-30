import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildUrlSourceContextFromExtractionResponse,
  buildPromptSourceContext,
  isSupportedOnboardingSourceFile,
  normalizeOnboardingSourceText,
  ONBOARDING_SOURCE_TEXT_LIMIT,
} from './onboardingSource.ts'

test('normalizes and truncates onboarding source text', () => {
  const source = `  hello\r\n\r\n\r\nworld  ${'x'.repeat(ONBOARDING_SOURCE_TEXT_LIMIT)}`
  const normalized = normalizeOnboardingSourceText(source, 20)

  assert.equal(normalized.text.length <= 20, true)
  assert.equal(normalized.truncated, true)
  assert.equal(normalized.charCount > normalized.text.length, true)
})

test('validates supported onboarding source files', () => {
  assert.equal(isSupportedOnboardingSourceFile('outline.pdf'), true)
  assert.equal(isSupportedOnboardingSourceFile('story.docx'), true)
  assert.equal(isSupportedOnboardingSourceFile('notes.md'), true)
  assert.equal(isSupportedOnboardingSourceFile('image.png'), false)
})

test('builds prompt source context for plain prompt and examples', () => {
  const context = buildPromptSourceContext('A moon remembers every empire.', 'example')

  assert.equal(context.kind, 'example')
  assert.equal(context.extractedText, 'A moon remembers every empire.')
  assert.equal(context.charCount, 30)
  assert.equal(context.truncated, false)
})

test('validates URL extraction responses before building source context', () => {
  const context = buildUrlSourceContextFromExtractionResponse(
    {
      ok: true,
      title: 'Archive',
      url: 'https://example.com/archive',
      mimeType: 'text/html',
      extractedText: 'A city keeps its dead kings as advisors.',
      charCount: 40,
      truncated: false,
    },
    'https://example.com',
  )

  assert.equal(context.kind, 'url')
  assert.equal(context.title, 'Archive')
  assert.equal(context.url, 'https://example.com/archive')
  assert.equal(context.extractedText, 'A city keeps its dead kings as advisors.')
  assert.equal(context.charCount, 40)
  assert.throws(
    () => buildUrlSourceContextFromExtractionResponse({ ok: true, extractedText: '' }, 'https://example.com'),
    /No readable text/,
  )
  assert.throws(
    () => buildUrlSourceContextFromExtractionResponse({ ok: false }, 'https://example.com'),
    /Could not read/,
  )
})
