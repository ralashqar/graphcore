import type { Session } from '@supabase/supabase-js'
import type {
  CheckoutSessionResult,
  CreditBalance,
  CreditPackage,
  CreditTransaction,
  SubscriptionCheckoutResult,
  UserSubscription,
} from '../../domain/billing'
import {
  createCheckoutSession,
  createSubscriptionCheckout,
  fetchBillingData,
  getCreditBalance,
  getCreditHistory,
  getCreditPackages,
  getUserSubscription,
} from '../../data/billingRepository'

export const billingService = {
  fetchBillingData: (session: Session) => fetchBillingData(session),
  getCreditBalance: (session: Session): Promise<CreditBalance | null> => getCreditBalance(session),
  getCreditPackages: (): Promise<CreditPackage[]> => getCreditPackages(),
  getCreditHistory: (session: Session, limit?: number, offset?: number): Promise<CreditTransaction[]> =>
    getCreditHistory(session, limit, offset),
  getUserSubscription: (session: Session): Promise<UserSubscription | null> => getUserSubscription(session),
  createCheckoutSession: (session: Session, packageId: string): Promise<CheckoutSessionResult> =>
    createCheckoutSession(session, packageId),
  createSubscriptionCheckout: (session: Session, plan: string): Promise<SubscriptionCheckoutResult> =>
    createSubscriptionCheckout(session, plan),
}
