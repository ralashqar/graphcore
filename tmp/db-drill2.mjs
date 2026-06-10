import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const keys = JSON.parse(readFileSync('tmp/sb-keys.json', 'utf8').replace(/^﻿/, ''))
const serviceKey = keys.find((k) => k.name === 'service_role')?.api_key
const c = createClient('https://znwdatidqdkzidempvkt.supabase.co', serviceKey)
const out = {}

{
  const { data, error } = await c
    .from('output_workflow_run_steps')
    .select('node_key,status,error_message,updated_at,started_at,completed_at')
    .eq('run_id', '5cfdc90f-fc8e-4053-974e-8cfcb8408ca9')
    .neq('status', 'completed')
    .order('order_index', { ascending: true })
    .limit(50)
  out.todays_failed_run_steps = error ? `ERR ${error.message}` : data?.map((s) => ({
    node: s.node_key, status: s.status, at: s.updated_at, err: s.error_message?.slice(0, 300),
  }))
}

{
  const { data, error } = await c
    .from('output_workflow_run_steps')
    .select('run_id,node_key,error_message,updated_at')
    .eq('status', 'failed')
    .ilike('error_message', '%not iterable%')
    .order('updated_at', { ascending: false })
    .limit(10)
  out.not_iterable_failures = error ? `ERR ${error.message}` : data
}

{
  const { data, error } = await c
    .from('output_workflow_run_steps')
    .select('run_id,node_key,error_message,updated_at')
    .eq('status', 'failed')
    .gte('updated_at', '2026-06-10T10:00:00Z')
    .order('updated_at', { ascending: false })
    .limit(30)
  out.failures_after_todays_deploy = error ? `ERR ${error.message}` : data?.map((s) => ({
    node: s.node_key, at: s.updated_at, err: s.error_message?.slice(0, 250),
  }))
}

console.log(JSON.stringify(out, null, 2))
