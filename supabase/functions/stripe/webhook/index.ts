import '@supabase/functions-js/edge-runtime.d.ts'

import Stripe from 'stripe'

import { createAdminClient } from '../../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../../_shared/http.ts'

const PLAN_CREDITS: Record<string, number> = {
  free: 500,
  starter: 1000,
  pro: 5000,
  enterprise: 20000,
}

type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'unpaid' | 'trialing'
type PlanKey = 'free' | 'starter' | 'pro' | 'enterprise'

type SubscriptionRow = {
  user_id: string
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim()

  if (!value) {
    throw new Error(`${name} is not configured.`)
  }

  return value
}

const stripe = new Stripe(getRequiredEnv('STRIPE_SECRET_KEY'), {
  apiVersion: '2024-11-20',
})
const cryptoProvider = Stripe.createSubtleCryptoProvider()
const stripeWebhookSecret = getRequiredEnv('STRIPE_WEBHOOK_SECRET')

function toIsoDate(input: number | null | undefined) {
  if (!input) return null
  return new Date(input * 1000).toISOString()
}

function normalizeSubscriptionStatus(status: string): SubscriptionStatus {
  switch (status) {
    case 'active':
    case 'past_due':
    case 'unpaid':
    case 'trialing':
      return status
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled'
    case 'incomplete':
    case 'paused':
      return 'past_due'
    default:
      return 'active'
  }
}

function normalizePlan(plan: string | null | undefined, fallback: PlanKey = 'starter'): PlanKey {
  switch (plan) {
    case 'free':
    case 'starter':
    case 'pro':
    case 'enterprise':
      return plan
    default:
      return fallback
  }
}

function resolveCustomerId(
  customerId: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
) {
  if (typeof customerId === 'string') {
    return customerId
  }

  return customerId && 'id' in customerId ? customerId.id : null
}

function resolvePaymentIntentId(paymentIntent: string | Stripe.PaymentIntent | null) {
  if (typeof paymentIntent === 'string') {
    return paymentIntent
  }

  return paymentIntent?.id ?? null
}

async function findUserIdForSubscription(
  supabase: ReturnType<typeof createAdminClient>,
  subscription: Stripe.Subscription | null,
  subscriptionId: string | null,
  customerId: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
) {
  const metadataUserId = typeof subscription?.metadata?.user_id === 'string' ? subscription.metadata.user_id : null
  if (metadataUserId) {
    return metadataUserId
  }

  if (subscriptionId) {
    const { data } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle()
    const row = data as SubscriptionRow | null
    if (row?.user_id) {
      return row.user_id
    }
  }

  const resolvedCustomerId = resolveCustomerId(customerId)

  if (resolvedCustomerId) {
    const { data } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', resolvedCustomerId)
      .maybeSingle()
    const row = data as SubscriptionRow | null
    if (row?.user_id) {
      return row.user_id
    }
  }

  return null
}

async function addCreditsIfMissing(
  supabase: ReturnType<typeof createAdminClient>,
  input: {
    userId: string
    amount: number
    reason: string
    referenceType: string
    referenceId: string
    metadata?: Record<string, unknown>
  },
) {
  if (input.amount <= 0) {
    return
  }

  const { data, error: existingTransactionError } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('user_id', input.userId)
    .eq('reference_type', input.referenceType)
    .eq('reference_id', input.referenceId)
    .maybeSingle()

  const existingTransaction = data as { id: string } | null

  if (existingTransactionError) {
    throw new HttpError(500, 'Failed to inspect prior credit transactions.')
  }

  if (existingTransaction?.id) {
    return
  }

  const { error } = await supabase.rpc('add_credits', {
    p_user_id: input.userId,
    p_amount: input.amount,
    p_reason: input.reason,
    p_reference_type: input.referenceType,
    p_reference_id: input.referenceId,
    p_metadata: input.metadata ?? {},
  })

  if (error) {
    throw error
  }
}

