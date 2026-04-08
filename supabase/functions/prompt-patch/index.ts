import '@supabase/functions-js/edge-runtime.d.ts'

import { createClient } from 'npm:@supabase/supabase-js@2'

type PromptPayload = {
  prompt: string
  snapshot?: {
    draft?: { id: string }
  }
}

Deno.serve(async (request) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const authHeader = request.headers.get('Authorization')

    if (!supabaseUrl || !anonKey || !authHeader) {
      return Response.json({ error: 'Supabase environment is incomplete for prompt-patch.' }, { status: 500 })
    }

    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
    } = await client.auth.getUser()

    if (!user) {
      return Response.json({ error: 'User context is required to create a patch.' }, { status: 401 })
    }

    const payload = (await request.json()) as PromptPayload
    const slug = payload.prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || 'generated'

    const operations = [
      {
        op: 'create_definition',
        kind: payload.prompt.toLowerCase().includes('quest') ? 'quest' : 'market',
        key: `generated.${slug}`,
        payload: {
          name: slug.replace(/_/g, ' '),
          summary: `Generated proposal from prompt: ${payload.prompt}`,
        },
      },
    ]

    if (payload.snapshot?.draft?.id) {
      await client.from('patch_sets').insert({
        draft_id: payload.snapshot.draft.id,
        prompt: payload.prompt,
        summary: `Generated patch proposal for "${slug}"`,
        status: 'proposed',
        operations,
        diagnostics: ['Review before apply.'],
        created_by: user.id,
      })
    }

    return Response.json({
      summary: `Generated patch proposal for "${slug}"`,
      operations,
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to generate patch.' },
      { status: 500 },
    )
  }
})
