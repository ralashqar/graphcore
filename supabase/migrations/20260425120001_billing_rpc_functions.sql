-- Credit Management RPC Functions
-- Migration: billing_rpc_functions
-- Created: 2026-04-25

BEGIN;

-- ============================================
-- Get User Credit Balance
-- ============================================
CREATE OR REPLACE FUNCTION public.get_credit_balance(user_id UUID)
RETURNS TABLE (
    balance INTEGER,
    lifetime_earned INTEGER,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        uc.balance,
        uc.lifetime_earned,
        uc.updated_at
    FROM public.user_credits uc
    WHERE uc.user_id = get_credit_balance.user_id;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================
-- Deduct Credits (for AI usage)
-- ============================================
CREATE OR REPLACE FUNCTION public.deduct_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_reason TEXT,
    p_reference_type TEXT DEFAULT 'ai_generation',
    p_reference_id TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
    success BOOLEAN,
    new_balance INTEGER,
    error_message TEXT
) AS $$
DECLARE
    v_current_balance INTEGER;
    v_new_balance INTEGER;
BEGIN
    -- Get current balance
    SELECT balance INTO v_current_balance
    FROM public.user_credits
    WHERE user_id = p_user_id;

    -- Check if user has credits
    IF v_current_balance IS NULL OR v_current_balance < p_amount THEN
        RETURN QUERY SELECT false, COALESCE(v_current_balance, 0), 'Insufficient credits';
        RETURN;
    END IF;

    -- Deduct credits
    v_new_balance := v_current_balance - p_amount;

    UPDATE public.user_credits
    SET balance = v_new_balance,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Record transaction
    INSERT INTO public.credit_transactions (user_id, amount, balance_after, reason, reference_type, reference_id, metadata)
    VALUES (p_user_id, -p_amount, v_new_balance, p_reason, p_reference_type, p_reference_id, p_metadata);

    RETURN QUERY SELECT true, v_new_balance, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- Add Credits (for purchases, bonuses)
-- ============================================
CREATE OR REPLACE FUNCTION public.add_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_reason TEXT,
    p_reference_type TEXT DEFAULT 'bonus',
    p_reference_id TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
    success BOOLEAN,
    new_balance INTEGER,
    error_message TEXT
) AS $$
DECLARE
    v_current_balance INTEGER;
    v_new_balance INTEGER;
    v_lifetime_earned INTEGER;
BEGIN
    -- Get current balance
    SELECT COALESCE(balance, 0), COALESCE(lifetime_earned, 0)
    INTO v_current_balance, v_lifetime_earned
    FROM public.user_credits
    WHERE user_id = p_user_id;

    -- Add credits
    v_new_balance := v_current_balance + p_amount;
    v_lifetime_earned := v_lifetime_earned + p_amount;

    -- Upsert user credits
    INSERT INTO public.user_credits (user_id, balance, lifetime_earned, created_at, updated_at)
    VALUES (p_user_id, v_new_balance, v_lifetime_earned, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET
        balance = EXCLUDED.balance,
        lifetime_earned = EXCLUDED.lifetime_earned,
        updated_at = NOW();

    -- Record transaction
    INSERT INTO public.credit_transactions (user_id, amount, balance_after, reason, reference_type, reference_id, metadata)
    VALUES (p_user_id, p_amount, v_new_balance, p_reason, p_reference_type, p_reference_id, p_metadata);

    RETURN QUERY SELECT true, v_new_balance, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- Get Credit Transaction History
-- ============================================
CREATE OR REPLACE FUNCTION public.get_credit_history(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    amount INTEGER,
    balance_after INTEGER,
    reason TEXT,
    reference_type TEXT,
    reference_id TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ct.id,
        ct.amount,
        ct.balance_after,
        ct.reason,
        ct.reference_type,
        ct.reference_id,
        ct.metadata,
        ct.created_at
    FROM public.credit_transactions ct
    WHERE ct.user_id = p_user_id
    ORDER BY ct.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================
-- Get Active Credit Packages
-- ============================================
CREATE OR REPLACE FUNCTION public.get_credit_packages()
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    credits INTEGER,
    price_cents INTEGER,
    stripe_price_id TEXT,
    sort_order INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cp.id,
        cp.name,
        cp.description,
        cp.credits,
        cp.price_cents,
        cp.stripe_price_id,
        cp.sort_order
    FROM public.credit_packages cp
    WHERE cp.is_active = true
    ORDER BY cp.sort_order;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================
-- Get User Subscription
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_subscription(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    plan TEXT,
    status TEXT,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.plan,
        s.status,
        s.current_period_start,
        s.current_period_end,
        s.cancel_at_period_end
    FROM public.subscriptions s
    WHERE s.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================
-- Update Subscription (called from Stripe webhook)
-- ============================================
CREATE OR REPLACE FUNCTION public.update_subscription(
    p_user_id UUID,
    p_stripe_subscription_id TEXT,
    p_plan TEXT,
    p_status TEXT,
    p_current_period_start TIMESTAMPTZ,
    p_current_period_end TIMESTAMPTZ,
    p_cancel_at_period_end BOOLEAN DEFAULT false
)
RETURNS BOOLEAN AS $$
BEGIN
    INSERT INTO public.subscriptions (
        user_id,
        stripe_subscription_id,
        plan,
        status,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        created_at,
        updated_at
    )
    VALUES (
        p_user_id,
        p_stripe_subscription_id,
        p_plan,
        p_status,
        p_current_period_start,
        p_current_period_end,
        p_cancel_at_period_end,
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        stripe_subscription_id = EXCLUDED.stripe_subscription_id,
        plan = EXCLUDED.plan,
        status = EXCLUDED.status,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        updated_at = NOW();

    RETURN true;
END;
$$ LANGUAGE plpgsql;


COMMIT;
