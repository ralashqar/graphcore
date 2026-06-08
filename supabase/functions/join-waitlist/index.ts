import { z } from 'npm:zod@4'

import { createAdminClient } from '../_shared/auth.ts'
import { HttpError } from '../_shared/http.ts'

const DEFAULT_ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type'
const DEFAULT_ALLOWED_METHODS = 'POST, OPTIONS'
const IP_LIMIT_WINDOW_MINUTES = 10
const IP_LIMIT_MAX_SUBMISSIONS = 5
const EMAIL_LIMIT_WINDOW_MINUTES = 60
const EMAIL_LIMIT_MAX_SUBMISSIONS = 3
const RESEND_EMAIL_ENDPOINT = 'https://api.resend.com/emails'
const WAITLIST_CONFIRMATION_SUBJECT = "You're on the SynArc early access list"

const waitlistRequestSchema = z.object({
  email: z.string().trim().email().max(320),
  name: z.string().trim().max(120).optional().nullable(),
  role: z.string().trim().max(120).optional().nullable(),
  useCase: z.string().trim().max(1000).optional().nullable(),
  referralSource: z.string().trim().max(240).optional().nullable(),
  pageUrl: z.string().trim().max(1000).optional().nullable(),
  appProfile: z.string().trim().max(40).optional().nullable(),
  honeypot: z.string().trim().max(200).optional().nullable(),
  turnstileToken: z.string().trim().max(4096).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

type WaitlistRequest = z.infer<typeof waitlistRequestSchema>

function parseAllowedOrigins() {
  return (Deno.env.get('WAITLIST_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function originIsAllowed(origin: string | null) {
  if (!origin) return true

  const allowedOrigins = parseAllowedOrigins()
  if (allowedOrigins.length === 0) return true
  if (allowedOrigins.includes(origin)) return true
  return false
}

function corsHeadersFor(request: Request) {
  const origin = request.headers.get('Origin')
  const allowedOrigins = parseAllowedOrigins()
  const allowOrigin = allowedOrigins.length > 0 && origin && allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins.length > 0
      ? 'null'
      : '*'

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': DEFAULT_ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': DEFAULT_ALLOWED_METHODS,
    'Vary': 'Origin',
  }
}

function waitlistJson(request: Request, data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  for (const [key, value] of Object.entries(corsHeadersFor(request))) {
    headers.set(key, value)
  }
  headers.set('Content-Type', 'application/json')

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  })
}

function waitlistErrorResponse(request: Request, error: unknown) {
  console.error('[join-waitlist]', error)

  if (error instanceof HttpError) {
    return waitlistJson(request, { ok: false, error: publicErrorMessage(error.status) }, { status: error.status })
  }

  if (error instanceof Error && error.name === 'ZodError') {
    return waitlistJson(request, { ok: false, error: 'Please enter a valid email address.' }, { status: 400 })
  }

  return waitlistJson(request, { ok: false, error: 'Unable to join the waitlist right now.' }, { status: 500 })
}

function publicErrorMessage(status: number) {
  if (status === 400) return 'Please check the waitlist form and try again.'
  if (status === 403) return 'This request is not allowed.'
  if (status === 405) return 'Method not allowed.'
  if (status === 429) return 'Too many waitlist attempts. Try again later.'
  return 'Unable to join the waitlist right now.'
}

function optionalString(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  return normalized || null
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function envFlagEnabled(name: string) {
  const value = Deno.env.get(name)?.trim().toLowerCase()
  return value === 'true' || value === '1' || value === 'yes'
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function waitlistConfirmationText() {
  return [
    'Thanks for requesting early access to SynArc.',
    '',
    'SynArc helps filmmakers, storytellers and worldbuilders build a living world with prompts, then generate cinematics, comics, scenes and more from the same canon, with continuity already handled.',
    '',
    "We'll review early access requests and follow up when we're ready to bring you in.",
    '',
    '- SynArc',
  ].join('\n')
}

function waitlistConfirmationHtml(input: { name?: string | null }) {
  const greetingName = optionalString(input.name)
  const greeting = greetingName
    ? `Thanks for requesting early access to SynArc, ${escapeHtml(greetingName)}.`
    : 'Thanks for requesting early access to SynArc.'

  return [
    '<!doctype html>',
    '<html>',
    '<body style="margin:0;background:#050c18;color:#f8fbff;font-family:Inter,Arial,sans-serif;">',
    '<main style="max-width:640px;margin:0 auto;padding:36px 24px;">',
    '<p style="margin:0 0 18px;color:#7ee7ff;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">SynArc early access</p>',
    '<h1 style="margin:0 0 18px;font-size:28px;line-height:1.12;">You are on the SynArc early access list.</h1>',
    `<p style="margin:0 0 18px;color:#d7e5f8;font-size:16px;line-height:1.55;">${greeting}</p>`,
    '<p style="margin:0 0 18px;color:#d7e5f8;font-size:16px;line-height:1.55;">SynArc helps filmmakers, storytellers and worldbuilders build a living world with prompts, then generate cinematics, comics, scenes and more from the same canon, with continuity already handled.</p>',
    '<p style="margin:0;color:#d7e5f8;font-size:16px;line-height:1.55;">We will review early access requests and follow up when we are ready to bring you in.</p>',
    '<p style="margin:28px 0 0;color:#97aedc;font-size:14px;">- SynArc</p>',
    '</main>',
    '</body>',
    '</html>',
  ].join('')
}

async function sendWaitlistConfirmationEmail(input: {
  email: string
  name?: string | null
}) {
  if (!envFlagEnabled('WAITLIST_CONFIRMATION_ENABLED')) return

  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim()
  const from = Deno.env.get('WAITLIST_CONFIRMATION_FROM')?.trim()
  const replyTo = Deno.env.get('WAITLIST_REPLY_TO')?.trim()
  if (!apiKey || !from) {
    console.warn('[join-waitlist] waitlist confirmation email skipped because Resend is not configured')
    return
  }

  const response = await fetch(RESEND_EMAIL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: input.email,
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: WAITLIST_CONFIRMATION_SUBJECT,
      text: waitlistConfirmationText(),
      html: waitlistConfirmationHtml({ name: input.name }),
    }),
  })

  if (!response.ok) {
    const diagnostic = await response.text().catch(() => '')
    throw new Error(`Resend returned ${response.status}${diagnostic ? `: ${diagnostic.slice(0, 500)}` : ''}`)
  }
}

