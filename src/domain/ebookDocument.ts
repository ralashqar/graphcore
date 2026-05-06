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
  documentMode?: 'ebook' | 'reference' | 'designed_reference'
  pageSize?: 'trade_6x9' | 'letter' | 'a4'
  coverImageSrc?: string
  showReferenceCaptions?: boolean
  referenceImages?: Array<{
    key?: string
    entityKey?: string
    title: string
    caption?: string
    type?: string
    src: string
  }>
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

function sectionImageFilter(title: string) {
  const normalized = title.toLowerCase()
  if (normalized.includes('character') || normalized.includes('cast')) return (image: NonNullable<EbookHtmlOptions['referenceImages']>[number]) => ['actor', 'character', 'persona'].includes((image.type ?? '').toLowerCase())
  if (normalized.includes('location') || normalized.includes('place') || normalized.includes('environment')) return (image: NonNullable<EbookHtmlOptions['referenceImages']>[number]) => ['place', 'location', 'environment'].includes((image.type ?? '').toLowerCase())
  if (normalized.includes('faction') || normalized.includes('group') || normalized.includes('brand')) return (image: NonNullable<EbookHtmlOptions['referenceImages']>[number]) => ['group', 'faction', 'brand', 'organization'].includes((image.type ?? '').toLowerCase())
  if (normalized.includes('object') || normalized.includes('item') || normalized.includes('prop')) return (image: NonNullable<EbookHtmlOptions['referenceImages']>[number]) => ['object', 'item', 'prop'].includes((image.type ?? '').toLowerCase())
  if (normalized.includes('visual') || normalized.includes('style')) return () => true
  return null
}

function referenceImageIdentity(image: NonNullable<EbookHtmlOptions['referenceImages']>[number]) {
  return image.entityKey || image.key || image.src
}

function buildReferenceImageGrid(
  images: NonNullable<EbookHtmlOptions['referenceImages']>,
  title = 'Visual References',
  options: { showCaptions?: boolean } = {},
) {
  if (images.length === 0) return ''
  return [
    '<section class="reference-image-section">',
    `<h2>${renderInlineMarkdown(title)}</h2>`,
    '<div class="reference-image-grid">',
    ...images.map((image) => [
      '<figure class="reference-image-card">',
      `<img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.title)}">`,
      '<figcaption>',
      `<strong>${renderInlineMarkdown(image.title)}</strong>`,
      image.type ? `<em>${renderInlineMarkdown(image.type)}</em>` : '',
      options.showCaptions && image.caption ? `<span>${renderInlineMarkdown(image.caption)}</span>` : '',
      '</figcaption>',
      '</figure>',
    ].filter(Boolean).join('')),
    '</div>',
    '</section>',
  ].join('\n')
}

