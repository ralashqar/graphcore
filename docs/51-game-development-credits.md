# Development game credits

Set server-only `GAME_DEV_CREDIT_BYPASS_ENABLED=true` to waive app credits for exact authenticated IDs already in `GAME_GENERATION_USERS`. This explicit debug flag defines development credit mode; it does not depend on the frontend build mode. Missing/false flag, unlisted accounts and wildcard-only lists retain configured pricing. Set the flag to `false` to disable. No client field, local storage or editable user metadata can enable it.

Scope: animation graph planning and readiness review; game generation/planning and charged asset commands; mechanic planning. `animation-studio` availability and `get-game-workspace` pricing return the effective per-user price. World/Director and other SynArc surfaces are not changed.

The existing service-only RPCs receive a zero reservation and already skip credit deduction at zero. Existing jobs and retries retain their original frozen reservations; there are no retroactive refunds. Provider usage continues to be tracked and billed externally. Owner/feature gates, validation, GPU setup-budget reservations and account permissions remain intact. Invalid pricing is not masked by the bypass.

Deploy `animation-studio`, `game-command` and `get-game-workspace`. The helper is only called by Edge entries, not by Fly workers; no migration or worker deployment is needed. The flag can be enabled on a hosted development deployment without changing unrelated production prices or accounts.

Four focused policy/availability tests passed, including flag-off, non-allowlisted, wildcard, invalid-price and unchanged GPU gates. The regression suite passed (726 passed, 8 skipped); TypeScript, three Edge Deno checks and the production build passed. The dev server started on port 5176 and the animation route loaded with no page errors.

All three affected Edge functions are deployed, and `GAME_DEV_CREDIT_BYPASS_ENABLED=true` is set on project `znwdatidqdkzidempvkt` using the existing explicit `GAME_GENERATION_USERS` allowlist. Unauthenticated animation requests remain rejected with 401. No paid provider request was submitted during verification. An authenticated creator prompt after activation remains a separate acceptance check.
