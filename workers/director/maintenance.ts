import { type Client, rpc } from '../../supabase/functions/_shared/director-runtime/types.ts'
export async function maintainDirector(client: Client) {
  const report = await rpc<{ alerts: Array<{ jobId: string; reason: string }>; orphans: string[] }>(
    client,
    'director_maintenance',
    {},
  )
  for (const alert of report.alerts) {
    console.error(JSON.stringify({ event: 'director_reconciliation_overdue', ...alert }))
  }
  if (report.orphans.length) {
    const deleted = await client.storage.from('project-assets').remove(report.orphans)
    if (deleted.error) throw deleted.error
  }
  // A process killed during ffmpeg/download cannot run finally. Clean only old worker-owned dirs.
  const temp = Deno.env.get('TMPDIR') ?? '/tmp'
  for await (const entry of Deno.readDir(temp)) {
    if (!entry.isDirectory || !entry.name.startsWith('director-v2-')) continue
    const path = `${temp}/${entry.name}`, stat = await Deno.stat(path)
    if (stat.mtime && stat.mtime.getTime() < Date.now() - 86400000) await Deno.remove(path, { recursive: true })
  }
}
