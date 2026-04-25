-- Create billing tables for AI credits and subscriptions
-- Migration: billing_schema
-- Created: 2026-04-25

BEGIN;

-- ============================================
-- User Credits Table
-- ============================================
CREATE TABLE public.user_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    lifetime_earned INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX idx_user_credits_user_id ON public.user_credits(user_id);

-- Enable RLS
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own credits
CREATE POLICY "Users can view own credits" ON public.user_credits
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Service role can manage credits
CREATE POLICY "Service role can manage all credits" ON public.user_credits
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');


-- ============================================
-- Credit Packages Table (for sale)
-- ============================================
CREATE TABLE public.credit_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    credits INTEGER NOT NULL CHECK (credits > 0),
    price_cents INTEGER NOT NULL CHECK (price_cents > 0),
    stripe_price_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_packages_active ON public.credit_packages(is_active) WHERE is_active = true;
CREATE INDEX idx_credit_packages_sort_order ON public.credit_packages(sort_order);

-- Enable RLS
ALTER TABLE public.credit_packages ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active packages
CREATE POLICY "Anyone can view active credit packages" ON public.credit_packages
    FOR SELECT USING (is_active = true);


-- ============================================
-- Credit Purchases Table
-- ============================================
CREATE TABLE public.credit_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES public.credit_packages(id),
    stripe_payment_intent_id TEXT,
    stripe_checkout_session_id TEXT,
    credits INTEGER NOT NULL CHECK (credits > 0),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_purchases_user_id ON public.credit_purchases(user_id);
CREATE INDEX idx_credit_purchases_stripe_ids ON public.credit_purchases(stripe_payment_intent_id, stripe_checkout_session_id);

-- Enable RLS
ALTER TABLE public.credit_purchases ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own purchases
CREATE POLICY "Users can view own purchases" ON public.credit_purchases
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Service role can manage all purchases
CREATE POLICY "Service role can manage all purchases" ON public.credit_purchases
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');


-- ============================================
-- Credit Transactions Table (ledger)
-- ============================================
CREATE TABLE public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL, -- positive for credit, negative for debit
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    reason TEXT NOT NULL,
    reference_type TEXT, -- 'ai_generation', 'credit_purchase', 'subscription', 'bonus', 'refund'
    reference_id TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_created_at ON public.credit_transactions(created_at DESC);
CREATE INDEX idx_credit_transactions_reference ON public.credit_transactions(reference_type, reference_id);

-- Enable RLS
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own transactions
CREATE POLICY "Users can view own transactions" ON public.credit_transactions
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Service role can view all transactions
CREATE POLICY "Service role can view all transactions" ON public.credit_transactions
    FOR SELECT USING (auth.jwt() ->> 'role' = 'service_role');


-- ============================================
-- Subscriptions Table
-- ============================================
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_subscription_id TEXT NOT NULL,
    stripe_customer_id TEXT,
    plan TEXT NOT NULL CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'unpaid', 'trialing')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id),
    UNIQUE(stripe_subscription_id)
);

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_id ON public.subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own subscription
CREATE POLICY "Users can view own subscription" ON public.subscriptions
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Service role can manage all subscriptions
CREATE POLICY "Service role can manage all subscriptions" ON public.subscriptions
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');


-- ============================================
-- Trigger: Auto-create credits on user signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Create user credits with free tier (500 credits)
    INSERT INTO public.user_credits (user_id, balance, lifetime_earned)
    VALUES (NEW.id, 500, 500);
    
    -- Create free subscription
    INSERT INTO public.subscriptions (user_id, stripe_subscription_id, plan, status)
    VALUES (NEW.id, 'free_' || NEW.id, 'free', 'active');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================
-- Seed Data: Credit Packages
-- ============================================
INSERT INTO public.credit_packages (name, description, credits, price_cents, stripe_price_id, sort_order) VALUES
    ('Starter', 'Perfect for trying out GraphCore', 500, 999, NULL, 1),
    ('Basic', 'For casual creators', 2000, 2999, NULL, 2),
    ('Pro', 'For regular content creators', 5000, 6999, NULL, 3),
    ('Enterprise', 'For heavy users', 15000, 19999, NULL, 4)
ON CONFLICT DO NOTHING;

COMMIT;