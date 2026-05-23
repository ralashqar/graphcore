const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const landingDir = path.join(root, 'public', 'landing')
const sourceDirs = ['src']
const sourceFiles = ['README.md', 'package.json']
const assetExtensions = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif', '.mp4', '.webm', '.pdf'])
const largeUnusedThresholdBytes = 500 * 1024

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return []
  const entries = fs.readdirSync(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(fullPath))
    if (entry.isFile()) files.push(fullPath)
  }

  return files
}

function readReferenceText() {
  const files = [
    ...sourceDirs.flatMap((directory) => walkFiles(path.join(root, directory))),
    ...sourceFiles.map((file) => path.join(root, file)).filter(fs.existsSync),
  ].filter((file) => /\.(tsx?|jsx?|css|json|md)$/.test(file))

  return files.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
}

function publicPath(file) {
  return `/${path.relative(path.join(root, 'public'), file).replaceAll(path.sep, '/')}`
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const references = readReferenceText()
const assets = walkFiles(landingDir)
  .filter((file) => assetExtensions.has(path.extname(file).toLowerCase()))
  .map((file) => {
    const routePath = publicPath(file)
    const basename = path.basename(file)
    const size = fs.statSync(file).size
    return {
      file,
      routePath,
      size,
      referenced: references.includes(routePath) || references.includes(basename),
    }
  })
  .sort((left, right) => right.size - left.size)

const unusedLargeAssets = assets.filter((asset) => !asset.referenced && asset.size >= largeUnusedThresholdBytes)
const totalBytes = assets.reduce((sum, asset) => sum + asset.size, 0)

console.log(`Landing assets: ${assets.length} files, ${formatBytes(totalBytes)}`)

if (unusedLargeAssets.length > 0) {
  console.error('Large unreferenced landing assets:')
  for (const asset of unusedLargeAssets) {
    console.error(`- ${asset.routePath} (${formatBytes(asset.size)})`)
  }
  process.exit(1)
}

console.log('No large unreferenced landing assets found.')
