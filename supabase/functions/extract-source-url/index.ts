import { requireAuthedAdminClient } from '../_shared/auth.ts'
import { errorResponse, json, maybeHandleOptions } from '../_shared/http.ts'

const MAX_HTML_BYTES = 1_500_000
const MAX_TEXT_CHARS = 24000

function normalizeText(value: string) {
  return value
    .replace(/\u0000/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractTitle(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''
  return normalizeText(title.replace(/<[^>]+>/g, ' ')).slice(0, 160)
}

function htmlToReadableText(html: string) {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<\/(p|div|section|article|h1|h2|h3|li|blockquote|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  return normalizeText(withoutNoise)
}

Deno.serve(async (request) => {
  const optionsResponse = maybeHandleOptions(request)
  if (optionsResponse) return optionsResponse

  try {
    await requireAuthedAdminClient(request, 'extract-source-url')
    const payload = await request.json()
    const rawUrl = typeof payload?.url === 'string' ? payload.url.trim() : ''
    if (!rawUrl) throw new Error('URL is required.')
    const url = new URL(rawUrl)
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Only HTTP and HTTPS URLs can be imported.')
    }

    const response = await fetch(url.toString(), {
      redirect: 'follow',
      headers: {
        accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.2',
        'user-agent': 'GraphCoreSourceIngestion/1.0',
      },
    })
    if (!response.ok) {
      throw new Error(`URL returned HTTP ${response.status}.`)
    }

    const contentType = response.headers.get('content-type') ?? ''
    const body = await response.arrayBuffer()
    if (body.byteLength > MAX_HTML_BYTES) {
      throw new Error('URL content is too large to ingest directly.')
    }
    const raw = new TextDecoder().decode(body)
    const title = contentType.includes('html') ? extractTitle(raw) : url.hostname
    const readableText = contentType.includes('html') ? htmlToReadableText(raw) : normalizeText(raw)
    if (!readableText) {
      throw new Error('No readable text was found at this URL.')
    }
    const truncated = readableText.length > MAX_TEXT_CHARS
    const extractedText = truncated ? readableText.slice(0, MAX_TEXT_CHARS).trim() : readableText

    return json({
      ok: true,
      title: title || url.hostname,
      url: url.toString(),
      extractedText,
      charCount: readableText.length,
      truncated,
      mimeType: contentType.split(';')[0] || null,
    })
  } catch (error) {
    return errorResponse(error, 'URL extraction failed.')
  }
})
