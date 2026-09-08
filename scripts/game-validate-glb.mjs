import { readFile, writeFile } from 'node:fs/promises'
import validator from 'gltf-validator'
const [input, output, mode] = process.argv.slice(2)
if (!input || !output) throw new Error('Usage: game-validate-glb input.glb report.json')
const report = await validator.validateBytes(new Uint8Array(await readFile(input)), { maxIssues: 100, externalResourceFunction: () => Promise.reject(new Error('External glTF resources are forbidden')) })
await writeFile(output, JSON.stringify(report))
const errors = report.issues.messages.filter(issue => issue.severity === 0)
// Provider meshes sometimes contain zero-length custom normals. The checked-in
// Blender import recalculates them. Structural/resource errors remain fatal,
// and the exported GLB must pass the full validator without this allowance.
const fatal = mode === '--repairable' && !report.issues.truncated ? errors.filter(issue => issue.code !== 'ACCESSOR_VECTOR3_NON_UNIT') : errors
if (fatal.length || (report.issues.numErrors > errors.length)) {
  console.error(fatal.slice(0, 5).map(issue => `${issue.code}: ${issue.message}`).join('\n') || 'GLB contains unreported validation errors')
  process.exitCode = 1
}