function requestMetadata(request: Request, payload: WaitlistRequest) {
  const userAgent = request.headers.get('User-Agent')
  const forwardedFor = request.headers.get('X-Forwarded-For')
  const origin = request.headers.get('Origin')
  const referer = request.headers.get('Referer')

  return {
    ...(payload.metadata ?? {}),
    origin,
    referer,
    userAgent,
    forwardedFor,
    submittedAt: new Date().toISOString(),
  }
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('X-Forwarded-For')
  const firstForwarded = forwardedFor?.split(',')[0]?.trim()
  return firstForwarded
    || request.headers.get('CF-Connecting-IP')?.trim()
    || request.headers.get('X-Real-IP')?.trim()
    || 'unknown'
}

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function hashedIdentity(request: Request, normalizedEmail?: string) {
  const salt = Deno.env.get('WAITLIST_RATE_LIMIT_SALT') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'waitlist'
  const ip = getClientIp(request)
  const userAgent = request.headers.get('User-Agent') ?? 'unknown'
  return {
    ipHash: await sha256Hex(`${salt}:ip:${ip}`),
    userAgentHash: await sha256Hex(`${salt}:ua:${userAgent}`),
    emailHash: normalizedEmail ? await sha256Hex(`${salt}:email:${normalizedEmail}`) : null,
  }
}

async function logSubmissionEvent(input: {
  admin: ReturnType<typeof createAdminClient>
  request: Request
  payload?: Partial<WaitlistRequest>
  normalizedEmail?: string | null
  ipHash?: string | null
  userAgentHash?: string | null
  decision: 'allowed' | 'blocked' | 'rate_limited' | 'invalid' | 'turnstile_failed'
  reason?: string | null
  metadata?: Record<string, unknown>
}) {
  const response = await input.admin.from('waitlist_submission_events').insert({
    normalized_email: input.normalizedEmail ?? null,
    ip_hash: input.ipHash ?? null,
    user_agent_hash: input.userAgentHash ?? null,
    origin: input.request.headers.get('Origin'),
    decision: input.decision,
    reason: input.reason ?? null,
    metadata: {
      appProfile: input.payload?.appProfile ?? null,
      pageUrl: input.payload?.pageUrl ?? null,
      ...input.metadata,
    },
  })

  if (response.error) {
    console.error('[join-waitlist] failed to log submission event', response.error)
  }
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString()
}

