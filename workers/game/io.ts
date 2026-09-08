export async function downloadBounded(url: string, maxBytes: number) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') throw new Error('Asset transport requires HTTPS')
  const hosts = (Deno.env.get('GAME_ASSET_HOSTS') ?? 'fal.media,fal.ai,supabase.co,openai.com').split(',').map(s => s.trim())
  if (!hosts.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`))) throw new Error('Asset host is not permitted')
  const response = await fetch(url, { signal: AbortSignal.timeout(90000), redirect: 'error' })
  if (!response.ok || !response.body) throw new Error(`Asset download failed (${response.status})`)
  if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('Asset exceeds download budget')
  const chunks: Uint8Array[] = []; let length = 0; const reader = response.body.getReader()
  try { while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > maxBytes) throw new Error('Asset exceeds download budget'); chunks.push(value) } }
  catch (error) { await reader.cancel(); throw error }
  const data = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length }
  return data
}
export async function bytesHash(bytes: Uint8Array) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(v => v.toString(16).padStart(2, '0')).join('')
}
export async function runTool(command: string, args: string[], timeoutMs: number) {
  const child = new Deno.Command(command, { args, clearEnv: true, env: { PATH: Deno.env.get('PATH') ?? '', HOME: '/tmp', PLAYWRIGHT_BROWSERS_PATH: Deno.env.get('PLAYWRIGHT_BROWSERS_PATH') ?? '/ms-playwright', SYSTEMROOT: Deno.env.get('SYSTEMROOT') ?? '' }, stdout: 'piped', stderr: 'piped' }).spawn()
  const timeout = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* already finished */ } }, timeoutMs)
  try {
    const result = await child.output()
    if (!result.success) throw new Error(new TextDecoder().decode(result.stderr).slice(-3000) || `${command} failed`)
    return new TextDecoder().decode(result.stdout)
  } finally { clearTimeout(timeout) }
}
