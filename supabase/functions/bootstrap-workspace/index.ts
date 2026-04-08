import { z } from 'npm:zod@4'

import { BASELINE_ARCHETYPES } from '../../../src/domain/bootstrapSeeds.ts'
import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

const requestSchema = z.object({
  workspaceName: z.string().trim().min(1).max(120).optional(),
  projectName: z.string().trim().min(1).max(120).optional(),
})

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function titleCase(value: string) {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function isMissingAbilityEnumError(message: string | undefined) {
  return typeof message === 'string' && message.includes('invalid input value for enum definition_kind: "ability"')
}

function isMissingDefinitionKindEnumError(message: string | undefined, kind: string) {
  return typeof message === 'string' && message.includes(`invalid input value for enum definition_kind: "${kind}"`)
}

function filterSupportedArchetypeSeedsForEnumError<TSeed extends { appliesToKind: string }>(
  seeds: TSeed[],
  message: string | undefined,
) {
  return seeds.filter((seed) => {
    if (isMissingAbilityEnumError(message) && seed.appliesToKind === 'ability') return false
    if (isMissingDefinitionKindEnumError(message, 'environment') && seed.appliesToKind === 'environment') return false
    if (isMissingDefinitionKindEnumError(message, 'world_model') && seed.appliesToKind === 'world_model') return false
    return true
  })
}

async function seedBaselineArchetypes(admin: ReturnType<typeof createAdminClient>, draftId: string, userId: string) {
  const existingArchetypesResponse = await admin
    .from('project_archetypes')
    .select('id, key')
    .eq('draft_id', draftId)

  if (existingArchetypesResponse.error) {
    throw new HttpError(500, existingArchetypesResponse.error.message)
  }

  const existingByKey = new Map((existingArchetypesResponse.data ?? []).map((row) => [row.key, row.id]))
  const missingSeeds = BASELINE_ARCHETYPES.filter((seed) => !existingByKey.has(seed.key))

  if (missingSeeds.length > 0) {
    const seedRows = (seeds: typeof missingSeeds) =>
      seeds.map((seed) => ({
        draft_id: draftId,
        key: seed.key,
        name: seed.name,
        summary: seed.summary,
        definition_kind: seed.appliesToKind,
        icon_asset_key: seed.iconAssetKey,
        metadata: seed.metadata,
        llm_hints: seed.llmHints,
        created_by: userId,
      }))

    const insertResponse = await admin
      .from('project_archetypes')
      .insert(seedRows(missingSeeds))
      .select('id, key')

    const recoveredSeeds = insertResponse.error
      ? filterSupportedArchetypeSeedsForEnumError(missingSeeds, insertResponse.error.message)
      : missingSeeds

    const recoveredResponse = insertResponse.error && recoveredSeeds.length !== missingSeeds.length
      ? await admin
          .from('project_archetypes')
          .insert(seedRows(recoveredSeeds))
          .select('id, key')
      : insertResponse

    if (recoveredResponse.error) {
      throw new HttpError(500, recoveredResponse.error.message)
    }

    for (const row of recoveredResponse.data ?? []) {
      existingByKey.set(row.key, row.id)
    }
  }

  const archetypeIds = [...existingByKey.values()]
  if (archetypeIds.length === 0) {
    return
  }

  const existingFieldsResponse = await admin
    .from('project_archetype_fields')
    .select('archetype_id, key')
    .eq('draft_id', draftId)
    .not('archetype_id', 'is', null)
    .in('archetype_id', archetypeIds)

  if (existingFieldsResponse.error) {
    throw new HttpError(500, existingFieldsResponse.error.message)
  }

  const existingFieldKeys = new Set((existingFieldsResponse.data ?? []).map((row) => `${row.archetype_id}:${row.key}`))
  const fieldRows = BASELINE_ARCHETYPES.flatMap((seed) => {
    const archetypeId = existingByKey.get(seed.key)
    if (!archetypeId) {
      return []
    }

    return seed.fields
      .filter((field) => !existingFieldKeys.has(`${archetypeId}:${field.key}`))
      .map((field) => ({
        draft_id: draftId,
        archetype_id: archetypeId,
        key: field.key,
        label: field.label,
        field_type: field.fieldType,
        description: field.description,
        required: field.required,
        default_value: field.defaultValue,
        constraints: field.constraints,
        sort_order: field.sortOrder,
      }))
  })

  if (fieldRows.length === 0) {
    return
  }

  const insertFieldsResponse = await admin
    .from('project_archetype_fields')
    .insert(fieldRows)

  if (insertFieldsResponse.error) {
    throw new HttpError(500, insertFieldsResponse.error.message)
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') {
      throw new HttpError(405, 'Method not allowed.')
    }

    const { user } = await requireUserClient(request, 'bootstrap-workspace')
    const admin = createAdminClient('bootstrap-workspace')
    const payload = requestSchema.parse(await request.json().catch(() => ({})))

    const emailSeed = user.email?.split('@')[0] ?? 'graphcore'
    const baseSeed = slugify(emailSeed) || 'graphcore'
    const timestampSeed = Date.now().toString(36)
    const workspaceName = payload.workspaceName ?? `${titleCase(baseSeed)} Workspace`
    const projectName = payload.projectName ?? `${titleCase(baseSeed)} Project`

    const membershipResponse = await admin
      .from('workspace_memberships')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (membershipResponse.error) {
      throw new HttpError(500, membershipResponse.error.message)
    }

    let workspaceId = membershipResponse.data?.workspace_id ?? null
    let projectId: string | null = null
    let draftId: string | null = null
    let createdWorkspace = false
    let createdProject = false
    let createdDraft = false

    if (!workspaceId) {
      const workspaceResponse = await admin
        .from('workspaces')
        .insert({
          name: workspaceName,
          slug: `${baseSeed}-${timestampSeed}`,
          summary: 'Live GraphCore workspace bootstrapped from the editor.',
          created_by: user.id,
          metadata: {
            bootstrapSource: 'edge_function',
            bootstrapVersion: 2,
          },
        })
        .select('id')
        .single()

      if (workspaceResponse.error || !workspaceResponse.data) {
        throw new HttpError(500, workspaceResponse.error?.message ?? 'Workspace creation failed.')
      }

      workspaceId = workspaceResponse.data.id
      createdWorkspace = true

      const membershipInsert = await admin
        .from('workspace_memberships')
        .upsert(
          {
            workspace_id: workspaceId,
            user_id: user.id,
            role: 'owner',
          },
          { onConflict: 'workspace_id,user_id' },
        )

      if (membershipInsert.error) {
        throw new HttpError(500, membershipInsert.error.message)
      }
    }

    const projectResponse = await admin
      .from('projects')
      .select('id')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (projectResponse.error) {
      throw new HttpError(500, projectResponse.error.message)
    }

    projectId = projectResponse.data?.id ?? null

    if (!projectId) {
      const createdProjectResponse = await admin
        .from('projects')
        .insert({
          workspace_id: workspaceId,
          name: projectName,
          slug: `project-${timestampSeed}`,
          summary: 'Primary GraphCore project created automatically for promptable authoring.',
          visibility: 'private',
          created_by: user.id,
          metadata: {
            bootstrapSource: 'edge_function',
            bootstrapVersion: 2,
          },
        })
        .select('id')
        .single()

      if (createdProjectResponse.error || !createdProjectResponse.data) {
        throw new HttpError(500, createdProjectResponse.error?.message ?? 'Project creation failed.')
      }

      projectId = createdProjectResponse.data.id
      createdProject = true
    }

    const draftResponse = await admin
      .from('project_drafts')
      .select('id')
      .eq('project_id', projectId)
      .order('is_primary', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (draftResponse.error) {
      throw new HttpError(500, draftResponse.error.message)
    }

    draftId = draftResponse.data?.id ?? null

    if (!draftId) {
      const createdDraftResponse = await admin
        .from('project_drafts')
        .insert({
          project_id: projectId,
          name: 'Main Draft',
          version: 1,
          is_primary: true,
          created_by: user.id,
          metadata: {
            bootstrapSource: 'edge_function',
            bootstrapVersion: 2,
          },
        })
        .select('id')
        .single()

      if (createdDraftResponse.error || !createdDraftResponse.data) {
        throw new HttpError(500, createdDraftResponse.error?.message ?? 'Draft creation failed.')
      }

      draftId = createdDraftResponse.data.id
      createdDraft = true
    }

    await seedBaselineArchetypes(admin, draftId, user.id)

    return json({
      workspaceId,
      projectId,
      draftId,
      createdWorkspace,
      createdProject,
      createdDraft,
    })
  } catch (error) {
    return errorResponse(error, 'Failed to bootstrap live GraphCore workspace.')
  }
})
