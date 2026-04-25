import '@supabase/functions-js/edge-runtime.d.ts'

import { createAdminClient, requireUserClient } from '../../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../../_shared/http.ts'

type CheckoutSessionRequest = {
  packageId: string
  successUrl?: string
  cancelUrl?: string
}

type CreditPackageRow = {
  id: string
  name: string
  description: string | null
  credits: number
  price_cents: number
  is_active: boolean
}

type StripeErrorBody = {
  message?: string
}

type StripeCheckoutSessionBody = {
  id?: string
  url?: string
  error?: StripeErrorBody | null
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim()

  if (!value) {
    throw new Error(`${name} is not configured.`)
  }

  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseCheckoutSessionRequest(value: unknown): CheckoutSessionRequest {
  if (!isRecord(value)) {
    throw new HttpError(400, 'Request body must be a JSON object.')
  }

  const packageId = typeof value.packageId === 'string' ? value.packageId.trim() : ''
  const successUrl = typeof value.successUrl === 'string' ? value.successUrl.trim() : undefined
  const cancelUrl = typeof value.cancelUrl === 'string' ? value.cancelUrl.trim() : undefined

  if (!packageId) {
    throw new HttpError(400, 'packageId is required.')
  }

  return { packageId, successUrl, cancelUrl }
}

async function parseStripeCheckoutSessionBody(response: Response): Promise<StripeCheckoutSessionBody> {
  const raw = await response.json().catch(() => null)

  if (!isRecord(raw)) {
    return {}
  }

  const error = isRecord(raw.error)
    ? { message: typeof raw.error.message === 'string' ? raw.error.message : undefined }
    : null

  return {
    id: typeof raw.id === 'string' ? raw.id : undefined,
    url: typeof raw.url === 'string' ? raw.url : undefined,
    error,
  }
}

const stripeSecretKey = getRequiredEnv('STRIPE_SECRET_KEY')

Deno.serve(async (request: Request) => {
  const preflight = maybeHandleOptions(request)

  if (preflight) {
    return preflight
  }

  try {
    if (request.method !== 'POST') {
      throw new HttpError(405, 'Method not allowed.')
    }

    const payload = parseCheckoutSessionRequest(await request.json())
    const { user } = await requireUserClient(request, 'stripe/create-checkout-session')
    const supabase = createAdminClient('stripe/create-checkout-session')

    const { data, error: packageError } = await supabase
      .from('credit_packages')
      .select('id, name, description, credits, price_cents, is_active')
      .eq('id', payload.packageId)
      .eq('is_active', true)
      .maybeSingle()

    const creditPackage = data as CreditPackageRow | null

    if (packageError) {
      throw new HttpError(500, 'Failed to load credit package.')
    }

    if (!creditPackage) {
      throw new HttpError(404, 'Package not found.')
    }

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        mode: 'payment',
        'payment_method_types[]': 'card',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': creditPackage.name,
        'line_items[0][price_data][product_data][description]': creditPackage.description ?? `${creditPackage.credits} AI credits`,
        'line_items[0][price_data][unit_amount]': String(creditPackage.price_cents),
        'line_items[0][quantity]': '1',
        success_url: payload.successUrl || 'https://graphcore.ai/billing?success=true',
        cancel_url: payload.cancelUrl || 'https://graphcore.ai/billing?canceled=true',
        client_reference_id: user.id,
        'metadata[user_id]': user.id,
        'metadata[package_id]': creditPackage.id,
        'metadata[credits]': String(creditPackage.credits),
      }).toString(),
    })

    const stripeSession = await parseStripeCheckoutSessionBody(stripeResponse)

    if (!stripeResponse.ok || stripeSession.error || !stripeSession.id || !stripeSession.url) {
      throw new HttpError(
        stripeResponse.ok ? 400 : stripeResponse.status,
        stripeSession.error?.message ?? 'Unable to create Stripe checkout session.',
      )
    }

    const { error: purchaseError } = await supabase.from('credit_purchases').insert({
      user_id: user.id,
      package_id: creditPackage.id,
      stripe_checkout_session_id: stripeSession.id,
      credits: creditPackage.credits,
      amount_cents: creditPackage.price_cents,
      status: 'pending',
    })

    if (purchaseError) {
      throw new HttpError(500, 'Failed to create the pending credit purchase.')
    }

    return json({
      url: stripeSession.url,
      sessionId: stripeSession.id,
    })
  } catch (error) {
    return errorResponse(error, 'Failed to create the checkout session.')
  }
})
