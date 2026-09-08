import { buildManifestSchema, gameDesignSchema, GAME_RUNTIME_VERSION, GAME_TEMPLATE, systemKeys, type GameArtifact, type GameDesignSpec } from './contracts.ts'
import { ADVENTURE_SYSTEMS } from './template.ts'

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(value)
}
export async function hashGameValue(value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)))
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')
}
export type GameFinding = { nodeKey: string; message: string }
export function validateGameDesign(input: unknown): GameFinding[] {
  const parsed = gameDesignSchema.safeParse(input)
  if (!parsed.success) return parsed.error.issues.map(i => ({ nodeKey: String(i.path[0] ?? 'design'), message: `${i.path.join('.')}: ${i.message}` }))
  const d = parsed.data, findings: GameFinding[] = []
  const fail = (nodeKey: string, message: string) => findings.push({ nodeKey, message })
  const unique = (entries: { key: string }[], label: string) => { const seen = new Set(); entries.forEach(e => { if (seen.has(e.key)) fail(e.key, `Duplicate ${label} key`); seen.add(e.key) }) }
  unique(d.systems, 'system'); unique(d.prefabs, 'prefab'); unique(d.level.instances, 'instance'); unique(d.assets, 'asset')
  for (const system of ADVENTURE_SYSTEMS) {
    const actual = d.systems.find(s => s.key === system.key)
    if (!actual || actual.module !== system.module || canonicalJson(actual.ports) !== canonicalJson(system.ports) || canonicalJson(actual.owns) !== canonicalJson(system.owns) || canonicalJson(actual.dependencies) !== canonicalJson(system.dependencies)) fail(system.key, 'System interface is incompatible with adventure.v1')
  }
  const stateOwners = new Map<string, string>()
  for (const s of d.systems) for (const field of s.owns) { if (stateOwners.has(field)) fail(s.key, `${field} already belongs to ${stateOwners.get(field)}`); stateOwners.set(field, s.key) }
  const visit = (key: string, path: string[]) => {
    if (path.includes(key)) { fail(key, 'System dependency cycle'); return }
    d.systems.find(s => s.key === key)?.dependencies.forEach(dep => visit(dep, [...path, key]))
  }
  d.systems.forEach(s => visit(s.key, []))
  const player = d.prefabs.filter(p => p.role === 'player')
  if (player.length !== 1) fail('player', 'Exactly one player prefab is required')
  for (const p of d.prefabs) {
    if (Object.values(p.size).some(v => v <= 0 || v > 40)) fail(p.key, 'Prefab dimensions must be positive and at most 40m')
    if (p.assetRecipeKey && !d.assets.some(a => a.key === p.assetRecipeKey)) fail(p.key, 'Missing asset recipe')
    if (p.role === 'player' && p.assetRecipeKey && d.assets.find(a => a.key === p.assetRecipeKey)?.method !== 'approved_rig') fail(p.key, 'Player requires the approved animated template rig')
  }
  for (const role of ['npc', 'key', 'door', 'goal']) {
    if (d.level.instances.filter(i => d.prefabs.find(p => p.key === i.prefabKey)?.role === role).length !== 1) fail('level', `Exactly one ${role} instance is required`)
  }
  for (const instance of d.level.instances) {
    if (!d.prefabs.some(p => p.key === instance.prefabKey)) fail(instance.key, 'Missing prefab')
    if (Math.abs(instance.position.x) > d.level.width / 2 || Math.abs(instance.position.z) > d.level.depth / 2) fail(instance.key, 'Instance is outside level bounds')
    if (instance.rotationY !== 0 || instance.position.y !== 0) fail(instance.key, 'Adventure v1 requires ground-level axis-aligned instances')
  }
  if (Math.abs(d.level.spawn.x) > d.level.width / 2 - 1 || Math.abs(d.level.spawn.z) > d.level.depth / 2 - 1 || d.level.spawn.y !== 0) fail('movement', 'Spawn must be on the ground inside the level')
  if (d.movement.sprintSpeed < d.movement.walkSpeed) fail('movement', 'Sprint speed cannot be below walking speed')
  for (const a of d.assets) {
    if (a.styleVersion !== d.style.version) fail('style', 'Asset recipe references a stale style version')
    if (Object.values(a.dimensions).some(v => v <= 0 || v > 40)) fail(a.key, 'Asset dimensions must be positive and at most 40m')
  }
  return findings
}
export async function gameNodeHashes(d: GameDesignSpec) {
  const hashes: Record<string, string> = {}
  const parts = { movement: d.movement, interaction: d.prefabs.map(p => ({ key: p.key, role: p.role, size: p.size })), inventory: d.inventory, dialogue: d.dialogue, quest: d.quest, presentation: d.style, persistence: { version: 1 } }
  for (const k of systemKeys) hashes[k] = await hashGameValue({ contract: d.systems.find(s => s.key === k), config: parts[k] })
  hashes.level = await hashGameValue({ level: d.level, colliders: d.prefabs.map(p => ({ key: p.key, size: p.size, collider: p.collider })) })
  for (const a of d.assets) hashes[`asset.${a.key}`] = await hashGameValue({ recipe: a, style: d.style })
  return hashes
}
export function affectedGameNodes(d: GameDesignSpec, previous: Record<string, string>, next: Record<string, string>) {
  const affected = new Set(Object.keys(next).filter(k => next[k] !== previous[k]))
  Object.keys(previous).filter(k => !(k in next)).forEach(k => affected.add(k))
  let expanded = true
  while (expanded) { expanded = false; for (const s of d.systems) if (!affected.has(s.key) && s.dependencies.some(k => affected.has(k))) { affected.add(s.key); expanded = true } }
  return [...affected]
}
export async function compileGame(input: { id: string; projectId: string; draftId: string; sourceRevision: number; design: GameDesignSpec; assets?: GameArtifact[] }) {
  const findings = validateGameDesign(input.design)
  if (findings.length) throw new Error(findings.map(f => `${f.nodeKey}: ${f.message}`).join('\n'))
  const nodeHashes = await gameNodeHashes(input.design)
  const assets = (input.assets ?? []).filter(a => a.sourceHash === nodeHashes[`asset.${a.recipeKey}`])
  if (assets.reduce((total, a) => total + a.bytes, 0) > 64000000 || assets.reduce((total, a) => total + a.triangles, 0) > 250000) throw new Error('Build exceeds desktop asset budget (64MB / 250,000 triangles)')
  return buildManifestSchema.parse({ ...input, assets, schemaVersion: 1, runtimeVersion: GAME_RUNTIME_VERSION, templateVersion: GAME_TEMPLATE, sourceHash: await hashGameValue(input.design), nodeHashes })
}
