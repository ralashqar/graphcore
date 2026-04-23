# OpenAI Structured Output Schema Rules

This repo sends strict JSON Schemas to the OpenAI Responses structured-output path from:

- `C:\Users\daruk\Projects\GraphCore\graphcore\supabase\functions\_shared\world-prompt.ts`
- `C:\Users\daruk\Projects\GraphCore\graphcore\supabase\functions\_shared\world-graph.ts`

The shared normalizer lives in:

- `C:\Users\daruk\Projects\GraphCore\graphcore\supabase\functions\_shared\structured-output.ts`

## Why this exists

OpenAI Structured Outputs only supports a subset of JSON Schema. If we pass unsupported object-schema keywords such as `propertyNames` or `patternProperties`, the request is rejected before the model runs.

We do **not** want to fix these failures keyword-by-keyword at each call site. The shared normalizer should be the one place that converts general Zod-generated JSON Schema into the stricter subset we actually send.

## Rules we enforce

### 1. Root and nested objects stay strict

For every object schema we send:

- `additionalProperties: false`
- every declared key is listed in `required`

This follows the OpenAI structured-output requirements.

### 2. We preserve only the safe subset we rely on

The normalizer preserves these schema keys:

- `$defs`
- `$ref`
- `type`
- `description`
- `title`
- `properties`
- `required`
- `additionalProperties`
- `items`
- `enum`
- `const`
- `anyOf`
- `pattern`
- `format`
- `minLength`
- `maxLength`
- `minimum`
- `maximum`
- `exclusiveMinimum`
- `exclusiveMaximum`
- `multipleOf`
- `minItems`
- `maxItems`

### 3. Unsupported composition is not forwarded

We normalize:

- `oneOf` -> `anyOf`

And we intentionally do **not** forward unsupported dynamic-object features like:

- `propertyNames`
- `patternProperties`
- `unevaluatedProperties`
- object-valued `additionalProperties`

### 4. Record-like objects are collapsed

Zod record-like schemas often serialize into object schemas that rely on dynamic keys. That shape is not safe for strict OpenAI structured outputs.

When we detect that pattern, we rewrite the schema to:

```json
{
  "type": "object",
  "properties": {},
  "required": [],
  "additionalProperties": false
}
```

This is intentionally conservative. If we actually need arbitrary key/value generation later, that should be represented explicitly in a supported schema shape rather than leaking a dynamic object schema into the Responses API.

## Practical authoring guidance

When adding or changing Zod schemas used for OpenAI structured outputs:

1. Prefer explicit object fields over `z.record(...)`.
2. Prefer unions that normalize to `anyOf`, not root-level discriminated unions.
3. Treat optional fields as required-with-null where needed.
4. Keep nested object counts and total schema size modest.
5. If you add new JSON Schema features, verify they are supported in the official OpenAI docs before preserving them in the shared normalizer.

## Regression protection

Regression coverage lives in:

- `C:\Users\daruk\Projects\GraphCore\graphcore\src\core\structuredOutput.test.ts`

Those tests specifically guard:

- stripping unsupported dynamic object keywords
- collapsing record-like object schemas
- rewriting `oneOf` to `anyOf`
- preserving supported `$defs` / `$ref` shapes

## References

- OpenAI Structured Outputs guide:
  - <https://platform.openai.com/docs/guides/structured-outputs?lang=javascript>
- OpenAI Responses API reference:
  - <https://platform.openai.com/docs/api-reference/responses/compact?api-mode=responses>
