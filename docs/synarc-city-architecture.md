# Synarc City architecture

## Boundaries

The city loads before the authoring application in the Vite entry. React/R3F/Three render a modular map; HTML owns forms, content and accessibility. Supabase Auth sessions are shared with Synarc. City organisations, records and money are independent of projects, generation credits and subscriptions.

Public routes: `/city`, `/city/business/:slug`. Account routes: `/city/account`, `/city/manage`, `/city/admin`. Public API returns approved projections only. All business/financial mutations use authenticated Edge commands and service-only transaction functions. Table RLS and revoked browser writes are defense in depth. Administrators are explicit server-owned rows, never user metadata.

## Allocation

Plots have stable integer coordinates and priority. Initial sites sort by squared distance then coordinates. Expansion appends full outer rings. A city advisory transaction lock serializes eligible-value updates, assignments, revision increments and events. Land Value descending, reached-at ascending, ID ascending is authoritative. Frontend estimates are advisory.

## Money

Dedicated city orders freeze GBP subtotal. Checkout metadata identifies the order; fulfillment validates currency, amount and paid status against it. Signed Stripe webhooks reconcile current processor state. Unique events and unique ledger adjustments make retries safe. Cumulative refunded/disputed principal produces compensating entries with no double deduction. Outbox events commit with ranking. Reconciliation repairs interrupted processing; disabled purchasing never disables webhooks.

## Content and discovery

Draft and approved snapshots are separate. Review uses revision fencing. Website verification is bound to the hostname; changing it clears verification. Import is HTTPS-only, bounded, DNS/IP validated at each redirect and never executes scripts. Media uploads are private; approved projections receive temporary signed links. Search uses Postgres full-text indexing. Public state contains only display data, rank and engagement aggregates. Revision notifications are advisory; periodic reads and reconnects repair gaps.

## Sources

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/functions/auth
- https://docs.stripe.com/webhooks

See operations documentation for implemented commands, deployment and verification evidence.
