import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const keys = JSON.parse(readFileSync('tmp/sb-keys.json', 'utf8').replace(/^﻿/, ''))
const serviceKey = keys.find((k) => k.name === 'service_role')?.api_key
const c = createClient('https://znwdatidqdkzidempvkt.supabase.co', serviceKey)
const out = {}

{
  const { data } = await c.from('output_workflow_run_steps').select('*').limit(1)
  out.run_step_columns = data?.[0] ? Object.keys(data[0]) : 'none'
}

{
  const { data, error } = await c
    .from('output_workflow_run_steps')
    .select('node_key,status,error_message,attempt_count,updated_at')
    .eq('run_id', '5cfdc90f-fc8e-4053-974e-8cfcb8408ca9')
    .in('status', ['failed', 'running', 'queued'])
    .limit(40)
  out.failed_run_steps = error ? `ERR ${error.message}` : data?.map((s) => ({
    node: s.node_key, status: s.status, attempts: s.attempt_count,
    err: s.error_message?.slice(0, 400),
  }))
}

{
  const since = new Date(Date.now() - 5 * 86400_000).toISOString()
  const { data, error } = await c
    .from('output_workflow_run_steps')
    .select('node_key,error_message,updated_at')
    .eq('status', 'failed')
    .gte('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(300)
  if (error) out.recent_failed_steps = `ERR ${error.message}`
  else {
    const tally = {}
    for (const s of data) {
      const key = `${s.node_key} :: ${(s.error_message || '(none)').slice(0, 160)}`
      tally[key] = (tally[key] || 0) + 1
    }
    out.recent_failed_steps_top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 25)
  }
}

{
  const { data } = await c.from('output_workflow_runs').select('status').limit(1000)
  const tally = {}
  for (const r of data || []) tally[r.status] = (tally[r.status] || 0) + 1
  out.run_status_distribution_sample = tally
}

console.log(JSON.stringify(out, null, 2))
