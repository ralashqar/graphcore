import '@supabase/functions-js/edge-runtime.d.ts'

import { createAdminClient, requireUserClient } from '../../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../../_shared/http.ts'

const PLANS = {
  starter: { name: 'Starter', priceCents: 999, creditsPerMonth: 1000 },
  pro: { name: 'Pro', priceCents: 2999, creditsPerMonth: 5000 },
  enterprise: { name: 'Enterprise', priceCents: 9999, creditsPerMonth: 20000 },
} as const

type PlanKey = keyof typeof PLANS

type CreateSubscriptionRequest = {
  plan: PlanKey
  successUrl?: string
  cancelUrl?: string
}

type SubscriptionRow = {
  stripe_customer_id: string | null
}

type StripeCustomerBody = {
  id?: string
  error?: { message?: string } | null
}

type StripeCheckoutSessionBody = {
  id?: string
  url?: string
  error?: { message?: string } | null
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

function parseCreateSubscriptionRequest(value: unknown): CreateSubscriptionRequest {
  if (!isRecord(value)) {
    throw new HttpError(400, 'Request body must be a JSON object.')
  }

  const rawPlan = typeof value.plan === 'string' ? value.plan.trim() : ''
  const successUrl = typeof value.successUrl === 'string' ? value.successUrl.trim() : undefined
  const cancelUrl = typeof value.cancelUrl === 'string' ? value.cancelUrl.trim() : undefined

  if (!(rawPlan in PLANS)) {
    throw new HttpError(400, 'Valid plan is required (starter, pro, enterprise).')
  }

  return {
    plan: rawPlan as PlanKey,
    successUrl,
    cancelUrl,
  }
}

async function parseStripeCustomerBody(response: Response): Promise<StripeCustomerBody> {
  const raw = await response.json().catch(() => null)

  if (!isRecord(raw)) {
    return {}
  }

  return {
    id: typeof raw.id === 'string' ? raw.id : undefined,
    error: isRecord(raw.error)
      ? { message: typeof raw.error.message === 'string' ? raw.error.message : undefined }
      : null,
  }
}

async function parseStripeCheckoutSessionBody(response: Response): Promise<StripeCheckoutSessionBody> {
  const raw = await response.json().catch(() => null)

  if (!isRecord(raw)) {
    return {}
  }

  return {
    id: typeof raw.id === 'string' ? raw.id : undefined,
    url: typeof raw.url === 'string' ? raw.url : undefined,
    error: isRecord(raw.error)
      ? { message: typeof raw.error.message === 'string' ? raw.error.message : undefined }
      : null,
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

    const payload = parseCreateSubscriptionRequest(await request.json())
    const { user } = await requireUserClient(request, 'stripe/create-subscription')
    const supabase = createAdminClient('stripe/create-subscription')

    const { data, error: subscriptionLookupError } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const existingSubscription = data as SubscriptionRow | null

    if (subscriptionLookupError) {
      throw new HttpError(500, 'Failed to load the current subscription.')
    }

    let customerId = existingSubscription?.stripe_customer_id ?? null

    if (!customerId) {
      const customerResponse = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          'metadata[user_id]': user.id,
          email: user.email ?? '',
        }).toString(),
      })

      const customer = await parseStripeCustomerBody(customerResponse)

      if (!customerResponse.ok || customer.error || !customer.id) {
        throw new HttpError(
          customerResponse.ok ? 400 : customerResponse.status,
          customer.error?.message ?? 'Unable to create Stripe customer.',
        )
      }

      customerId = customer.id
    }

    if (!customerId) {
      throw new HttpError(500, 'Stripe customer creation did not return an id.')
    }

    const selectedPlan = PLANS[payload.plan]

    const checkoutResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        mode: 'subscription',
        'payment_method_types[]': 'card',
        customer: customerId,
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': `${selectedPlan.name} - GraphCore Monthly`,
        'line_items[0][price_data][product_data][description]': `${selectedPlan.creditsPerMonth} AI credits every month`,
        'line_items[0][price_data][unit_amount]': String(selectedPlan.priceCents),
        'line_items[0][price_data][recurring][interval]': 'month',
        'line_items[0][quantity]': '1',
        success_url: payload.successUrl || 'https://graphcore.ai/billing?success=true',
        cancel_url: payload.cancelUrl || 'https://graphcore.ai/billing?canceled=true',
        client_reference_id: user.id,
        'metadata[user_id]': user.id,
        'metadata[plan]': payload.plan,
        'subscription_data[metadata][user_id]': user.id,
        'subscription_data[metadata][plan]': payload.plan,
        'subscription_data[metadata][credits_per_month]': String(selectedPlan.creditsPerMonth),
      }).toString(),
    })

    const checkoutSession = await parseStripeCheckoutSessionBody(checkoutResponse)

    if (!checkoutResponse.ok || checkoutSession.error || !checkoutSession.id || !checkoutSession.url) {
      throw new HttpError(
        checkoutResponse.ok ? 400 : checkoutResponse.status,
        checkoutSession.error?.message ?? 'Unable to create subscription checkout session.',
      )
    }

    const { error: upsertError } = await supabase.from('subscriptions').upsert({
      user_id: user.id,
      stripe_subscription_id: `pending_${checkoutSession.id}`,
      stripe_customer_id: customerId,
      plan: payload.plan,
      status: 'trialing',
      current_period_start: null,
      current_period_end: null,
    }, { onConflict: 'user_id' })

    if (upsertError) {
      throw new HttpError(500, 'Failed to stage the subscription record.')
    }

    return json({
      url: checkoutSession.url,
      sessionId: checkoutSession.id,
      customerId,
    })
  } catch (error) {
    return errorResponse(error, 'Failed to create the subscription checkout session.')
  }
})
