import { chromium } from 'npm:playwright-core@1.59.1'
import { PDFDocument } from 'npm:pdf-lib@1.17.1'
import sharp from 'npm:sharp@0.33.5'
import { buildEbookHtmlDocument, type EbookHtmlOptions } from '../../src/domain/ebookDocument.ts'

export type EbookPdfRenderInput = EbookHtmlOptions & {
  markdown: string
  fileName?: string
  renderMode?: 'ebook' | 'comic' | 'reference' | 'designed_reference'
  coverImage?: {
    bytes: Uint8Array
    mimeType: string
    assetKey?: string
    storagePath?: string
    width?: number | null
    height?: number | null
    prompt?: string
  } | null
  comicPages?: Array<{
    bytes: Uint8Array
    mimeType: string
    assetKey?: string
    storagePath?: string
    width?: number | null
    height?: number | null
    prompt?: string
    pageNumber: number
  }>
  comicScript?: Record<string, unknown> | null
  referenceImages?: Array<{
    bytes: Uint8Array
    mimeType: string
    key?: string
    entityKey?: string
    title: string
    caption?: string
    type?: string
    assetKey?: string
    storagePath?: string
  }>
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
  return imageBytesDataUrl(coverImage.bytes, coverImage.mimeType || 'image/png')
}

function imageBytesDataUrl(bytes: Uint8Array, mimeType: string) {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize))
  }
  return `data:${mimeType || 'image/png'};base64,${btoa(binary)}`
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

async function embedImage(document: PDFDocument, image: { bytes: Uint8Array; mimeType: string }) {
  const mimeType = image.mimeType.toLowerCase()
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return document.embedJpg(image.bytes)
  return document.embedPng(image.bytes)
}

async function prepareComicPageImageForPdf(image: { bytes: Uint8Array; mimeType: string }) {
  try {
    const result = await sharp(image.bytes)
      .rotate()
      .resize({
        width: 1325,
        height: 2050,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 88,
        mozjpeg: true,
      })
      .toBuffer({ resolveWithObject: true })

    return {
      bytes: new Uint8Array(result.data),
      mimeType: 'image/jpeg',
      width: result.info.width,
      height: result.info.height,
    }
  } catch {
    return image
  }
}

export async function renderComicPdf(input: EbookPdfRenderInput) {
  const pages = [...(input.comicPages ?? [])].sort((left, right) => left.pageNumber - right.pageNumber)
  if (pages.length === 0) throw new Error('Comic PDF rendering requires at least one generated page image.')
  const document = await PDFDocument.create()
  const pageWidth = 6.625 * 72
  const pageHeight = 10.25 * 72

  for (const comicPage of pages) {
    const page = document.addPage([pageWidth, pageHeight])
    const preparedImage = await prepareComicPageImageForPdf(comicPage)
    const image = await embedImage(document, preparedImage)
    const imageWidth = image.width
    const imageHeight = image.height
    const scale = Math.max(pageWidth / imageWidth, pageHeight / imageHeight)
    const drawWidth = imageWidth * scale
    const drawHeight = imageHeight * scale
    page.drawImage(image, {
      x: (pageWidth - drawWidth) / 2,
      y: (pageHeight - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    })
  }

  const bytes = await document.save()
  return {
    bytes,
    metadata: {
      renderer: 'pdf-lib-full-bleed-comic',
      rendererEngine: 'pdf-lib',
      pageSize: '6.625in x 10.25in',
      byteSize: bytes.byteLength,
      pageCount: await countPdfPages(bytes),
      comicPageCount: pages.length,
      pageAssetKeys: pages.map((page) => page.assetKey ?? ''),
      pageStoragePaths: pages.map((page) => page.storagePath ?? ''),
      title: input.title?.trim() || 'Generated Comic',
      scriptTitle: typeof input.comicScript?.title === 'string' ? input.comicScript.title : '',
    },
  }
}

export async function renderOutputPdf(input: EbookPdfRenderInput) {
  if (input.renderMode === 'comic' || (input.comicPages?.length ?? 0) > 0) {
    return renderComicPdf(input)
  }
  return renderEbookPdf(input)
}

export async function renderEbookPdf(input: EbookPdfRenderInput) {
  const documentMode = input.renderMode === 'reference' || input.renderMode === 'designed_reference'
    ? input.renderMode
    : input.documentMode
  const designedReferenceMode = documentMode === 'designed_reference'
  const referenceMode = documentMode === 'reference' || designedReferenceMode
  const pageSize = input.pageSize ?? (designedReferenceMode ? 'a4' : referenceMode ? 'letter' : 'trade_6x9')
  const pageWidth = pageSize === 'a4' ? '8.27in' : referenceMode ? '8.5in' : '6in'
  const pageHeight = pageSize === 'a4' ? '11.69in' : referenceMode ? '11in' : '9in'
  const referenceImages = (input.referenceImages ?? []).map((image) => ({
    key: image.key ?? image.assetKey ?? '',
    entityKey: image.entityKey ?? '',
    title: image.title,
    caption: image.caption ?? '',
    type: image.type ?? '',
    src: imageBytesDataUrl(image.bytes, image.mimeType || 'image/png'),
  }))
  const { html, document } = buildEbookHtmlDocument(input.markdown, {
    ...input,
    documentMode,
    pageSize,
    referenceImages,
  })
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
    const page = await browser.newPage({
      viewport: referenceMode
        ? pageSize === 'a4'
          ? { width: 1191, height: 1684 }
          : { width: 1224, height: 1584 }
        : { width: 864, height: 1296 },
    })
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
      width: pageWidth,
      height: pageHeight,
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
        left: designedReferenceMode ? '0.64in' : referenceMode ? '0.82in' : '0.76in',
        right: designedReferenceMode ? '0.64in' : referenceMode ? '0.82in' : '0.64in',
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
        documentMode: designedReferenceMode ? 'designed_reference' : referenceMode ? 'reference' : 'ebook',
        pageSize: pageSize === 'a4' ? 'A4' : referenceMode ? '8.5in x 11in' : '6in x 9in',
        byteSize: pdfBytes.byteLength,
        pageCount: await countPdfPages(pdfBytes),
        manuscriptCharacterCount: input.markdown.length,
        chapterCount: document.metadata.chapterCount,
        paragraphCount: document.metadata.paragraphCount,
        referenceImageCount: referenceImages.length,
        referenceImageAssetKeys: (input.referenceImages ?? []).map((image) => image.assetKey ?? image.key ?? '').filter(Boolean),
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
