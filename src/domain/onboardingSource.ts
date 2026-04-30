import type { WorldPromptSourceContext } from './worldPrompt'

export const ONBOARDING_SOURCE_TEXT_LIMIT = 24000

const SUPPORTED_SOURCE_EXTENSIONS = ['.txt', '.md', '.markdown', '.json', '.pdf', '.docx'] as const

export type OnboardingSourceExtractionResult = {
  context: WorldPromptSourceContext
  warning: string | null
}

type OnboardingUrlExtractionResponse = {
  ok?: unknown
  title?: unknown
  url?: unknown
  extractedText?: unknown
  charCount?: unknown
  truncated?: unknown
  mimeType?: unknown
}

export function normalizeOnboardingSourceText(value: string, limit = ONBOARDING_SOURCE_TEXT_LIMIT) {
  const normalized = value
    .replace(/\u0000/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (normalized.length <= limit) {
    return {
      text: normalized,
      charCount: normalized.length,
      truncated: false,
    }
  }
  return {
    text: normalized.slice(0, limit).trim(),
    charCount: normalized.length,
    truncated: true,
  }
}

export function isSupportedOnboardingSourceFile(fileName: string) {
  const lower = fileName.toLowerCase()
  return SUPPORTED_SOURCE_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

function extensionForFile(file: File) {
  const lower = file.name.toLowerCase()
  return SUPPORTED_SOURCE_EXTENSIONS.find((extension) => lower.endsWith(extension)) ?? ''
}

function stripXmlToText(value: string) {
  return value
    .replace(/<w:tab\/>/g, ' ')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function extractRoughPdfText(raw: string) {
  const literalStrings = Array.from(raw.matchAll(/\(([^()\\]*(?:\\.[^()\\]*)*)\)/g))
    .map((match) => match[1]?.replace(/\\([()\\nrtbf])/g, (_all, token: string) => {
      if (token === 'n' || token === 'r') return '\n'
      if (token === 't') return ' '
      if (token === 'b' || token === 'f') return ''
      return token
    }) ?? '')
  const text = literalStrings.join(' ')
  return text.length > 80 ? text : raw.replace(/[^\x20-\x7E\n]+/g, ' ')
}

async function extractDocxText(file: File) {
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  const decoder = new TextDecoder()
  let offset = 0

  while (offset + 30 < bytes.length) {
    const signature = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)
    if (signature !== 0x04034b50) {
      offset += 1
      continue
    }
    const method = bytes[offset + 8] | (bytes[offset + 9] << 8)
    const compressedSize = bytes[offset + 18] | (bytes[offset + 19] << 8) | (bytes[offset + 20] << 16) | (bytes[offset + 21] << 24)
    const fileNameLength = bytes[offset + 26] | (bytes[offset + 27] << 8)
    const extraLength = bytes[offset + 28] | (bytes[offset + 29] << 8)
    const nameStart = offset + 30
    const nameEnd = nameStart + fileNameLength
    const entryName = decoder.decode(bytes.slice(nameStart, nameEnd))
    const dataStart = nameEnd + extraLength
    const dataEnd = dataStart + compressedSize

    if (entryName === 'word/document.xml') {
      const compressed = bytes.slice(dataStart, dataEnd)
      if (method === 0) return stripXmlToText(decoder.decode(compressed))
      if (method !== 8 || typeof DecompressionStream === 'undefined') {
        throw new Error('DOCX extraction is not supported in this browser.')
      }
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      const decompressed = await new Response(stream).arrayBuffer()
      return stripXmlToText(decoder.decode(decompressed))
    }

    offset = dataEnd
  }

  throw new Error('Could not find readable document text inside this DOCX.')
}

export async function extractOnboardingSourceFromFile(file: File): Promise<OnboardingSourceExtractionResult> {
  if (!isSupportedOnboardingSourceFile(file.name)) {
    throw new Error('Upload a TXT, Markdown, JSON, PDF, or DOCX file.')
  }

  const extension = extensionForFile(file)
  let rawText = ''
  let warning: string | null = null

  if (extension === '.docx') {
    rawText = await extractDocxText(file)
  } else if (extension === '.pdf') {
    rawText = extractRoughPdfText(new TextDecoder('latin1').decode(await file.arrayBuffer()))
    warning = 'PDF extraction is text-only; scanned pages may need pasted text.'
  } else {
    rawText = await file.text()
  }

  const normalized = normalizeOnboardingSourceText(rawText)
  if (!normalized.text) {
    throw new Error('No readable text was found in this file.')
  }

  return {
    context: {
      kind: 'file',
      title: file.name.replace(/\.[^.]+$/, ''),
      fileName: file.name,
      mimeType: file.type || null,
      url: null,
      extractedText: normalized.text,
      charCount: normalized.charCount,
      truncated: normalized.truncated,
    },
    warning: normalized.truncated
      ? `Using the first ${ONBOARDING_SOURCE_TEXT_LIMIT.toLocaleString()} characters from this file.`
      : warning,
  }
}

export function buildPromptSourceContext(prompt: string, kind: 'prompt' | 'example' = 'prompt'): WorldPromptSourceContext {
  const normalized = normalizeOnboardingSourceText(prompt)
  return {
    kind,
    title: kind === 'example' ? 'Example prompt' : '',
    fileName: null,
    mimeType: null,
    url: null,
    extractedText: normalized.text,
    charCount: normalized.charCount,
    truncated: normalized.truncated,
  }
}

export function buildUrlSourceContextFromExtractionResponse(
  data: OnboardingUrlExtractionResponse,
  fallbackUrl: string,
): WorldPromptSourceContext {
  if (data.ok !== true) {
    throw new Error('Could not read that URL.')
  }
  if (typeof data.extractedText !== 'string' || !data.extractedText.trim()) {
    throw new Error('No readable text was found at that URL.')
  }
  const normalized = normalizeOnboardingSourceText(data.extractedText)
  return {
    kind: 'url',
    title: typeof data.title === 'string' ? data.title.trim() : '',
    fileName: null,
    mimeType: typeof data.mimeType === 'string' ? data.mimeType : null,
    url: typeof data.url === 'string' ? data.url : fallbackUrl,
    extractedText: normalized.text,
    charCount: typeof data.charCount === 'number' && data.charCount > normalized.charCount
      ? data.charCount
      : normalized.charCount,
    truncated: Boolean(data.truncated) || normalized.truncated,
  }
}
