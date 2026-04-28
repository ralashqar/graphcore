import type { CreditBalance, CreditPackage, CreditTransaction, UserSubscription } from '../../domain/billing'

export type BillingSlice = {
  creditBalance: CreditBalance | null
  creditPackages: CreditPackage[]
  creditHistory: CreditTransaction[]
  subscription: UserSubscription | null
  billingLoading: boolean
  billingError: string | null
  setCreditBalance: (balance: CreditBalance | null) => void
  setCreditPackages: (packages: CreditPackage[]) => void
  setCreditHistory: (history: CreditTransaction[]) => void
  setSubscription: (subscription: UserSubscription | null) => void
  setBillingLoading: (loading: boolean) => void
  setBillingError: (error: string | null) => void
}

export const createBillingSlice = (
  set: (updater: (state: BillingSlice) => BillingSlice | Partial<BillingSlice>) => void,
): BillingSlice => ({
  creditBalance: null,
  creditPackages: [],
  creditHistory: [],
  subscription: null,
  billingLoading: false,
  billingError: null,
  setCreditBalance: (creditBalance) => set((state) => (state.creditBalance === creditBalance ? state : { creditBalance })),
  setCreditPackages: (creditPackages) => set((state) => (state.creditPackages === creditPackages ? state : { creditPackages })),
  setCreditHistory: (creditHistory) => set((state) => (state.creditHistory === creditHistory ? state : { creditHistory })),
  setSubscription: (subscription) => set((state) => (state.subscription === subscription ? state : { subscription })),
  setBillingLoading: (billingLoading) => set((state) => (state.billingLoading === billingLoading ? state : { billingLoading })),
  setBillingError: (billingError) => set((state) => (state.billingError === billingError ? state : { billingError })),
})
