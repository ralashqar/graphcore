import '@supabase/functions-js/edge-runtime.d.ts'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = Deno.env.get('STRIPE_SECRET_KEY')!
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Subscription plans configuration
const PLANS = {
  starter: { name: 'Starter', price_cents: 999, credits_per_month: 1000 },
  pro: { name: 'Pro', price_cents: 2999, credits_per_month: 5000 },
  enterprise: { name: 'Enterprise', price_cents: 9999, credits_per_month: 20000 },
}

type StripeCustomerResponse = {
  id?: string
  error?: { message?: string }
}

type StripeCheckoutSessionResponse = {
  id?: string
  url?: string
  error?: { message?: string }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { plan, successUrl, cancelUrl } = await request.json()

    if (!plan || !PLANS[plan as keyof typeof PLANS]) {
      return new Response(
        JSON.stringify({ error: 'Valid plan is required (starter, pro, enterprise)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const selectedPlan = PLANS[plan as keyof typeof PLANS]

    // Get user from auth header
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    let customerId = existingSubscription?.stripe_customer_id ?? null
    if (!customerId) {
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripe}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          'metadata[user_id]': user.id,
          'email': user.email || '',
        }).toString(),
      })

      const customer = await customerRes.json() as StripeCustomerResponse

      if (customer.error || !customer.id) {
        return new Response(
          JSON.stringify({ error: customer.error?.message ?? 'Unable to create Stripe customer' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      customerId = customer.id
    }

    const checkoutRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripe}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'subscription',
        'payment_method_types[]': 'card',
        'customer': customerId,
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': `${selectedPlan.name} - GraphCore Monthly`,
        'line_items[0][price_data][product_data][description]': `${selectedPlan.credits_per_month} AI credits every month`,
        'line_items[0][price_data][unit_amount]': String(selectedPlan.price_cents),
        'line_items[0][price_data][recurring][interval]': 'month',
        'line_items[0][quantity]': '1',
        'success_url': successUrl || 'https://graphcore.ai/billing?success=true',
        'cancel_url': cancelUrl || 'https://graphcore.ai/billing?canceled=true',
        'client_reference_id': user.id,
        'metadata[user_id]': user.id,
        'metadata[plan]': plan,
        'subscription_data[metadata][user_id]': user.id,
        'subscription_data[metadata][plan]': plan,
        'subscription_data[metadata][credits_per_month]': String(selectedPlan.credits_per_month),
      }).toString(),
    })

    const checkoutSession = await checkoutRes.json() as StripeCheckoutSessionResponse

    if (checkoutSession.error || !checkoutSession.id || !checkoutSession.url) {
      return new Response(
        JSON.stringify({ error: checkoutSession.error?.message ?? 'Unable to create subscription checkout session' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update user subscription record with pending status
    await supabase.from('subscriptions').upsert({
      user_id: user.id,
      stripe_subscription_id: `pending_${checkoutSession.id}`,
      stripe_customer_id: customerId,
      plan,
      status: 'trialing',
      current_period_start: null,
      current_period_end: null,
    }, { onConflict: 'user_id' })

    return new Response(
      JSON.stringify({ 
        url: checkoutSession.url,
        sessionId: checkoutSession.id,
        customerId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[create-subscription] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
