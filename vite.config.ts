import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const defaultPublicSiteUrl = 'https://synarc.ai'
const seoDescription = 'Build and evolve a living world with prompts, then generate cinematics, comics, scenes and more from the same canon, with continuity already handled.'

function normalizePublicSiteUrl(value: string | undefined) {
  const trimmed = value?.trim().replace(/\/+$/g, '')
  if (!trimmed) return defaultPublicSiteUrl

  try {
    const parsed = new URL(trimmed)
    return parsed.origin + parsed.pathname.replace(/\/+$/g, '')
  } catch {
    return defaultPublicSiteUrl
  }
}

function buildSynArcJsonLd(siteUrl: string) {
  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': `${siteUrl}/#organization`,
          name: 'SynArc',
          url: `${siteUrl}/`,
          logo: `${siteUrl}/brand/synarc-logo.png`,
        },
        {
          '@type': 'WebApplication',
          '@id': `${siteUrl}/#web-application`,
          name: 'SynArc',
          url: `${siteUrl}/`,
          applicationCategory: 'MultimediaApplication',
          operatingSystem: 'Web',
          description: seoDescription,
          image: `${siteUrl}/brand/synarc-og.png`,
          publisher: {
            '@id': `${siteUrl}/#organization`,
          },
          audience: {
            '@type': 'Audience',
            audienceType: 'AI filmmakers, storytellers and worldbuilders',
          },
        },
      ],
    },
    null,
    2,
  )
}

function synarcSeoPlugin(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '')
  const siteUrl = normalizePublicSiteUrl(process.env.VITE_PUBLIC_SITE_URL ?? env.VITE_PUBLIC_SITE_URL)
  const jsonLd = buildSynArcJsonLd(siteUrl)

  return {
    name: 'synarc-seo-html',
    transformIndexHtml(html) {
      return html
        .replaceAll('__SYNARC_SITE_URL__', siteUrl)
        .replace('__SYNARC_JSON_LD__', jsonLd)
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), synarcSeoPlugin(mode)],
  define: {
    global: 'globalThis',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          if (id.includes('@react-three/drei')) {
            return 'three-drei'
          }

          if (id.includes('@react-three/fiber')) {
            return 'three-fiber'
          }

          if (id.includes('/three/')) {
            return 'three-core'
          }

          if (id.includes('@xyflow')) {
            return 'xyflow-vendor'
          }

          if (id.includes('elkjs')) {
            return 'elk-vendor'
          }

          if (id.includes('@supabase')) {
            return 'supabase-vendor'
          }

          if (id.includes('react-dom') || id.includes('/react/')) {
            return 'react-vendor'
          }

          return undefined
        },
      },
    },
  },
}))
