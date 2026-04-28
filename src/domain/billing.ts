export type CreditBalance = {
  balance: number
  lifetimeEarned: number
  updatedAt: string
}

export type CreditPackage = {
  id: string
  name: string
  description: string | null
  credits: number
  priceCents: number
  stripePriceId: string | null
  sortOrder: number
}

export type CreditTransaction = {
  id: string
  amount: number
  balanceAfter: number
  reason: string
  referenceType: string | null
  referenceId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export type UserSubscription = {
  id: string
  plan: 'free' | 'starter' | 'pro' | 'enterprise'
  status: 'active' | 'past_due' | 'canceled' | 'unpaid' | 'trialing'
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

export type CheckoutSessionResult = {
  url: string
  sessionId: string
}

export type SubscriptionCheckoutResult = {
  url: string
  sessionId: string
  customerId: string
}
