import { createClient } from 'npm:@supabase/supabase-js@2'
const url = Deno.env.get('SUPABASE_URL')
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !key) throw new Error('Missing Supabase env')
const c = createClient(url, key)
const { data, error } = await c
  .from('output_requests')
  .select('id,project_id,draft_id,workflow_id,latest_run_id,output_kind,status,title,error_message,created_at,updated_at')
  .order('updated_at', { ascending: false })
  .limit(20)
if (error) throw error
console.log(JSON.stringify(data, null, 2))
