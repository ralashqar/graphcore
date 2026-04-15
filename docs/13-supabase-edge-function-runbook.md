# Supabase Edge Function Runbook

This runbook captures the working GraphCore pattern for creating, deploying, linking, and debugging Supabase Edge Functions, especially app-facing AI functions.

Use this as the default reference before creating a new function.

## Baseline References

Treat these as the known-good patterns:

- `supabase/functions/prompt-patch/index.ts`
- `supabase/functions/apply-patch/index.ts`
- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/http.ts`
- `src/data/graphcoreRepository.ts`

Before creating a new function, compare against those files first. Do not invent a parallel auth, invocation, or output style unless there is a concrete reason.

## Auth Model

For GraphCore app-facing functions, the working pattern is:

- remote `verify_jwt = false`
- in-function auth via `requireUserClient()`

Local config must include a matching block in `supabase/config.toml`:

```toml
[functions.my-function]
verify_jwt = false
```

Deploy app-facing functions with:

```powershell
npx supabase functions deploy my-function --project-ref <project-ref> --no-verify-jwt
```

Always verify remote state after deploy:

```powershell
npx supabase functions list --project-ref <project-ref> -o json
```

Do not assume a successful deploy means the runtime config is correct.

## Function Shape

Keep server-only helpers in `supabase/functions/_shared/`.

Each function should follow this structure:

1. import edge runtime types
2. handle `OPTIONS` via `maybeHandleOptions`
3. require `POST`
4. validate request body with Zod
5. authenticate with `requireUserClient()` if user context is required
6. execute logic
7. return `json(...)`
8. catch and return `errorResponse(...)`

Recommended skeleton:

```ts
import '@supabase/functions-js/edge-runtime.d.ts'
import { z } from 'npm:zod@4'
import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

