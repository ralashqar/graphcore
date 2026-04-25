import type { FunctionsHttpError, Session } from '@supabase/supabase-js'
import { supabase } from '../utils/supabase'
import type {
  CheckoutSessionResult,
  CreditBalance,
  CreditPackage,
  CreditTransaction,
  SubscriptionCheckoutResult,
  UserSubscription,
} from '../domain/billing'

type CreditHistoryRow = {
  id: string
  amount: number
  balance_after: number
  reason: string
  reference_type: string | null
  reference_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type CreditPackageRow = {
  id: string
  name: string
  description: string | null
  credits: number
  price_cents: number
  stripe_price_id: string | null
  sort_order: number
}

type UserSubscriptionRow = {
  id: string
  plan: UserSubscription['plan']
  status: UserSubscription['status']
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
}

function getInvokeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

async function readFunctionsErrorMessage(error: FunctionsHttpError | Error, fallback: string) {
  if (!('context' in error)) {
    return getInvokeErrorMessage(error, fallback)
  }

  const context = (error as FunctionsHttpError & { context?: unknown }).context
  if (!(context instanceof Response)) {
    return getInvokeErrorMessage(error, fallback)
  }

  try {
    const payload = await context.clone().json() as { error?: string }
    return payload.error ?? getInvokeErrorMessage(error, fallback)
  } catch {
    try {
      const text = await context.clone().text()
      return text || getInvokeErrorMessage(error, fallback)
    } catch {
      return getInvokeErrorMessage(error, fallback)
    }
  }
}

export async function fetchBillingData(session: Session) {
  const [creditBalance, creditPackages, creditHistory, subscription] = await Promise.all([
    getCreditBalance(session),
    getCreditPackages(),
    getCreditHistory(session),
    getUserSubscription(session),
  ])

  return {
    creditBalance,
    creditPackages,
    creditHistory,
    subscription,
  }
}

export async function getCreditBalance(session: Session): Promise<CreditBalance | null> {
  const { data, error } = await supabase.rpc('get_credit_balance', {
    user_id: session.user.id,
  })

  if (error || !data || data.length === 0) {
    console.error('[billing] get_credit_balance failed', error)
    return null
  }

  const row = data[0]
  return {
    balance: row.balance ?? 0,
    lifetimeEarned: row.lifetime_earned ?? 0,
    updatedAt: row.updated_at ?? new Date().toISOString(),
  }
}

export async function getCreditPackages(): Promise<CreditPackage[]> {
  const { data, error } = await supabase.rpc('get_credit_packages')

  if (error || !data) {
    console.error('[billing] get_credit_packages failed', error)
    return []
  }

  return (data as CreditPackageRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    credits: row.credits,
    priceCents: row.price_cents,
    stripePriceId: row.stripe_price_id,
    sortOrder: row.sort_order,
  }))
}

export async function getCreditHistory(
  session: Session,
  limit = 50,
  offset = 0,
): Promise<CreditTransaction[]> {
  const { data, error } = await supabase.rpc('get_credit_history', {
    p_user_id: session.user.id,
    p_limit: limit,
    p_offset: offset,
  })

  if (error || !data) {
    console.error('[billing] get_credit_history failed', error)
    return []
  }

  return (data as CreditHistoryRow[]).map((row) => ({
    id: row.id,
    amount: row.amount,
    balanceAfter: row.balance_after,
    reason: row.reason,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
  }))
}

export async function getUserSubscription(session: Session): Promise<UserSubscription | null> {
  const { data, error } = await supabase.rpc('get_user_subscription', {
    p_user_id: session.user.id,
  })

  if (error || !data || data.length === 0) {
    console.error('[billing] get_user_subscription failed', error)
    return null
  }

  const row = (data as UserSubscriptionRow[])[0]
  return {
    id: row.id,
    plan: row.plan,
    status: row.status,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
  }
}

export async function createCheckoutSession(
  session: Session,
  packageId: string,
  successUrl?: string,
  cancelUrl?: string,
): Promise<CheckoutSessionResult> {
  const response = await supabase.functions.invoke<CheckoutSessionResult>('stripe-create-checkout-session', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: {
      packageId,
      successUrl: successUrl ?? `${window.location.origin}/billing?success=true`,
      cancelUrl: cancelUrl ?? `${window.location.origin}/billing?canceled=true`,
    },
  })

  if (response.error || !response.data) {
    const message = response.error
      ? await readFunctionsErrorMessage(response.error, 'Checkout session failed')
      : 'Checkout session failed'
    throw new Error(message)
  }

  return response.data
}

export async function createSubscriptionCheckout(
  session: Session,
  plan: string,
  successUrl?: string,
  cancelUrl?: string,
): Promise<SubscriptionCheckoutResult> {
  const response = await supabase.functions.invoke<SubscriptionCheckoutResult>('stripe-create-subscription', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: {
      plan,
      successUrl: successUrl ?? `${window.location.origin}/billing?success=true`,
      cancelUrl: cancelUrl ?? `${window.location.origin}/billing?canceled=true`,
    },
  })

  if (response.error || !response.data) {
    const message = response.error
      ? await readFunctionsErrorMessage(response.error, 'Subscription checkout failed')
      : 'Subscription checkout failed'
    throw new Error(message)
  }

  return response.data
}