Deno.serve(async (request: Request) => {
  const preflight = maybeHandleOptions(request)

  if (preflight) {
    return preflight
  }

  try {
    if (request.method !== 'POST') {
      throw new HttpError(405, 'Method not allowed.')
    }

    const signature = request.headers.get('Stripe-Signature')
    if (!signature) {
      throw new HttpError(400, 'Missing Stripe-Signature header.')
    }

    const body = await request.text()
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      stripeWebhookSecret,
      undefined,
      cryptoProvider,
    )

    const supabase = createAdminClient('stripe/webhook')

    console.log('[stripe-webhook] Received event:', event.type, event.id)

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.client_reference_id || session.metadata?.user_id || null
        const packageId = session.metadata?.package_id
        const credits = Number.parseInt(session.metadata?.credits || '0', 10)
        const plan = session.metadata?.plan ? normalizePlan(session.metadata.plan) : null

        if (userId && !plan && packageId && credits > 0) {
          await addCreditsIfMissing(supabase, {
            userId,
            amount: credits,
            reason: 'Credit package purchase',
            referenceType: 'credit_purchase',
            referenceId: session.id,
            metadata: {
              packageId,
              checkoutSessionId: session.id,
              paymentIntentId: resolvePaymentIntentId(session.payment_intent),
            },
          })

          const { error: purchaseUpdateError } = await supabase
            .from('credit_purchases')
            .update({
              status: 'completed',
              stripe_payment_intent_id: resolvePaymentIntentId(session.payment_intent),
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_checkout_session_id', session.id)

          if (purchaseUpdateError) {
            throw new HttpError(500, 'Failed to complete the credit purchase record.')
          }
        }

        if (userId && plan && typeof session.subscription === 'string') {
          const subscription = await stripe.subscriptions.retrieve(session.subscription)
          const { error: subscriptionUpsertError } = await supabase.from('subscriptions').upsert({
            user_id: userId,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: resolveCustomerId(subscription.customer),
            plan,
            status: normalizeSubscriptionStatus(subscription.status),
            current_period_start: toIsoDate(subscription.current_period_start),
            current_period_end: toIsoDate(subscription.current_period_end),
            cancel_at_period_end: subscription.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })

          if (subscriptionUpsertError) {
            throw new HttpError(500, 'Failed to upsert the completed subscription.')
          }
        }
        break
      }

      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null
        if (!subscriptionId) {
          break
        }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const userId = await findUserIdForSubscription(supabase, subscription, subscriptionId, subscription.customer)
        if (!userId) {
          console.warn('[stripe-webhook] Unable to resolve user for subscription invoice', subscriptionId)
          break
        }

        const plan = normalizePlan(subscription.metadata.plan)
        const credits = Number.parseInt(
          subscription.metadata.credits_per_month || String(PLAN_CREDITS[plan] ?? 0),
          10,
        )

        const { error: subscriptionUpsertError } = await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: resolveCustomerId(subscription.customer),
          plan,
          status: normalizeSubscriptionStatus(subscription.status),
          current_period_start: toIsoDate(subscription.current_period_start),
          current_period_end: toIsoDate(subscription.current_period_end),
          cancel_at_period_end: subscription.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

        if (subscriptionUpsertError) {
          throw new HttpError(500, 'Failed to sync the paid subscription.')
        }

        await addCreditsIfMissing(supabase, {
          userId,
          amount: credits,
          reason: `${plan} subscription monthly credits`,
          referenceType: 'subscription',
          referenceId: invoice.id,
          metadata: {
            subscriptionId: subscription.id,
            invoiceId: invoice.id,
            plan,
          },
        })
        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = await findUserIdForSubscription(supabase, subscription, subscription.id, subscription.customer)
        if (!userId) {
          console.warn('[stripe-webhook] Unable to resolve user for subscription update', subscription.id)
          break
        }

        const { error: subscriptionUpsertError } = await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: resolveCustomerId(subscription.customer),
          plan: normalizePlan(subscription.metadata.plan),
          status: event.type === 'customer.subscription.deleted'
            ? 'canceled'
            : normalizeSubscriptionStatus(subscription.status),
          current_period_start: toIsoDate(subscription.current_period_start),
          current_period_end: toIsoDate(subscription.current_period_end),
          cancel_at_period_end: subscription.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

        if (subscriptionUpsertError) {
          throw new HttpError(500, 'Failed to sync the updated subscription.')
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null
        if (!subscriptionId) {
          break
        }

        const { error: subscriptionUpdateError } = await supabase
          .from('subscriptions')
          .update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscriptionId)

        if (subscriptionUpdateError) {
          throw new HttpError(500, 'Failed to mark the subscription as past due.')
        }
        break
      }

      default:
        console.log('[stripe-webhook] Unhandled event type:', event.type)
    }

    return json({ received: true })
  } catch (error) {
    return errorResponse(error, 'Failed to process the Stripe webhook.')
  }
})
