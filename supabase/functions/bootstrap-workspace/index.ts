import { z } from 'npm:zod@4'

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
