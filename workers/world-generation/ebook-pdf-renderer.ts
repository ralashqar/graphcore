import { chromium } from 'npm:playwright-core@1.59.1'
import { buildEbookHtmlDocument, type EbookHtmlOptions } from '../../src/domain/ebookDocument.ts'

export type EbookPdfRenderInput = EbookHtmlOptions & {
  markdown: string
  fileName?: string
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

function countPdfPages(bytes: Uint8Array) {
  const text = new TextDecoder().decode(bytes)
  return text.match(/\/Type\s*\/Page\b/g)?.length ?? null
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
    await page.setContent(html, { waitUntil: 'load' })
    const pdfBytes = await page.pdf({
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

    return {
      bytes: pdfBytes,
      metadata: {
        renderer: 'chromium-html-css',
        rendererEngine: 'playwright-core',
        pageSize: '6in x 9in',
        byteSize: pdfBytes.byteLength,
        pageCount: countPdfPages(pdfBytes),
        manuscriptCharacterCount: input.markdown.length,
        chapterCount: document.metadata.chapterCount,
        paragraphCount: document.metadata.paragraphCount,
        title: document.title,
      },
    }
  } finally {
    await browser.close()
  }
}