const requestSchema = z.object({
  prompt: z.string().min(1),
})

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    await requireUserClient(request, 'my-function')
    const payload = requestSchema.parse(await request.json())

    return json({ ok: true, prompt: payload.prompt })
  } catch (error) {
    return errorResponse(error, 'Function failed.')
  }
})
```

## Frontend Invocation Pattern

Use the GraphCore wrappers in `src/data/graphcoreRepository.ts`.

Current working flow:

1. get session
2. validate access token with `supabase.auth.getUser(session.access_token)`
3. refresh session if invalid
4. call `supabase.functions`
5. if the function returns `401`, refresh once and retry once

Working invoke style:

```ts
const functionsClient = supabase.functions
functionsClient.setAuth(session.access_token)
const response = await functionsClient.invoke<TResponse>(functionName, { body })
```

Always log the edge error payload if a function fails. The response body is often the only useful clue.

## OpenAI Responses Pattern

For JSON-shaped AI output, the stable GraphCore pattern is:

- `text.format: { type: 'json_object' }`
- system prompt says JSON only
- parse returned text manually
- validate with Zod after parse

Do not default to strict upstream schema formatting for these functions. We hit repeated failures with strict schema handling.

Working pattern:

```ts
const aiResponse = await runOpenAiResponses({
  model,
  input: [
    { role: 'system', content: [{ type: 'input_text', text: systemText }] },
    { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(promptContext, null, 2) }] },
  ],
  text: {
    format: {
      type: 'json_object',
    },
  },
  reasoning: { effort: 'low' },
  metadata: { feature: 'world-build', pass: passLabel },
  store: false,
  maxOutputTokens,
})
```

## Prompting Rules for JSON Output

If the model output must have a specific shape, spell it out explicitly.

Include:

- exact top-level keys
- exact required nested objects
- array-vs-object requirements
- one short example object

Good pattern:

- `Return exactly one JSON object with these top-level keys: ...`
- ``planItems` must always be an array`
- ``resultContext` must always be present and contain ...`

## Validation Pattern

Do not let deep `schema.parse(...)` throws leak straight to users if the output is AI-generated.

Preferred pattern:

1. parse loose JSON first
2. validate with `safeParse`
3. shape a readable error message
4. include returned top-level keys when possible

Example:

```ts
const parsed = schema.safeParse(value)
if (!parsed.success) {
  throw new HttpError(
    500,
    `Planner output validation failed. keys=${describeTopLevelKeys(value)}. ${formatIssues(parsed.error.issues)}`,
  )
}
```

## AI Debug Logging

Use an env-gated flag instead of browser-side debug hacks:

- `WORLD_BUILD_DEBUG_OPENAI=true`

When enabled, log:

- request metadata/context
- OpenAI response status
- request id
- output text
- parsed JSON
- schema-failed issues

Keep these logs server-side.

## Deployment Checklist

Before deploy:

```powershell
npx supabase functions list --project-ref <project-ref> -o json
```

If database changes exist:

```powershell
npx supabase db push --linked --yes
```

Deploy:

```powershell
npx supabase functions deploy <name> --project-ref <project-ref> --no-verify-jwt
```

After deploy:

```powershell
npx supabase functions list --project-ref <project-ref> -o json
```

Confirm:

- function exists
- version incremented
- `verify_jwt` is correct

## Webhook Pattern For Long-Running Fal Jobs

For Fal queue jobs, GraphCore now uses:

1. reserve or confirm the final asset/resource first
2. submit the Fal queue request
3. persist:
   - `providerRequestId`
   - `statusUrl`
   - `responseUrl`
   - `cancelUrl`
4. pass `webhook_url` pointing at `fal-webhook`
5. let the webhook mark the job terminal when possible
6. keep polling as fallback and recovery

This is the current reliability pattern for:

- world-build image jobs
- cinematic still/storyboard preview jobs
- Trellis mesh jobs

Do not rely on `providerRequestId` alone if Fal already returned exact queue URLs.

### Fal Webhook Verification

`fal-webhook` is server-to-server and should not use `requireUserClient()`.

It must:

- set `verify_jwt = false`
- verify Fal's signed webhook headers against Fal's JWKS
- reject missing headers, stale timestamps, and bad signatures
- be idempotent for repeated deliveries of the same `request_id`

Fal docs currently require:

- headers:
  - `X-Fal-Webhook-Request-Id`
  - `X-Fal-Webhook-User-Id`
  - `X-Fal-Webhook-Timestamp`
  - `X-Fal-Webhook-Signature`
- body hash:
  - SHA-256 of the raw request body
- signature message:
  - `request_id`
  - `user_id`
  - `timestamp`
  - hex body hash
  joined with newline characters

### Webhook Completion Rules

Use the webhook as the primary fast-path, but do not make it the only completion mechanism.

If webhook status is terminal failure:

- mark the job `failed`
- mark the reserved asset/resource failed
- stop polling on the next client/server reconciliation

If webhook status is `OK` and the payload is usable:

- complete the reserved asset/resource immediately
- mark the job `succeeded`

If webhook status is `OK` but the payload is missing, null, or unusable:

- do not mark the job failed just from that
- record webhook diagnostics
- leave the job `running`
- let polling fall back to `responseUrl`

This avoids false failures when Fal sends a completion notification but the webhook payload is not sufficient to materialize the final result directly.

## Gateway Health Check

`ACTIVE` in the management API is not enough. A function can still be broken on the public gateway.

If the browser shows a preflight or CORS failure, test the endpoint directly:

```powershell
curl.exe -i -X OPTIONS "https://<project-ref>.supabase.co/functions/v1/<slug>" `
  -H "Origin: http://localhost:5173" `
  -H "Access-Control-Request-Method: POST" `
  -H "Access-Control-Request-Headers: authorization,apikey,content-type,x-client-info"
```

Expected result:

- `200 OK`

If you get `404 Requested function was not found`, the public function registration is broken even if `functions list` says the function is active.

## Recovery When Remote State Is Broken

If the public gateway registration is broken:

```powershell
npx supabase functions delete <name> --project-ref <project-ref> --yes
npx supabase functions deploy <name> --project-ref <project-ref> --no-verify-jwt
```

## Long-Running Provider Queue Pattern

For provider jobs that can exceed normal edge-function request windows, do not block inside the start function waiting for final media output.

Use this pattern instead:

1. `start-*` reserves the final logical asset row up front.
2. `start-*` binds that asset key to the graph or definition immediately.
3. `start-*` submits the provider job and persists:
   - `provider_request_id`
   - provider `status_url`
   - provider `response_url`
4. `start-*` returns quickly with a `queued` or `running` job.
5. `poll-*` uses the persisted provider URLs to check status and fetch the final result.
6. `poll-*` updates the same reserved asset row in place and marks the job/run terminal.

Do not rely on a single blocking `subscribe` request for jobs that may take a long time. Supabase can terminate long requests with platform time limits such as:

- `504 Gateway Timeout`
- `IDLE_TIMEOUT`
- `Request idle timeout limit (150s) reached`

### Fal Queue Rules

For Fal queue-based image and video jobs:

- treat `submit` as the authoritative start step
- persist the exact `status_url` and `response_url` returned by Fal
- prefer those stored URLs during polling instead of rebuilding queue paths manually

