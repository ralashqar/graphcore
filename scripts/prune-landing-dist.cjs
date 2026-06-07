const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const distDir = path.join(root, 'dist')
const publicLandingDir = path.join(root, 'public', 'landing')
const landingDir = path.join(distDir, 'landing')
const brandDir = path.join(distDir, 'brand')
const assetsDir = path.join(distDir, 'assets')
const allowedRootFiles = new Set(['index.html'])
const allowedRootDirs = new Set(['assets', 'landing', 'brand'])

function removePath(targetPath) {
  if (!fs.existsSync(targetPath)) return
  fs.rmSync(targetPath, { recursive: true, force: true })
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return []
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(fullPath))
    if (entry.isFile()) files.push(fullPath)
  }
  return files
}

function removeEmptyDirs(directory) {
  if (!fs.existsSync(directory)) return
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirs(path.join(directory, entry.name))
  }
  if (directory !== landingDir && fs.readdirSync(directory).length === 0) {
    fs.rmdirSync(directory)
  }
}

for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
  if (entry.isDirectory() && !allowedRootDirs.has(entry.name)) {
    removePath(path.join(distDir, entry.name))
  }
  if (entry.isFile() && !allowedRootFiles.has(entry.name)) {
    removePath(path.join(distDir, entry.name))
  }
}

if (fs.existsSync(brandDir)) {
  const allowedBrandFiles = new Set(['synarc-logo.png', 'synarc-og.png'])
  for (const entry of fs.readdirSync(brandDir, { withFileTypes: true })) {
    if (!allowedBrandFiles.has(entry.name)) {
      removePath(path.join(brandDir, entry.name))
    }
  }
}

if (fs.existsSync(assetsDir)) {
  for (const file of walkFiles(assetsDir)) {
    const basename = path.basename(file)
    if (/^(App|worldGraphPage|OutputsWorkspace|CinematicsWorkspace|GlobalWorkspace|ActivityWorkspace|OutputGraphOverlayHost|OutputWorkflowGraphOverlay|Character3dPanel|useGraphCanvasController|useWorldAssetUrls|itemAssetWorkspace|graphWorkspace|PromptDock|AuthDialog|WorldBuild)/.test(basename)) {
      removePath(file)
    }
  }
}

if (fs.existsSync(landingDir)) {
  const publicLandingFiles = new Set(
    walkFiles(publicLandingDir).map((file) => path.relative(publicLandingDir, file)),
  )

  for (const file of walkFiles(landingDir)) {
    const relativeFile = path.relative(landingDir, file)
    if (!publicLandingFiles.has(relativeFile)) {
      removePath(file)
    }
  }

  removeEmptyDirs(landingDir)
}

const landingBytes = walkFiles(landingDir).reduce((sum, file) => sum + fs.statSync(file).size, 0)
const distBytes = walkFiles(distDir).reduce((sum, file) => sum + fs.statSync(file).size, 0)
console.log(`Pruned landing dist: ${(distBytes / 1024 / 1024).toFixed(2)} MB total, ${(landingBytes / 1024 / 1024).toFixed(2)} MB landing assets`)
