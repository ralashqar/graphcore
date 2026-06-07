const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const distDir = path.join(root, 'dist')
const defaultPublicSiteUrl = 'https://synarc.ai'

function normalizePublicSiteUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/+$/g, '')
  if (!trimmed) return defaultPublicSiteUrl

  try {
    const parsed = new URL(trimmed)
    return parsed.origin + parsed.pathname.replace(/\/+$/g, '')
  } catch {
    return defaultPublicSiteUrl
  }
}

const siteUrl = normalizePublicSiteUrl(process.env.VITE_PUBLIC_SITE_URL)
const now = new Date().toISOString()

fs.mkdirSync(distDir, { recursive: true })

fs.writeFileSync(
  path.join(distDir, 'robots.txt'),
  [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n'),
)

fs.writeFileSync(
  path.join(distDir, 'sitemap.xml'),
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${siteUrl}/</loc>`,
    `    <lastmod>${now}</lastmod>`,
    '    <changefreq>weekly</changefreq>',
    '    <priority>1.0</priority>',
    '  </url>',
    '</urlset>',
    '',
  ].join('\n'),
)

console.log(`Wrote landing SEO assets for ${siteUrl}`)
