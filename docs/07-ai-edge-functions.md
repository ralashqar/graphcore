# AI Edge Functions

GraphCore now includes two protected Supabase Edge Functions for provider-backed AI calls:

- `ai-openai`
- `ai-fal`

Both functions require a valid Supabase `Authorization` header and read provider credentials from Supabase secrets, not from the browser.

## Secret Setup

Hosted project:

```bash
npx supabase secrets set --project-ref znwdatidqdkzidempvkt OPENAI_API_KEY=your_openai_key FAL_KEY=your_fal_key
```

Local project:

```bash
npx supabase secrets set OPENAI_API_KEY=your_openai_key FAL_KEY=your_fal_key
```

Optional OpenAI base URL override:

```bash
npx supabase secrets set --project-ref znwdatidqdkzidempvkt OPENAI_BASE_URL=https://api.openai.com/v1
```

Useful commands:

```bash
npx supabase secrets list --project-ref znwdatidqdkzidempvkt
npx supabase functions deploy ai-openai --project-ref znwdatidqdkzidempvkt
npx supabase functions deploy ai-fal --project-ref znwdatidqdkzidempvkt
```

You can also set the same secrets in the Supabase dashboard under project secrets / edge function secrets, then redeploy the functions.

## Frontend Callers

Use the typed client wrappers in [aiGateway.ts](C:/Users/daruk/Projects/GraphCore/graphcore/src/data/aiGateway.ts):

- `invokeOpenAiResponses(request)`
- `invokeFal(request)`

Both wrappers use `supabase.functions.invoke(...)` and send the current user session automatically through the browser client.

## OpenAI Request Shape

Function name: `ai-openai`

```ts
type OpenAiResponsesRequest = {
  model: string
  input: string | Array<Record<string, unknown>>
  instructions?: string
  temperature?: number
  maxOutputTokens?: number
  metadata?: Record<string, string>
  reasoning?: Record<string, unknown>
  text?: Record<string, unknown>
  tools?: Array<Record<string, unknown>>
  toolChoice?: string | Record<string, unknown>
  previousResponseId?: string
  store?: boolean
  extraBody?: Record<string, unknown>
}
```

Example for graph generation:

```ts
await invokeOpenAiResponses({
  model: 'gpt-5.4-mini',
  input: [
    {
      role: 'system',
      content: [{ type: 'input_text', text: 'Generate GraphCore graph patch JSON only.' }],
    },
    {
      role: 'user',
      content: [{ type: 'input_text', text: 'Create a haunted bridge narrative graph with 3 branches.' }],
    },
  ],
  text: {
    format: {
      type: 'json_schema',
      name: 'graph_patch',
      schema: {
        type: 'object',
        additionalProperties: false,
      },
    },
  },
  reasoning: { effort: 'medium' },
  maxOutputTokens: 4000,
  metadata: { feature: 'graph-prompt' },
  store: false,
})
```

Normalized response:

```ts
type OpenAiResponsesResult = {
  provider: 'openai'
  model: string
  responseId: string | null
  requestId: string | null
  outputText: string
  output: unknown[]
  usage: unknown
  raw: Record<string, unknown>
}
```

## Fal Request Shape

Function name: `ai-fal`

Default model: `fal-ai/nano-banana-2/edit`

```ts
type FalInvokeRequest = {
  action?: 'submit' | 'status' | 'result' | 'cancel' | 'subscribe'
  model?: string
  input?: Record<string, unknown>
  requestId?: string
  logs?: boolean
  webhookUrl?: string
  headers?: Record<string, string>
  startTimeout?: number
  hint?: string
  priority?: 'normal' | 'low'
  timeoutMs?: number
  pollIntervalMs?: number
}
```

Example blocking image edit call:

```ts
await invokeFal({
  action: 'subscribe',
  model: 'fal-ai/nano-banana-2/edit',
  input: {
    prompt: 'Turn this story scene into a moody moonlit bridge encounter.',
    image_urls: ['https://your-public-input-image.png'],
    num_images: 1,
    aspect_ratio: '16:9',
    output_format: 'png',
    resolution: '1K',
  },
  logs: true,
  timeoutMs: 120000,
})
```

Queue-first flow:

1. `submit`
2. `status`
3. `result`

Normalized response:

```ts
type FalInvokeResult = {
  provider: 'fal'
  action: 'submit' | 'status' | 'result' | 'cancel' | 'subscribe'
  model: string
  requestId: string | null
  status?: string
  statusData?: Record<string, unknown>
  data: Record<string, unknown>
  error?: string
}
```

## Deployment Notes

- `ai-openai` sends requests to OpenAI's `/v1/responses` API.
- `ai-fal` uses Fal's queue endpoints and supports `submit`, `status`, `result`, `cancel`, and a server-side polling `subscribe` mode.
- Both functions are intentionally provider-generic enough that the graph prompt feature can call them directly before we wire prompt-to-patch generation on top.
