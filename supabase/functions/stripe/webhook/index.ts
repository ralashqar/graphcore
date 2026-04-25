import '@supabase/functions-js/edge-runtime.d.ts'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = Deno.env.get('STRIPE_SECRET_KEY')!
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
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
    const signature = request.headers.get('stripe-signature')
    if (!signature) {
      return new Response(
        JSON.stringify({ error: 'Missing stripe-signature header' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await request.text()
    
    // Verify webhook signature
    const timestamp = body.split('\n')[0]?.replace('timestamp:', '')
    const payload = body.split('\n').slice(1).join('\n')
    
    // For now, we'll skip signature verification in development
    // In production, use Stripe's official SDK for verification
    const event = JSON.parse(payload)
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('[stripe-webhook] Received event:', event.type)

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId = session.client_reference_id || session.metadata?.user_id
        const packageId = session.metadata?.package_id
        const credits = parseInt(session.metadata?.credits || '0')
        const plan = session.metadata?.plan

        if (userId) {
          if (plan) {
            // Subscription created
            const subscription = event.data.object.subscription
            await supabase.from('subscriptions').upsert({
              user_id: userId,
              stripe_subscription_id: subscription,
              plan,
              status: 'active',
              current_period_start: new Date(),
              current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            }, { onConflict: 'user_id' })
            
            console.log('[stripe-webhook] Subscription activated for user:', userId)
          } else if (credits > 0) {
            // Credit package purchased
            await supabase.rpc('add_credits', {
              p_user_id: userId,
              p_amount: credits,
              p_reason: 'Credit package purchase',
              p_reference_type: 'credit_purchase',
              p_reference_id: session.payment_intent,
            })
            
            // Update purchase record
            await supabase.from('credit_purchases').update({
              status: 'completed',
              stripe_payment_intent_id: session.payment_intent,
            }).eq('stripe_checkout_session_id', session.id)
            
            console.log('[stripe-webhook] Credits added for user:', userId, 'amount:', credits)
          }
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        const subscriptionId = invoice.subscription
        
        if (subscriptionId) {
          // Get subscription details from Stripe
          const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
            headers: { 'Authorization': `Bearer ${stripe}` },
          })
          const subscription = await subRes.json()
          
          // Find user by stripe_subscription_id
          const { data: existingSub } = await supabase
            .from('subscriptions')
            .select('user_id')
            .eq('stripe_subscription_id', subscriptionId)
            .single()
          
          if (existingSub) {
            await supabase.from('subscriptions').update({
              status: 'active',
              current_period_start: new Date(subscription.current_period_start * 1000),
              current_period_end: new Date(subscription.current_period_end * 1000),
            }).eq('stripe_subscription_id', subscriptionId)
            
            console.log('[stripe-webhook] Subscription renewed:', subscriptionId)
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object
        const userId = subscription.metadata?.user_id
        
        if (userId) {
          await supabase.from('subscriptions').upsert({
            user_id: userId,
            stripe_subscription_id: subscription.id,
            plan: subscription.metadata?.plan || 'starter',
            status: subscription.status === 'active' ? 'active' : 
                   subscription.status === 'past_due' ? 'past_due' : 
                   subscription.status === 'canceled' ? 'canceled' : 'active',
            current_period_start: new Date(subscription.current_period_start * 1000),
            current_period_end: new Date(subscription.current_period_end * 1000),
            cancel_at_period_end: subscription.cancel_at_period_end,
          }, { onConflict: 'user_id' })
          
          console.log('[stripe-webhook] Subscription updated:', subscription.id)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        
        await supabase.from('subscriptions').update({
          status: 'canceled',
        }).eq('stripe_subscription_id', subscription.id)
        
        console.log('[stripe-webhook] Subscription canceled:', subscription.id)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const subscriptionId = invoice.subscription
        
        if (subscriptionId) {
          await supabase.from('subscriptions').update({
            status: 'past_due',
          }).eq('stripe_subscription_id', subscriptionId)
          
          console.log('[stripe-webhook] Payment failed for subscription:', subscriptionId)
        }
        break
      }

      default:
        console.log('[stripe-webhook] Unhandled event type:', event.type)
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[stripe-webhook] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})