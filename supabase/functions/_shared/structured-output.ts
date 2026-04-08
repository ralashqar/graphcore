export type JsonSchema =
  | boolean
  | {
      type?: string | string[]
      properties?: Record<string, JsonSchema>
      items?: JsonSchema
      anyOf?: JsonSchema[]
      required?: string[]
      additionalProperties?: boolean
      [key: string]: unknown
    }

function asArray<T>(value: T | T[] | undefined) {
  if (Array.isArray(value)) {
    return value
  }

  return value === undefined ? [] : [value]
}

export function normalizeStrictJsonSchema(schema: JsonSchema): JsonSchema {
  if (typeof schema === 'boolean') {
    return schema
  }

  const normalized: Record<string, unknown> = { ...schema }
  const types = asArray(schema.type)

  if (schema.properties && typeof schema.properties === 'object') {
    const nextProperties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, normalizeStrictJsonSchema(value)]),
    )

    normalized.properties = nextProperties
    normalized.required = Object.keys(nextProperties)
    normalized.additionalProperties = false
  }

  if (schema.items && typeof schema.items === 'object') {
    normalized.items = normalizeStrictJsonSchema(schema.items)
  }

  if (Array.isArray(schema.anyOf)) {
    normalized.anyOf = schema.anyOf.map((entry) => normalizeStrictJsonSchema(entry))
  }

  if (types.includes('object') && !schema.properties) {
    normalized.additionalProperties = false
    normalized.required = Array.isArray(schema.required) ? schema.required : []
  }

  return normalized
}
