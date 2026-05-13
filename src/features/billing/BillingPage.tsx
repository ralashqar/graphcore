import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { billingService } from '../../application/services/billingService'
import { EntityIcon } from '../../shared/entityIcons'
import type { CreditPackage, CreditTransaction, UserSubscription } from '../../domain/billing'
import { APP_ROUTE_PATH, navigateToPath } from '../../shared/appRoutes'

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

const PLAN_DESCRIPTIONS: Record<string, string> = {
  free: '500 credits to get started',
  starter: '1,000 credits/month',
  pro: '5,000 credits/month',
  enterprise: '20,000 credits/month',
}

const PLAN_PRICES: Record<string, number> = {
  starter: 999,
  pro: 2999,
  enterprise: 9999,
}

type BillingPageProps = {
  session: Session | null
  creditBalance: number | null
  subscription: UserSubscription | null
  creditPackages: CreditPackage[]
  creditHistory: CreditTransaction[]
  onRefresh: () => void
}

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function BillingPage({
  session,
  creditBalance,
  subscription,
  creditPackages,
  creditHistory,
  onRefresh,
}: BillingPageProps) {
  const [purchasingPackageId, setPurchasingPackageId] = useState<string | null>(null)
  const [subscribingPlan, setSubscribingPlan] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  useEffect(() => {
    onRefresh()
  }, [onRefresh])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.get('success') === 'true') {
      setStatusMessage('Billing updated. Your credit balance and plan details have been refreshed.')
    } else if (searchParams.get('canceled') === 'true') {
      setStatusMessage('Checkout was canceled before completion.')
    } else {
      setStatusMessage(null)
    }
  }, [])

  const handlePurchase = useCallback(
    async (packageId: string) => {
      if (!session) return
      setPurchasingPackageId(packageId)
      setError(null)
      try {
        const result = await billingService.createCheckoutSession(session, packageId)
        window.location.href = result.url
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Purchase failed')
        setPurchasingPackageId(null)
      }
    },
    [session],
  )

  const handleSubscribe = useCallback(
    async (plan: string) => {
      if (!session) return
      setSubscribingPlan(plan)
      setError(null)
      try {
        const result = await billingService.createSubscriptionCheckout(session, plan)
        window.location.href = result.url
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Subscription failed')
        setSubscribingPlan(null)
      }
    },
    [session],
  )

  const displayBalance = creditBalance ?? 0
  const currentPlan = subscription?.plan ?? 'free'

  return (
    <div className="billing-page">
      <div className="billing-hero">
        <div className="billing-hero-copy">
          <span className="section-label">Billing</span>
          <h1>Keep SynArc generating.</h1>
          <p className="subtle-line">
            Track credits, buy more when you need a burst, or move onto a monthly plan for steady generation.
          </p>
          <div className="billing-hero-actions">
            <button className="ghost-button compact" onClick={() => navigateToPath(APP_ROUTE_PATH)} type="button">
              Back to workspace
            </button>
          </div>
        </div>
        <div className="billing-balance-card">
          <div className="billing-balance-header">
            <span className="section-label">Credits</span>
            <div className="billing-balance-amount">
              <EntityIcon id="credits" />
              <strong>{displayBalance.toLocaleString()}</strong>
              <span>AI Credits</span>
            </div>
          </div>
          <div className="billing-plan-badge">
            <span className="section-label">Plan</span>
            <strong>{PLAN_LABELS[currentPlan] ?? currentPlan}</strong>
            <span className="billing-plan-status">{subscription?.status ?? 'active'}</span>
          </div>
        </div>
      </div>

      {statusMessage ? (
        <div className="billing-info-banner">
          <span>{statusMessage}</span>
          <button className="ghost-button compact" onClick={() => setStatusMessage(null)} type="button">Dismiss</button>
        </div>
      ) : null}

      {error ? (
        <div className="billing-error-banner">
          <span>{error}</span>
          <button className="ghost-button compact" onClick={() => setError(null)} type="button">Dismiss</button>
        </div>
      ) : null}

      {!session ? (
        <div className="billing-auth-banner">
          <span>Sign in to purchase credits, start a plan, and see your billing history.</span>
        </div>
      ) : null}

      <section className="billing-section">
        <div className="surface-head">
          <span className="section-label">Buy Credits</span>
          <h2>Credit Packages</h2>
          <p className="subtle-line">One-time purchases. Credits never expire.</p>
        </div>
        <div className="billing-packages-grid">
          {creditPackages.map((pkg) => (
            <div key={pkg.id} className="billing-package-card">
              <div className="billing-package-meta">
                <strong>{pkg.name}</strong>
                <span className="subtle-line">{pkg.description ?? `${pkg.credits.toLocaleString()} credits`}</span>
              </div>
              <div className="billing-package-price">
                <strong>{formatCurrency(pkg.priceCents)}</strong>
                <span className="subtle-line">{pkg.credits.toLocaleString()} credits</span>
              </div>
              <button
                className="primary-button compact"
                disabled={!session || purchasingPackageId === pkg.id}
                onClick={() => handlePurchase(pkg.id)}
                type="button"
              >
                {purchasingPackageId === pkg.id ? 'Redirecting…' : 'Buy'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="billing-section">
        <div className="surface-head">
          <span className="section-label">Subscribe</span>
          <h2>Monthly Plans</h2>
          <p className="subtle-line">Recurring credits every month. Upgrade or cancel anytime.</p>
        </div>
        <div className="billing-plans-grid">
          {(['starter', 'pro', 'enterprise'] as const).map((plan) => (
            <div
              key={plan}
              className={`billing-plan-card ${currentPlan === plan ? 'is-current' : ''}`}
            >
              <div className="billing-plan-meta">
                <strong>{PLAN_LABELS[plan]}</strong>
                <span className="subtle-line">{PLAN_DESCRIPTIONS[plan]}</span>
              </div>
              <div className="billing-plan-price">
                <strong>{formatCurrency(PLAN_PRICES[plan])}</strong>
                <span className="subtle-line">/ month</span>
              </div>
              {currentPlan === plan ? (
                <span className="billing-current-label">Current plan</span>
              ) : (
                <button
                  className="primary-button compact"
                  disabled={!session || subscribingPlan === plan}
                  onClick={() => handleSubscribe(plan)}
                  type="button"
                >
                  {subscribingPlan === plan ? 'Redirecting…' : 'Subscribe'}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="billing-section">
        <div className="surface-head">
          <span className="section-label">History</span>
          <h2>Transactions</h2>
        </div>
        {creditHistory.length === 0 ? (
          <p className="subtle-line">No transactions yet.</p>
        ) : (
          <div className="billing-history-table">
            <div className="billing-history-header">
              <span>Date</span>
              <span>Reason</span>
              <span>Amount</span>
              <span>Balance</span>
            </div>
            {creditHistory.map((tx) => (
              <div key={tx.id} className="billing-history-row">
                <span>{formatDate(tx.createdAt)}</span>
                <span>{tx.reason}</span>
                <span className={tx.amount >= 0 ? 'billing-positive' : 'billing-negative'}>
                  {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                </span>
                <span>{tx.balanceAfter.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
