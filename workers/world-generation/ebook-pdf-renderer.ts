import { chromium } from 'npm:playwright-core@1.59.1'
import { PDFDocument } from 'npm:pdf-lib@1.17.1'
import { buildEbookHtmlDocument, type EbookHtmlOptions } from '../../src/domain/ebookDocument.ts'

export type EbookPdfRenderInput = EbookHtmlOptions & {
  markdown: string
  fileName?: string
  coverImage?: {
    bytes: Uint8Array
    mimeType: string
    assetKey?: string
    storagePath?: string
    width?: number | null
    height?: number | null
    prompt?: string
  } | null
}

function findChromiumExecutable() {
  const configured = Deno.env.get('CHROMIUM_EXECUTABLE_PATH')?.trim()
  const candidates = [
    configured,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    try {
      const stat = Deno.statSync(candidate)
      if (stat.isFile || stat.isSymlink) return candidate
    } catch {
      // Try the next known platform path.
    }
  }
  return configured || undefined
}

async function countPdfPages(bytes: Uint8Array) {
  try {
    const document = await PDFDocument.load(bytes)
    return document.getPageCount()
  } catch {
    return null
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function coverImageDataUrl(coverImage: NonNullable<EbookPdfRenderInput['coverImage']>) {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < coverImage.bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...coverImage.bytes.slice(index, index + chunkSize))
  }
  return `data:${coverImage.mimeType || 'image/png'};base64,${btoa(binary)}`
}

function buildCoverHtml(input: EbookPdfRenderInput) {
  if (!input.coverImage) return ''
  const dataUrl = coverImageDataUrl(input.coverImage)
  const title = input.title?.trim() || 'Generated Ebook'
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)} Cover</title>
  <style>
    @page { size: 6in 9in; margin: 0; }
    html, body {
      width: 6in;
      height: 9in;
      margin: 0;
      background: #080808;
    }
    .cover-page {
      width: 6in;
      height: 9in;
      overflow: hidden;
      background: #080808;
    }
    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  </style>
</head>
<body>
  <section class="cover-page" aria-label="${escapeHtml(title)} cover">
    <img src="${dataUrl}" alt="${escapeHtml(title)} cover">
  </section>
</body>
</html>`
}

async function mergePdfDocuments(parts: Uint8Array[]) {
  const merged = await PDFDocument.create()
  for (const part of parts) {
    const source = await PDFDocument.load(part)
    const pages = await merged.copyPages(source, source.getPageIndices())
    for (const page of pages) merged.addPage(page)
  }
  return await merged.save()
}

export async function renderEbookPdf(input: EbookPdfRenderInput) {
  const { html, document } = buildEbookHtmlDocument(input.markdown, input)
  const browser = await chromium.launch({
    executablePath: findChromiumExecutable(),
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=medium',
    ],
  })

  try {
    const page = await browser.newPage({ viewport: { width: 864, height: 1296 } })
    let coverPdfBytes: Uint8Array | null = null
    if (input.coverImage) {
      await page.setContent(buildCoverHtml(input), { waitUntil: 'load' })
      coverPdfBytes = await page.pdf({
        width: '6in',
        height: '9in',
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        margin: {
          top: '0',
          bottom: '0',
          left: '0',
          right: '0',
        },
      })
    }

    await page.setContent(html, { waitUntil: 'load' })
    const interiorPdfBytes = await page.pdf({
      width: '6in',
      height: '9in',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: [
        '<div style="width:100%;font-family:Georgia,Times New Roman,serif;',
        'font-size:8px;color:#6a6259;text-align:center;">',
        '<span class="pageNumber"></span>',
        '</div>',
      ].join(''),
      margin: {
        top: '0.72in',
        bottom: '0.72in',
        left: '0.76in',
        right: '0.64in',
      },
    })
    const pdfBytes = coverPdfBytes
      ? await mergePdfDocuments([coverPdfBytes, interiorPdfBytes])
      : interiorPdfBytes

    return {
      bytes: pdfBytes,
      metadata: {
        renderer: 'chromium-html-css',
        rendererEngine: 'playwright-core',
        pageSize: '6in x 9in',
        byteSize: pdfBytes.byteLength,
        pageCount: await countPdfPages(pdfBytes),
        manuscriptCharacterCount: input.markdown.length,
        chapterCount: document.metadata.chapterCount,
        paragraphCount: document.metadata.paragraphCount,
        title: document.title,
        cover: input.coverImage ? {
          assetKey: input.coverImage.assetKey ?? '',
          storagePath: input.coverImage.storagePath ?? '',
          mimeType: input.coverImage.mimeType,
          width: input.coverImage.width ?? null,
          height: input.coverImage.height ?? null,
          prompt: input.coverImage.prompt ?? '',
          renderer: 'chromium-cover-page',
        } : null,
      },
    }
  } finally {
    await browser.close()
  }
}