Why this matters:

- provider queue URL formats can differ by model or API version
- guessed paths can return `405` or `404` even when the job itself exists
- a valid `provider_request_id` alone is not enough if the poller hits the wrong endpoint

### GraphCore Cinematic Preview Rules

For cinematic preview stills and storyboards:

- reserve one real `project_assets.key` at start
- never create a second final asset for the same preview
- store the Fal queue URLs on the cinematic job `result_context`
- keep the graph binding pointed at that reserved key from the start
- let polling complete the asset row in place

This keeps the successful asset contract aligned with the world-build image path:

- one key
- one asset row
- one final URL handoff

### Debugging Checklist For Stuck Polling Jobs

If a run keeps polling forever:

1. Check the DB row for `provider_request_id`.
   If missing, submission never completed.
2. Check whether `statusUrl` and `responseUrl` were persisted in `result_context`.
   If missing, the start step did not capture the provider queue URLs correctly.
3. Check server logs for the raw provider result and status payloads.
4. Check whether the reserved asset row is still a placeholder.
   If yes, the failure is before asset completion.
5. Prefer logging:
   - request id
   - HTTP status
   - raw response text
   - parsed JSON body

Do not assume an empty parsed body means the provider returned nothing useful. It may mean:

- the endpoint path is wrong
- the provider returned non-JSON text
- the response body shape changed

### Prompt Compilation Rule

If a generation prompt must reflect live project settings, compile it fresh inside `start-*` for every new run. Do not reuse a previous stored prompt when the user clicks generate again.

For cinematic storyboard stills specifically:

- rebuild the prompt on every fresh `Generate Storyboard`
- read art-style data from the current snapshot
- pass reference images separately via provider inputs, not only as text inside the prompt

Then re-run the `OPTIONS` check.

## Auth Failure Triage

`{"code":401,"message":"Invalid JWT"}`

- Supabase gateway or client session issue
- validate token with `supabase.auth.getUser(session.access_token)`
- refresh session
- sign out and sign back in if still bad

`User context is required to access this function.`

- request reached the function
- `requireUserClient()` rejected the request

Browser CORS failure on preflight:

- usually remote deploy, registration, or gateway config issue
- not usually frontend code

## Import and Bundling Rules

- Do not import frontend-heavy modules into Edge Functions.
- Prefer small server-safe helpers under `supabase/functions/_shared/`.
- If shared placeholder or scaffold logic is needed by a function, keep it in a server-safe file.

## Import Map and Deno Hygiene

- Each function that relies on npm imports should have a valid `deno.json`.
- Keep imports explicit and consistent.
- Use `import { z } from 'npm:zod@4'` across functions.

## Be Careful With `functions download`

`npx supabase functions download ...` can overwrite local source files in place.

If you use it:

1. check local diffs immediately
2. verify shared helpers were not reverted
3. redeploy only after re-confirming local code

## Compare Against `prompt-patch`

If a new AI function behaves strangely, compare it with `prompt-patch`:

- auth model
- OpenAI request shape
- parse and validation flow
- final error handling

That path has been the most reliable reference for what actually works in GraphCore.

## World-Build Notes

- `plan-world-build` should request exact top-level keys and validate planner output after loose parse.
- `start-world-build` should scaffold placeholders and jobs only.
- `poll-world-build` should treat AI content generation the same way: loose parse first, then `safeParse`, then clear error shaping.
- world-build placeholder deletion should delete both local and remote placeholder state when the resource is managed by `metadata.generation.source === 'global_prompt'`.

## Minimum Verification

After changes:

1. run `npm run build`
2. verify remote function state with `functions list`
3. test endpoint health if needed with `curl.exe -X OPTIONS`
4. test in app

If the app still fails, capture:

- browser console error
- network response body
- relevant Supabase function log lines

## Fresh Context Checklist

When starting from a fresh context window:

1. inspect `prompt-patch`, `_shared/auth.ts`, `_shared/http.ts`, and the target function
2. check remote function state with `npx supabase functions list --project-ref <ref> -o json`
3. confirm `verify_jwt` expectations in `supabase/config.toml`
4. use `requireUserClient`, `maybeHandleOptions`, and `errorResponse`
5. use the Responses `json_object` pattern if AI is involved
6. use loose parse plus `safeParse`
7. add env-gated debug logs if needed
8. deploy with `--no-verify-jwt` for app-facing functions
9. re-check version and `verify_jwt`
10. test in app and classify the failure as gateway, auth, function logic, or AI output shape
