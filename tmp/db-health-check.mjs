import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const keys = JSON.parse(readFileSync('tmp/sb-keys.json', 'utf8').replace(/^﻿/, ''))
const serviceKey = keys.find((k) => k.name === 'service_role')?.api_key
const url = 'https://znwdatidqdkzidempvkt.supabase.co'
const c = createClient(url, serviceKey)

const out = {}

async function countBy(table, column, values, extra = (q) => q) {
  const result = {}
  for (const v of values) {
    const { count, error } = await extra(
      c.from(table).select('id', { count: 'exact', head: true }).eq(column, v)
    )
    result[v] = error ? `ERR ${error.message}` : count
  }
  return result
}

const statuses = ['queued', 'running', 'succeeded', 'failed', 'cancelled']
out.output_workflow_runs_by_status = await countBy('output_workflow_runs', 'status', statuses)

const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
{
  const { data, error } = await c
    .from('output_workflow_runs')
    .select('id,status,heartbeat_at,attempt_count,created_at')
    .eq('status', 'running')
    .lt('heartbeat_at', fiveMinAgo)
    .limit(20)
  out.stale_running_runs = error ? `ERR ${error.message}` : data
}

out.cinematic_run_jobs_by_status = await countBy('cinematic_run_jobs', 'status', [
  'queued', 'running', 'succeeded', 'failed', 'cancelled', 'skipped',
])

{
  const { data, error } = await c
    .from('cinematic_run_jobs')
    .select('error_message,created_at')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) out.failed_job_errors = `ERR ${error.message}`
  else {
    const tally = {}
    for (const row of data) {
      const key = (row.error_message || '(none)').slice(0, 140)
      tally[key] = (tally[key] || 0) + 1
    }
    out.failed_job_errors_top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 15)
  }
}

{
  const { data, error } = await c
    .from('cinematic_run_jobs')
    .select('provider_request_id')
    .not('provider_request_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(2000)
  if (error) out.dup_provider_ids = `ERR ${error.message}`
  else {
    const tally = {}
    for (const r of data) tally[r.provider_request_id] = (tally[r.provider_request_id] || 0) + 1
    out.dup_provider_ids = Object.entries(tally).filter(([, n]) => n > 1)
  }
}

{
  const { data, error } = await c
    .from('cinematic_runs')
    .select('id,status,error_message,created_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(15)
  out.recent_cinematic_runs = error ? `ERR ${error.message}` : data
}

{
  const { data, error } = await c
    .from('output_workflow_runs')
    .select('id,status,error_message,created_at,updated_at,attempt_count')
    .eq('id', '5cfdc90f-fc8e-4053-974e-8cfcb8408ca9')
  out.failed_run_today = error ? `ERR ${error.message}` : data
}

{
  const { data, error } = await c
    .from('output_workflow_run_steps')
    .select('node_key,status,error_message,started_at,finished_at')
    .eq('run_id', '5cfdc90f-fc8e-4053-974e-8cfcb8408ca9')
    .order('started_at', { ascending: true })
    .limit(60)
  out.failed_run_today_steps = error
    ? `ERR ${error.message}`
    : data.map((s) => ({ node: s.node_key, status: s.status, err: s.error_message?.slice(0, 200) }))
}

{
  const { data, error } = await c
    .from('output_requests')
    .select('id,output_kind,status,error_message,title,updated_at')
    .order('updated_at', { ascending: false })
    .limit(25)
  out.recent_output_requests = error
    ? `ERR ${error.message}`
    : data.map((r) => ({ kind: r.output_kind, status: r.status, title: r.title?.slice(0, 50), err: r.error_message?.slice(0, 120), at: r.updated_at }))
}

console.log(JSON.stringify(out, null, 2))
