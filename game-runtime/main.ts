import { buildManifestSchema } from '../src/domain/game/contracts'
import { createGamePlayer, type GamePlayer } from '../src/game-runtime/renderer'
import { runGameAcceptance, findWalkPath } from '../src/domain/game/simulation'
import './style.css'
import { manifestSchema } from '../src/domain/game/v2/spec'
import { createCombatPlayer, type CombatPlayer } from '../src/game-runtime/combatRenderer'
import { manifestSchema as unifiedManifest } from '../src/domain/game/v3/spec'
import { createUnifiedPlayer } from '../src/game-runtime/unifiedRenderer'

let player: GamePlayer | CombatPlayer | null = null, generation = 0, buildId = '', paused = false
const canvas = document.querySelector<HTMLCanvasElement>('#game')!
const status = document.querySelector<HTMLElement>('#status')!
const feedback = document.createElement('p'); feedback.setAttribute('aria-live', 'polite'); status.after(feedback)
const parentOrigin = document.referrer ? new URL(document.referrer).origin : null
const notify = (type: string, extra = {}) => { if (parentOrigin) parent.postMessage({ protocol: 'graphcore.game.v1', type, buildId, ...extra }, parentOrigin) }
async function loadBuild(data: unknown, assetUrls: Record<string, string> = {}) {
  if ([2,3].includes((data as {schemaVersion:number})?.schemaVersion)) {
    const manifest = (data as {schemaVersion:number}).schemaVersion===3?unifiedManifest.parse(data):manifestSchema.parse(data), mine = ++generation
    player?.dispose(); player = null; buildId = manifest.id
    document.querySelector('#title')!.textContent = manifest.design.title
    document.querySelector('#objective')!.textContent = manifest.design.brief
    document.querySelector('small')!.textContent = 'WASD move · Space jump · E grip/climb/activate · C drop · F attack · Q dodge · R shield'
    const update = (text:string, detail:string) => { status.textContent = text; feedback.textContent = detail }
    const next = manifest.schemaVersion===3?await createUnifiedPlayer(canvas,manifest,update):await createCombatPlayer(canvas, manifest, update)
    if (mine !== generation) { next.dispose(); return }
    player = next; paused = false; canvas.focus(); notify('ready')
    const debug = document.querySelector<HTMLButtonElement>('#debug') ?? document.createElement('button'); debug.id = 'debug'; debug.textContent = 'Show sockets'; let shown = false; debug.onclick = () => { shown = !shown; next.debug(shown); debug.textContent = shown ? 'Hide sockets' : 'Show sockets' }; document.querySelector('#actions')!.append(debug)
    if (new URLSearchParams(location.search).get('acceptance') === '1') Object.assign(window, { __gameAcceptance: { ready: true, version: manifest.schemaVersion, state: next.state, metrics: next.metrics, pathToPoint: next.pathToPoint } })
    return
  }
  document.querySelector('#debug')?.remove()
  const manifest = buildManifestSchema.parse(data), mine = ++generation
  const previousState = player?.state().buildId === manifest.id ? player.state() : null
  for (const url of Object.values(assetUrls)) { const parsed = new URL(url, location.origin); if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Invalid asset URL') }
  player?.dispose(); player = null; buildId = manifest.id
  document.querySelector('#title')!.textContent = manifest.design.title
  document.querySelector('#objective')!.textContent = manifest.design.quest.objective
  const next = await createGamePlayer(canvas, manifest, { assetUrls, onUpdate: (state, target) => {
    if (mine !== generation) return
    status.textContent = state.complete ? manifest.design.quest.completionText : `${target ? `E · ${target} — ` : ''}${Object.values(state.items).reduce((a, b) => a + b, 0)} items · Stamina ${Math.round(state.stamina)}`
  }, onEvent: event => { notify('event', { event }); feedback.textContent = event.message }, onError: message => notify('error', { message }) })
  if (mine !== generation) { next.dispose(); return }
  player = next; if (previousState) player.restore(previousState); paused = false; canvas.focus(); notify('ready')
  // Read-only probe used by the isolated browser acceptance worker.
  if (new URLSearchParams(location.search).get('acceptance') === '1') Object.assign(window, { __gameAcceptance: { reports: runGameAcceptance(manifest), ready: true, engine: 'babylon', buildId, state: () => player?.state(), metrics: () => player?.metrics(), boundPlayer: Boolean(assetUrls[manifest.design.prefabs.find(p => p.role === 'player')?.assetRecipeKey ?? '']), pathTo: (role: string) => {
    const instance = manifest.design.level.instances.find(i => manifest.design.prefabs.find(p => p.key === i.prefabKey)?.role === role)
    return instance && player ? findWalkPath(manifest.design, next.state(), instance.position) : null
  } } })
}
window.addEventListener('message', event => {
  if (event.source !== parent || !parentOrigin || event.origin !== parentOrigin || event.data?.protocol !== 'graphcore.game.v1') return
  if (event.data.type === 'load') void loadBuild(event.data.manifest, event.data.assetUrls ?? {}).catch(error => { status.textContent = String(error); notify('error', { message: String(error) }) })
})
document.querySelector('#save')!.addEventListener('click', () => { if (player) { try { localStorage.setItem(`graphcore.game.save.${buildId}`, JSON.stringify(player.save())); status.textContent = 'Saved.' } catch { status.textContent = 'Saving is unavailable in this browser.' } } })
document.querySelector('#load')!.addEventListener('click', () => { try { const data = localStorage.getItem(`graphcore.game.save.${buildId}`); if (!data) throw new Error('No save for this build.'); player?.restore(JSON.parse(data)); status.textContent = 'Loaded.' } catch (error) { status.textContent = String(error) } })
document.querySelector('#restart')!.addEventListener('click', () => { player?.restart(); canvas.focus() })
document.querySelector('#pause')!.addEventListener('click', event => { paused = !paused; player?.pause(paused); (event.target as HTMLButtonElement).textContent = paused ? 'Resume' : 'Pause'; if (!paused) canvas.focus() })
window.addEventListener('beforeunload', () => player?.dispose())
notify('listening')
const releaseId = new URLSearchParams(location.search).get('release')
if (releaseId) {
  const endpoint = import.meta.env.VITE_GAME_RELEASE_URL
  if (!endpoint) status.textContent = 'Published game endpoint is not configured.'
  else void fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buildId: releaseId }) }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error ?? 'Release unavailable'); return data }).then(data => loadBuild(data.manifest, data.assetUrls)).catch(error => { status.textContent = String(error) })
}
// The worker serves its immutable candidate at this relative URL in acceptance mode.
if (!releaseId && new URLSearchParams(location.search).get('acceptance') === '1') {
  void fetch('/candidate.json').then(r => { if (!r.ok) throw new Error('Candidate unavailable'); return r.json() }).then(data => loadBuild(data.manifest, data.assetUrls)).catch(error => { status.textContent = String(error); Object.assign(window, { __gameAcceptance: { ready: false, error: String(error) } }) })
}
