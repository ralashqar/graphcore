export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)

  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value)
  }

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  })
}

export function maybeHandleOptions(request: Request) {
  if (request.method !== 'OPTIONS') {
    return null
  }

  return new Response('ok', { headers: corsHeaders })
}

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function errorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof HttpError) {
    return json({ error: error.message }, { status: error.status })
  }

  return json(
    {
      error: error instanceof Error ? error.message : fallbackMessage,
    },
    { status: 500 },
  )
}
