import {
  appProfile,
  waitlistFunctionName,
  waitlistSupabasePublishableKey,
  waitlistSupabaseUrl,
} from '../../config/appProfile'

export type WaitlistSubmission = {
  email: string
  name?: string
  role?: string
  useCase?: string
  referralSource?: string
  honeypot?: string
  turnstileToken?: string
}

export type WaitlistSubmissionResult = {
  ok: true
  status: 'joined' | 'existing'
}

export function waitlistIsConfigured() {
  return Boolean(waitlistSupabaseUrl && waitlistSupabasePublishableKey && waitlistFunctionName)
}

function waitlistFunctionUrl() {
  const baseUrl = waitlistSupabaseUrl.replace(/\/+$/g, '')
  return `${baseUrl}/functions/v1/${encodeURIComponent(waitlistFunctionName)}`
}

function readWaitlistError(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const error = (payload as { error?: unknown }).error
    if (typeof error === 'string' && error.trim()) return error
  }
  return fallback
}

export async function submitWaitlistSignup(input: WaitlistSubmission): Promise<WaitlistSubmissionResult> {
  if (!waitlistIsConfigured()) {
    throw new Error('Waitlist is not configured for this build.')
  }

  const response = await fetch(waitlistFunctionUrl(), {
    method: 'POST',
    headers: {
      apikey: waitlistSupabasePublishableKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      name: input.name,
      role: input.role,
      useCase: input.useCase,
      referralSource: input.referralSource,
      honeypot: input.honeypot,
      turnstileToken: input.turnstileToken,
      appProfile,
      pageUrl: window.location.href,
      metadata: {
        source: 'landing_page',
        path: window.location.pathname,
      },
    }),
  })

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new Error(readWaitlistError(payload, 'Unable to join the waitlist right now.'))
  }

  if (!payload || typeof payload !== 'object' || (payload as { ok?: unknown }).ok !== true) {
    throw new Error('Unexpected waitlist response.')
  }

  const status = (payload as { status?: unknown }).status
  return {
    ok: true,
    status: status === 'existing' ? 'existing' : 'joined',
  }
}
