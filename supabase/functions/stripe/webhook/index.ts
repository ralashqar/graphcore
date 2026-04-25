import '@supabase/functions-js/edge-runtime.d.ts'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=denonext'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-11-20',
})
const cryptoProvider = Stripe.createSubtleCryptoProvider()
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
}

const PLAN_CREDITS: Record<string, number> = {
  free: 500,
  starter: 1000,
  pro: 5000,
  enterprise: 20000,
}

function toIsoDate(input: number | null | undefined) {
  if (!input) return null
  return new Date(input * 1000).toISOString()
}

function normalizeSubscriptionStatus(status: string): 'active' | 'past_due' | 'canceled' | 'unpaid' | 'trialing' {
  switch (status) {
    case 'active':
    case 'past_due':
    case 'canceled':
    case 'unpaid':
    case 'trialing':
      return status
    default:
      return 'active'
  }
}

async function findUserIdForSubscription(
  supabase: ReturnType<typeof createClient>,
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
    if (data?.user_id) {
      return data.user_id as string
    }
  }

  const resolvedCustomerId = typeof customerId === 'string'
    ? customerId
    : customerId && 'id' in customerId
      ? customerId.id
      : null

  if (resolvedCustomerId) {
    const { data } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', resolvedCustomerId)
      .maybeSingle()
    if (data?.user_id) {
      return data.user_id as string
    }
  }

  return null
}

async function addCreditsIfMissing(
  supabase: ReturnType<typeof createClient>,
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

  const { data: existingTransaction } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('user_id', input.userId)
    .eq('reference_type', input.referenceType)
    .eq('reference_id', input.referenceId)
    .maybeSingle()

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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  try {
    const signature = request.headers.get('Stripe-Signature')
    if (!signature) {
      return new Response(
        JSON.stringify({ error: 'Missing Stripe-Signature header' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = await request.text()
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      stripeWebhookSecret,
      undefined,
      cryptoProvider,
    )

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('[stripe-webhook] Received event:', event.type, event.id)

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.client_reference_id || session.metadata?.user_id || null
        const packageId = session.metadata?.package_id
        const credits = Number.parseInt(session.metadata?.credits || '0', 10)
        const plan = session.metadata?.plan

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
              paymentIntentId: session.payment_intent,
            },
          })

          await supabase
            .from('credit_purchases')
            .update({
              status: 'completed',
              stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_checkout_session_id', session.id)
        }

        if (userId && plan && typeof session.subscription === 'string') {
          const subscription = await stripe.subscriptions.retrieve(session.subscription)
          await supabase.from('subscriptions').upsert({
            user_id: userId,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : null,
            plan,
            status: normalizeSubscriptionStatus(subscription.status),
            current_period_start: toIsoDate(subscription.current_period_start),
            current_period_end: toIsoDate(subscription.current_period_end),
            cancel_at_period_end: subscription.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })
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

        const plan = subscription.metadata.plan || 'starter'
        const credits = Number.parseInt(
          subscription.metadata.credits_per_month || String(PLAN_CREDITS[plan] ?? 0),
          10,
        )

        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : null,
          plan,
          status: normalizeSubscriptionStatus(subscription.status),
          current_period_start: toIsoDate(subscription.current_period_start),
          current_period_end: toIsoDate(subscription.current_period_end),
          cancel_at_period_end: subscription.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

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

        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : null,
          plan: subscription.metadata.plan || 'starter',
          status: event.type === 'customer.subscription.deleted'
            ? 'canceled'
            : normalizeSubscriptionStatus(subscription.status),
          current_period_start: toIsoDate(subscription.current_period_start),
          current_period_end: toIsoDate(subscription.current_period_end),
          cancel_at_period_end: subscription.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null
        if (!subscriptionId) {
          break
        }

        await supabase
          .from('subscriptions')
          .update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscriptionId)
        break
      }

      default:
        console.log('[stripe-webhook] Unhandled event type:', event.type)
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('[stripe-webhook] Error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