export function buildEbookHtmlBody(document: EbookDocument, options: EbookHtmlOptions = {}) {
  const designedReference = options.documentMode === 'designed_reference'
  const referenceImages = options.referenceImages ?? []
  const showCaptions = options.showReferenceCaptions === true
  const usedImageIds = new Set<string>()
  const claimSectionImages = (title: string, limit: number) => {
    if (!designedReference) return []
    const sectionFilter = sectionImageFilter(title)
    if (!sectionFilter) return []
    const images = referenceImages
      .filter(sectionFilter)
      .filter((image) => {
        const id = referenceImageIdentity(image)
        return id.length > 0 && !usedImageIds.has(id)
      })
      .slice(0, limit)
    for (const image of images) usedImageIds.add(referenceImageIdentity(image))
    return images
  }
  return document.blocks.map((block) => {
    if (block.type === 'chapter') {
      const sectionImages = claimSectionImages(block.title, 8)
      return [
        `<section class="chapter"><h1>${renderInlineMarkdown(block.title)}</h1></section>`,
        sectionImages.length > 0 ? buildReferenceImageGrid(sectionImages, `${block.title} References`, { showCaptions }) : '',
      ].filter(Boolean).join('\n')
    }
    if (block.type === 'section') {
      const sectionImages = claimSectionImages(block.title, 6)
      return [
        `<h2 class="section-heading">${renderInlineMarkdown(block.title)}</h2>`,
        sectionImages.length > 0 ? buildReferenceImageGrid(sectionImages, `${block.title} References`, { showCaptions }) : '',
      ].filter(Boolean).join('\n')
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
  const referenceMode = options.documentMode === 'reference'
  const designedReferenceMode = options.documentMode === 'designed_reference'
  const referenceLikeMode = referenceMode || designedReferenceMode
  const pageSize = options.pageSize ?? (designedReferenceMode ? 'a4' : referenceMode ? 'letter' : 'trade_6x9')
  const pageCssSize = pageSize === 'a4'
    ? '8.27in 11.69in'
    : pageSize === 'letter'
      ? '8.5in 11in'
      : '6in 9in'
  const pageMinHeight = pageSize === 'a4' ? '10.1in' : pageSize === 'letter' ? '9.45in' : '7.45in'
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const provenance = options.provenance?.trim() || 'Generated from GraphCore world context'
  const body = buildEbookHtmlBody(document, options)
  const coverPage = options.coverImageSrc
    ? [
      '<section class="html-cover-page">',
      `<img src="${escapeHtml(options.coverImageSrc)}" alt="${escapeHtml(document.title)} cover">`,
      '</section>',
    ].join('\n')
    : ''
  const subtitle = document.subtitle
    ? `<p class="title-subtitle">${renderInlineMarkdown(document.subtitle)}</p>`
    : ''
  const visualIndex = ''
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(document.title)}</title>
  <style>
    @page {
      size: ${pageCssSize};
      margin: ${designedReferenceMode ? '0.58in 0.64in 0.62in 0.64in' : referenceMode ? '0.72in 0.82in 0.72in 0.82in' : '0.72in 0.64in 0.72in 0.76in'};
    }

    html {
      color: #161514;
      font-family: ${referenceLikeMode ? 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' : 'Georgia, "Times New Roman", Times, serif'};
      font-size: ${designedReferenceMode ? '10.2pt' : referenceMode ? '10.5pt' : '11pt'};
      line-height: ${referenceLikeMode ? '1.42' : '1.45'};
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
      min-height: ${pageMinHeight};
      display: flex;
      flex-direction: column;
      justify-content: center;
      text-align: center;
      background: ${designedReferenceMode ? 'linear-gradient(135deg, #f7f4ef 0%, #f0f4ff 100%)' : 'transparent'};
      border: ${designedReferenceMode ? '1px solid #ded8cc' : '0'};
      padding: ${designedReferenceMode ? '0.42in' : '0'};
      box-sizing: border-box;
    }

    .html-cover-page {
      break-after: page;
      page-break-after: always;
      min-height: ${pageMinHeight};
      margin: 0;
      display: flex;
      align-items: stretch;
      justify-content: center;
      background: #080808;
      overflow: hidden;
    }

    .html-cover-page img {
      display: block;
      width: 100%;
      height: auto;
      max-height: ${pageMinHeight};
      object-fit: cover;
    }

    .title-page h1 {
      margin: 0;
      font-size: ${designedReferenceMode ? '36pt' : referenceMode ? '34pt' : '28pt'};
      line-height: 1.08;
      font-weight: ${referenceLikeMode ? '700' : '600'};
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
      break-before: ${referenceLikeMode ? 'auto' : 'page'};
      page-break-before: ${referenceLikeMode ? 'auto' : 'always'};
      padding-top: ${referenceLikeMode ? '0.24in' : '0.7in'};
    }

    .chapter:first-of-type {
      break-before: auto;
      page-break-before: auto;
    }

    .chapter h1 {
      margin: ${referenceLikeMode ? '0.18in 0 0.16in' : '0 0 0.42in'};
      text-align: ${referenceLikeMode ? 'left' : 'center'};
      font-size: ${designedReferenceMode ? '20pt' : referenceMode ? '17pt' : '16pt'};
      line-height: 1.25;
      font-weight: ${referenceLikeMode ? '700' : '600'};
      letter-spacing: 0;
      border-bottom: ${referenceLikeMode ? '1px solid #d5d1c8' : '0'};
      padding-bottom: ${referenceLikeMode ? '0.08in' : '0'};
    }

    .section-heading {
      margin: ${referenceLikeMode ? '0.18in 0 0.08in' : '0.26in 0 0.16in'};
      text-align: ${referenceLikeMode ? 'left' : 'center'};
      font-size: 10pt;
      line-height: 1.25;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }

    p {
      margin: ${referenceLikeMode ? '0 0 0.08in' : '0'};
      text-align: ${referenceLikeMode ? 'left' : 'justify'};
      orphans: 2;
      widows: 2;
    }

    p + p {
      text-indent: ${referenceLikeMode ? '0' : '0.22in'};
    }

    h1 + p,
    h2 + p,
    blockquote + p,
    .scene-break + p {
      text-indent: 0;
    }

    blockquote {
      margin: 0 0 0.28in;
      padding: ${referenceLikeMode ? '0.08in 0.14in' : '0 0.22in'};
      color: #34302c;
      font-size: 10.5pt;
      line-height: 1.45;
      text-align: ${referenceLikeMode ? 'left' : 'center'};
      border-left: ${referenceLikeMode ? '3px solid #7b69ff' : '0'};
    }

    .scene-break {
      margin: 0.28in 0;
      text-align: center;
      text-indent: 0;
      letter-spacing: 0.14em;
    }

    .reference-image-section {
      margin: 0.2in 0 0.24in;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .reference-image-section h2 {
      margin: 0 0 0.12in;
      font-size: 12pt;
      line-height: 1.25;
      letter-spacing: 0;
      color: #2d2a25;
    }

    .reference-image-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.12in;
    }

    .reference-image-card {
      margin: 0;
      border: 1px solid #d9d2c7;
      background: #fbfaf7;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .reference-image-card img {
      display: block;
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
      background: #eee9df;
    }

    .reference-image-card figcaption {
      padding: 0.08in 0.09in 0.09in;
      font-size: 7.7pt;
      line-height: 1.25;
    }

    .reference-image-card figcaption strong,
    .reference-image-card figcaption em,
    .reference-image-card figcaption span {
      display: block;
    }

    .reference-image-card figcaption em {
      margin-top: 0.015in;
      color: #7b756b;
      font-size: 6.7pt;
      font-style: normal;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .reference-image-card figcaption span {
      margin-top: 0.03in;
      color: #615b52;
    }
  </style>
</head>
<body>
  ${coverPage}
  <section class="title-page">
    <h1>${renderInlineMarkdown(document.title)}</h1>
    ${subtitle}
    <p class="title-provenance">${escapeHtml(provenance)}<br>${escapeHtml(generatedAt.slice(0, 10))}</p>
  </section>
  ${visualIndex}
  <main>
    ${body}
  </main>
</body>
</html>`
  return { html, document }
}

export function buildEbookDocumentMetadata(markdown: string, options: EbookHtmlOptions = {}) {
  const document = parseEbookMarkdown(markdown, options)
  const referenceMode = options.documentMode === 'reference'
  const designedReferenceMode = options.documentMode === 'designed_reference'
  const pageSize = options.pageSize ?? (designedReferenceMode ? 'a4' : referenceMode ? 'letter' : 'trade_6x9')
  const pageSizeLabel = pageSize === 'a4' ? 'A4' : pageSize === 'letter' ? '8.5in x 11in' : '6in x 9in'
  return {
    renderer: 'chromium-html-css',
    documentMode: designedReferenceMode ? 'designed_reference' : referenceMode ? 'reference' : 'ebook',
    pageSize: pageSizeLabel,
    manuscriptCharacterCount: document.metadata.manuscriptCharacterCount,
    chapterCount: document.metadata.chapterCount,
    paragraphCount: document.metadata.paragraphCount,
    referenceImageCount: options.referenceImages?.length ?? 0,
    title: document.title,
  }
}