async function countRecentEvents(input: {
  admin: ReturnType<typeof createAdminClient>
  column: 'ip_hash' | 'normalized_email'
  value: string
  since: string
}) {
  const response = await input.admin
    .from('waitlist_submission_events')
    .select('id', { count: 'exact', head: true })
    .eq(input.column, input.value)
    .gte('created_at', input.since)

  if (response.error) throw new Error(response.error.message)
  return response.count ?? 0
}

async function enforceRateLimits(input: {
  admin: ReturnType<typeof createAdminClient>
  request: Request
  payload: WaitlistRequest
  normalizedEmail: string
  ipHash: string
  userAgentHash: string
}) {
  const ipCount = await countRecentEvents({
    admin: input.admin,
    column: 'ip_hash',
    value: input.ipHash,
    since: minutesAgo(IP_LIMIT_WINDOW_MINUTES),
  })

  if (ipCount >= IP_LIMIT_MAX_SUBMISSIONS) {
    await logSubmissionEvent({
      admin: input.admin,
      request: input.request,
      payload: input.payload,
      normalizedEmail: input.normalizedEmail,
      ipHash: input.ipHash,
      userAgentHash: input.userAgentHash,
      decision: 'rate_limited',
      reason: 'ip_rate_limit',
      metadata: { ipCount },
    })
    throw new HttpError(429, 'Too many waitlist attempts.')
  }

  const emailCount = await countRecentEvents({
    admin: input.admin,
    column: 'normalized_email',
    value: input.normalizedEmail,
    since: minutesAgo(EMAIL_LIMIT_WINDOW_MINUTES),
  })

  if (emailCount >= EMAIL_LIMIT_MAX_SUBMISSIONS) {
    await logSubmissionEvent({
      admin: input.admin,
      request: input.request,
      payload: input.payload,
      normalizedEmail: input.normalizedEmail,
      ipHash: input.ipHash,
      userAgentHash: input.userAgentHash,
      decision: 'rate_limited',
      reason: 'email_rate_limit',
      metadata: { emailCount },
    })
    throw new HttpError(429, 'Too many waitlist attempts.')
  }
}

