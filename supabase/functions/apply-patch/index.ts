import '@supabase/functions-js/edge-runtime.d.ts'

import { createClient } from 'npm:@supabase/supabase-js@2'

type ApplyPatchPayload = {
  draftId: string
  operations: Array<Record<string, unknown>>
}

Deno.serve(async (request) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const authHeader = request.headers.get('Authorization')

    if (!supabaseUrl || !anonKey || !authHeader) {
      return Response.json({ error: 'Supabase environment is incomplete for apply-patch.' }, { status: 500 })
    }

    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
    } = await client.auth.getUser()

    if (!user) {
      return Response.json({ error: 'User context is required to apply a patch.' }, { status: 401 })
    }

    const payload = (await request.json()) as ApplyPatchPayload
    const results: Array<Record<string, unknown>> = []

    for (const operation of payload.operations) {
      if (operation.op === 'create_definition') {
        const insertResult = await client
          .from('project_definitions')
          .insert({
            draft_id: payload.draftId,
            key: operation.key,
            kind: operation.kind,
            name: (operation.payload as { name?: string } | undefined)?.name ?? String(operation.key),
            summary: (operation.payload as { summary?: string } | undefined)?.summary ?? '',
            created_by: user.id,
            updated_by: user.id,
          })
          .select('id, key')
          .single()

        if (insertResult.error) {
          return Response.json({ error: insertResult.error.message, operation }, { status: 400 })
        }

        results.push(insertResult.data)
      }

      if (operation.op === 'update_definition') {
        const updateResult = await client
          .from('project_definitions')
          .update({
            definition_data: operation.changes ?? {},
            updated_by: user.id,
          })
          .eq('draft_id', payload.draftId)
          .eq('key', operation.key)
          .select('id, key')
          .single()

        if (updateResult.error) {
          return Response.json({ error: updateResult.error.message, operation }, { status: 400 })
        }

        results.push(updateResult.data)
      }
    }

    return Response.json({
      ok: true,
      applied: results.length,
      results,
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to apply patch.' },
      { status: 500 },
    )
  }
})
