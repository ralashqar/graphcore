import '@supabase/functions-js/edge-runtime.d.ts'

import { createClient } from 'npm:@supabase/supabase-js@2'

type SnapshotRequest = {
  snapshot: {
    workspace: { slug: string }
    project: { id: string; slug: string; name: string }
    draft: { id: string }
    definitions: unknown[]
    graphs: unknown[]
    assets: unknown[]
  }
  label?: string
  version?: string
}

Deno.serve(async (request) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const authHeader = request.headers.get('Authorization')

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !authHeader) {
      return Response.json({ error: 'Supabase environment is incomplete for publish-release.' }, { status: 500 })
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const payload = (await request.json()) as SnapshotRequest

    const bundle = {
      bundleVersion: 1,
      manifest: {
        workspaceSlug: payload.snapshot.workspace.slug,
        projectSlug: payload.snapshot.project.slug,
        draftId: payload.snapshot.draft.id,
        generatedAt: new Date().toISOString(),
        definitionCount: payload.snapshot.definitions.length,
        graphCount: payload.snapshot.graphs.length,
        assetCount: payload.snapshot.assets.length,
      },
      definitions: payload.snapshot.definitions,
      graphs: payload.snapshot.graphs,
      assets: payload.snapshot.assets,
      lookupIndices: {
        definitionsByKind: {},
        graphEntryNodes: {},
        assetKeysByKind: {},
      },
      diagnostics: [],
    }

    const {
      data: { user },
    } = await userClient.auth.getUser()

    if (!user) {
      return Response.json({ error: 'User context is required to publish a release.' }, { status: 401 })
    }

    const version = payload.version ?? `draft-${Date.now()}`
    const label = payload.label ?? `${payload.snapshot.project.name} release`
    const storagePath = `${payload.snapshot.project.id}/${version}.json`

    const releaseInsert = await adminClient
      .from('releases')
      .insert({
        project_id: payload.snapshot.project.id,
        draft_id: payload.snapshot.draft.id,
        version,
        label,
        manifest: bundle.manifest,
        bundle_json: bundle,
        diagnostics: bundle.diagnostics,
        storage_object_path: storagePath,
        created_by: user.id,
      })
      .select('id, version, label')
      .single()

    if (releaseInsert.error) {
      return Response.json({ error: releaseInsert.error.message }, { status: 400 })
    }

    await adminClient.storage
      .from('release-bundles')
      .upload(storagePath, new TextEncoder().encode(JSON.stringify(bundle, null, 2)), {
        upsert: true,
        contentType: 'application/json',
      })

    await adminClient.from('compile_jobs').insert({
      draft_id: payload.snapshot.draft.id,
      release_id: releaseInsert.data.id,
      trigger_source: 'publish-release',
      status: 'succeeded',
      bundle_manifest: bundle.manifest,
      diagnostics: bundle.diagnostics,
      created_by: user.id,
      finished_at: new Date().toISOString(),
    })

    return Response.json({
      bundle,
      release: releaseInsert.data,
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to publish release.' },
      { status: 500 },
    )
  }
})
