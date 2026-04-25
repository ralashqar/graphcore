import '@supabase/functions-js/edge-runtime.d.ts'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = Deno.env.get('STRIPE_SECRET_KEY')!
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { packageId, successUrl, cancelUrl } = await request.json()

    if (!packageId) {
      return new Response(
        JSON.stringify({ error: 'packageId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get package details
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    const { data: package, error: packageError } = await supabase
      .from('credit_packages')
      .select('*')
      .eq('id', packageId)
      .single()

    if (packageError || !package) {
      return new Response(
        JSON.stringify({ error: 'Package not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user from auth header
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Stripe checkout session
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripe}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'payment',
        'payment_method_types[]': 'card',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': package.name,
        'line_items[0][price_data][product_data][description]': package.description || `${package.credits} AI credits`,
        'line_items[0][price_data][unit_amount]': String(package.price_cents),
        'line_items[0][quantity]': '1',
        'success_url': successUrl || 'https://graphcore.ai/billing?success=true',
        'cancel_url': cancelUrl || 'https://graphcore.ai/billing?canceled=true',
        'client_reference_id': user.id,
        'metadata[user_id]': user.id,
        'metadata[package_id]': package.id,
        'metadata[credits]': String(package.credits),
      }).toString(),
    })

    const stripeSession = await stripeRes.json()

    if (stripeSession.error) {
      return new Response(
        JSON.stringify({ error: stripeSession.error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create pending purchase record
    await supabase.from('credit_purchases').insert({
      user_id: user.id,
      package_id: package.id,
      stripe_checkout_session_id: stripeSession.id,
      credits: package.credits,
      amount_cents: package.price_cents,
      status: 'pending',
    })

    return new Response(
      JSON.stringify({ 
        url: stripeSession.url,
        sessionId: stripeSession.id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[create-checkout-session] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})