async function verifyTurnstileToken(request: Request, token: string | null | undefined) {
  const secret = Deno.env.get('WAITLIST_TURNSTILE_SECRET_KEY')?.trim()
  if (!secret) return
  if (!token) throw new HttpError(400, 'Turnstile verification is required.')

  const formData = new FormData()
  formData.set('secret', secret)
  formData.set('response', token)
  const clientIp = getClientIp(request)
  if (clientIp !== 'unknown') formData.set('remoteip', clientIp)

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
  })
  const payload = await response.json().catch(() => null) as { success?: unknown } | null
  if (!response.ok || payload?.success !== true) {
    throw new HttpError(400, 'Turnstile verification failed.')
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(request) })
  }

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    if (!originIsAllowed(request.headers.get('Origin'))) throw new HttpError(403, 'Origin is not allowed.')

    const admin = createAdminClient('join-waitlist')
    let rawPayload: unknown
    try {
      rawPayload = await request.json()
    } catch {
      const identity = await hashedIdentity(request)
      await logSubmissionEvent({
        admin,
        request,
        ipHash: identity.ipHash,
        userAgentHash: identity.userAgentHash,
        decision: 'invalid',
        reason: 'invalid_json',
      })
      throw new HttpError(400, 'Invalid request payload.')
    }

    const parsedPayload = waitlistRequestSchema.safeParse(rawPayload)
    if (!parsedPayload.success) {
      const identity = await hashedIdentity(request)
      await logSubmissionEvent({
        admin,
        request,
        ipHash: identity.ipHash,
        userAgentHash: identity.userAgentHash,
        decision: 'invalid',
        reason: 'schema_validation',
        metadata: { issues: parsedPayload.error.issues.map((issue) => issue.path.join('.')).slice(0, 8) },
      })
      throw new HttpError(400, 'Invalid request payload.')
    }

    const payload = parsedPayload.data
    const normalizedEmail = normalizeEmail(payload.email)
    const identity = await hashedIdentity(request, normalizedEmail)

    if (payload.honeypot) {
      await logSubmissionEvent({
        admin,
        request,
        payload,
        normalizedEmail,
        ipHash: identity.ipHash,
        userAgentHash: identity.userAgentHash,
        decision: 'blocked',
        reason: 'honeypot',
        metadata: { emailHash: identity.emailHash },
      })
      return waitlistJson(request, { ok: true, status: 'joined' })
    }

    try {
      await verifyTurnstileToken(request, payload.turnstileToken)
    } catch (error) {
      await logSubmissionEvent({
        admin,
        request,
        payload,
        normalizedEmail,
        ipHash: identity.ipHash,
        userAgentHash: identity.userAgentHash,
        decision: 'turnstile_failed',
        reason: error instanceof Error ? error.message : 'turnstile_failed',
        metadata: { emailHash: identity.emailHash },
      })
      throw error
    }

    await enforceRateLimits({
      admin,
      request,
      payload,
      normalizedEmail,
      ipHash: identity.ipHash,
      userAgentHash: identity.userAgentHash,
    })

    const submittedAt = new Date().toISOString()
    const row = {
      email: payload.email.trim(),
      normalized_email: normalizedEmail,
      name: optionalString(payload.name),
      role: optionalString(payload.role),
      use_case: optionalString(payload.useCase),
      referral_source: optionalString(payload.referralSource),
      page_url: optionalString(payload.pageUrl),
      app_profile: optionalString(payload.appProfile) ?? 'landing',
      metadata: requestMetadata(request, payload),
      status: 'joined',
      last_submitted_at: submittedAt,
    }

    const insertResponse = await admin
      .from('waitlist_signups')
      .insert(row)
      .select('id')
      .maybeSingle()

    if (!insertResponse.error) {
      await logSubmissionEvent({
        admin,
        request,
        payload,
        normalizedEmail,
        ipHash: identity.ipHash,
        userAgentHash: identity.userAgentHash,
        decision: 'allowed',
        reason: 'joined',
        metadata: { emailHash: identity.emailHash },
      })
      try {
        await sendWaitlistConfirmationEmail({
          email: payload.email.trim(),
          name: optionalString(payload.name),
        })
      } catch (error) {
        console.error('[join-waitlist] confirmation email failed', error)
      }
      return waitlistJson(request, { ok: true, status: 'joined' })
    }

    if (insertResponse.error.code !== '23505') {
      throw new Error(insertResponse.error.message)
    }

    const existingResponse = await admin
      .from('waitlist_signups')
      .select('submission_count, metadata')
      .eq('normalized_email', normalizedEmail)
      .maybeSingle()

    if (existingResponse.error) throw new Error(existingResponse.error.message)

    const existingSubmissionCount = typeof existingResponse.data?.submission_count === 'number'
      ? existingResponse.data.submission_count
      : 1
    const existingMetadata = existingResponse.data?.metadata
      && typeof existingResponse.data.metadata === 'object'
      && !Array.isArray(existingResponse.data.metadata)
      ? existingResponse.data.metadata as Record<string, unknown>
      : {}

    const updateResponse = await admin
      .from('waitlist_signups')
      .update({
        ...row,
        metadata: {
          ...existingMetadata,
          lastDuplicateSubmission: requestMetadata(request, payload),
        },
        status: 'existing',
        submission_count: existingSubmissionCount + 1,
      })
      .eq('normalized_email', normalizedEmail)

    if (updateResponse.error) throw new Error(updateResponse.error.message)

    await logSubmissionEvent({
      admin,
      request,
      payload,
      normalizedEmail,
      ipHash: identity.ipHash,
      userAgentHash: identity.userAgentHash,
      decision: 'allowed',
      reason: 'existing',
      metadata: { emailHash: identity.emailHash },
    })

    return waitlistJson(request, { ok: true, status: 'existing' })
  } catch (error) {
    return waitlistErrorResponse(request, error)
  }
})
