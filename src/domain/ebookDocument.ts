export type EbookDocumentBlock =
  | { type: 'chapter'; title: string; level: 2 }
  | { type: 'section'; title: string; level: 3 }
  | { type: 'paragraph'; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'scene_break' }

export type EbookDocument = {
  title: string
  subtitle: string
  blocks: EbookDocumentBlock[]
  metadata: {
    manuscriptCharacterCount: number
    chapterCount: number
    paragraphCount: number
  }
}

export type EbookHtmlOptions = {
  title?: string
  subtitle?: string
  provenance?: string
  generatedAt?: string
}

const SCENE_BREAK_PATTERN = /^(\*\s*){3,}$|^-{3,}$|^_{3,}$/

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInlineMarkdown(value: string) {
  const escaped = escapeHtml(value)
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
}

function flushParagraph(lines: string[], blocks: EbookDocumentBlock[]) {
  if (lines.length === 0) return
  const text = lines.join(' ').replace(/\s+/g, ' ').trim()
  if (text) blocks.push({ type: 'paragraph', text })
  lines.length = 0
}

function stripMarkdownHeading(line: string, level: number) {
  return line.replace(new RegExp(`^#{${level}}\\s+`), '').trim()
}

export function parseEbookMarkdown(markdown: string, options: EbookHtmlOptions = {}): EbookDocument {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: EbookDocumentBlock[] = []
  const paragraphLines: string[] = []
  let title = options.title?.trim() ?? ''
  let subtitle = options.subtitle?.trim() ?? ''

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph(paragraphLines, blocks)
      continue
    }
    if (line.startsWith('# ')) {
      flushParagraph(paragraphLines, blocks)
      if (!title) title = stripMarkdownHeading(line, 1)
      continue
    }
    if (line.startsWith('## ')) {
      flushParagraph(paragraphLines, blocks)
      blocks.push({ type: 'chapter', title: stripMarkdownHeading(line, 2), level: 2 })
      continue
    }
    if (line.startsWith('### ')) {
      flushParagraph(paragraphLines, blocks)
      blocks.push({ type: 'section', title: stripMarkdownHeading(line, 3), level: 3 })
      continue
    }
    if (line.startsWith('>')) {
      flushParagraph(paragraphLines, blocks)
      const quote = line.replace(/^>\s?/, '').trim()
      if (!subtitle && blocks.length === 0) subtitle = quote
      blocks.push({ type: 'blockquote', text: quote })
      continue
    }
    if (SCENE_BREAK_PATTERN.test(line)) {
      flushParagraph(paragraphLines, blocks)
      blocks.push({ type: 'scene_break' })
      continue
    }
    paragraphLines.push(line)
  }
  flushParagraph(paragraphLines, blocks)

  const chapterCount = blocks.filter((block) => block.type === 'chapter').length
  const paragraphCount = blocks.filter((block) => block.type === 'paragraph').length

  return {
    title: title || 'Untitled Ebook',
    subtitle,
    blocks,
    metadata: {
      manuscriptCharacterCount: markdown.length,
      chapterCount,
      paragraphCount,
    },
  }
}

export function buildEbookHtmlBody(document: EbookDocument) {
  return document.blocks.map((block) => {
    if (block.type === 'chapter') {
      return `<section class="chapter"><h1>${renderInlineMarkdown(block.title)}</h1></section>`
    }
    if (block.type === 'section') {
      return `<h2 class="section-heading">${renderInlineMarkdown(block.title)}</h2>`
    }
    if (block.type === 'blockquote') {
      return `<blockquote>${renderInlineMarkdown(block.text)}</blockquote>`
    }
    if (block.type === 'scene_break') {
      return '<div class="scene-break" aria-label="Scene break">* * *</div>'
    }
    return `<p>${renderInlineMarkdown(block.text)}</p>`
  }).join('\n')
}

export function buildEbookHtmlDocument(markdown: string, options: EbookHtmlOptions = {}) {
  const document = parseEbookMarkdown(markdown, options)
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const provenance = options.provenance?.trim() || 'Generated from GraphCore world context'
  const body = buildEbookHtmlBody(document)
  const subtitle = document.subtitle
    ? `<p class="title-subtitle">${renderInlineMarkdown(document.subtitle)}</p>`
    : ''
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(document.title)}</title>
  <style>
    @page {
      size: 6in 9in;
      margin: 0.72in 0.64in 0.72in 0.76in;
    }

    html {
      color: #161514;
      font-family: Georgia, "Times New Roman", Times, serif;
      font-size: 11pt;
      line-height: 1.45;
      hyphens: auto;
      -webkit-hyphens: auto;
    }

    body {
      margin: 0;
      text-rendering: optimizeLegibility;
    }

    .title-page {
      break-after: page;
      page-break-after: always;
      min-height: 7.45in;
      display: flex;
      flex-direction: column;
      justify-content: center;
      text-align: center;
    }

    .title-page h1 {
      margin: 0;
      font-size: 28pt;
      line-height: 1.08;
      font-weight: 600;
      letter-spacing: 0;
    }

    .title-subtitle {
      margin: 0.35in auto 0;
      max-width: 4.6in;
      font-size: 12pt;
      line-height: 1.45;
      text-align: center;
      text-indent: 0;
    }

    .title-provenance {
      margin-top: 1.1in;
      font-size: 8pt;
      line-height: 1.35;
      color: #5c5750;
      text-align: center;
      text-indent: 0;
    }

    .chapter {
      break-before: page;
      page-break-before: always;
      padding-top: 0.7in;
    }

    .chapter:first-of-type {
      break-before: auto;
      page-break-before: auto;
    }

    .chapter h1 {
      margin: 0 0 0.42in;
      text-align: center;
      font-size: 16pt;
      line-height: 1.25;
      font-weight: 600;
      letter-spacing: 0;
    }

    .section-heading {
      margin: 0.26in 0 0.16in;
      text-align: center;
      font-size: 10pt;
      line-height: 1.25;
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }

    p {
      margin: 0;
      text-align: justify;
      orphans: 2;
      widows: 2;
    }

    p + p {
      text-indent: 0.22in;
    }

    h1 + p,
    h2 + p,
    blockquote + p,
    .scene-break + p {
      text-indent: 0;
    }

    blockquote {
      margin: 0 0 0.28in;
      padding: 0 0.22in;
      color: #34302c;
      font-size: 10.5pt;
      line-height: 1.45;
      text-align: center;
    }

    .scene-break {
      margin: 0.28in 0;
      text-align: center;
      text-indent: 0;
      letter-spacing: 0.14em;
    }
  </style>
</head>
<body>
  <section class="title-page">
    <h1>${renderInlineMarkdown(document.title)}</h1>
    ${subtitle}
    <p class="title-provenance">${escapeHtml(provenance)}<br>${escapeHtml(generatedAt.slice(0, 10))}</p>
  </section>
  <main>
    ${body}
  </main>
</body>
</html>`
  return { html, document }
}

export function buildEbookDocumentMetadata(markdown: string, options: EbookHtmlOptions = {}) {
  const document = parseEbookMarkdown(markdown, options)
  return {
    renderer: 'chromium-html-css',
    pageSize: '6in x 9in',
    manuscriptCharacterCount: document.metadata.manuscriptCharacterCount,
    chapterCount: document.metadata.chapterCount,
    paragraphCount: document.metadata.paragraphCount,
    title: document.title,
  }
}
