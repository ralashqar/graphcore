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
