export type JsonSchema =
  | boolean
  | {
      type?: string | string[]
      description?: string
      title?: string
      properties?: Record<string, JsonSchema>
      items?: JsonSchema
      anyOf?: JsonSchema[]
      oneOf?: JsonSchema[]
      required?: string[]
      additionalProperties?: boolean | JsonSchema
      enum?: unknown[]
      const?: unknown
      $defs?: Record<string, JsonSchema>
      $ref?: string
      pattern?: string
      format?: string
      minLength?: number
      maxLength?: number
      minimum?: number
      maximum?: number
      exclusiveMinimum?: number
      exclusiveMaximum?: number
      multipleOf?: number
      minItems?: number
      maxItems?: number
      [key: string]: unknown
    }

const SUPPORTED_SCHEMA_KEYS = new Set([
  '$defs',
  '$ref',
  'additionalProperties',
  'anyOf',
  'const',
  'description',
  'enum',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'format',
  'items',
  'maxItems',
  'maxLength',
  'maximum',
  'minItems',
  'minLength',
  'minimum',
  'multipleOf',
  'pattern',
  'properties',
  'required',
  'title',
  'type',
])

function asArray<T>(value: T | T[] | undefined) {
  if (Array.isArray(value)) {
    return value
  }

  return value === undefined ? [] : [value]
}

function pickSupportedKeys(schema: Exclude<JsonSchema, boolean>) {
  return Object.fromEntries(
    Object.entries(schema).filter(([key]) => SUPPORTED_SCHEMA_KEYS.has(key)),
  ) as Record<string, unknown>
}

function normalizeDefinitions(definitions: Record<string, JsonSchema> | undefined) {
  if (!definitions || typeof definitions !== 'object') {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(definitions).map(([key, value]) => [key, normalizeStrictJsonSchema(value)]),
  )
}

function normalizeObjectSchema(
  schema: Exclude<JsonSchema, boolean>,
  normalized: Record<string, unknown>,
  types: string[],
) {
  const hasObjectType = types.includes('object') || typeof schema.properties === 'object'
  if (!hasObjectType) {
    return
  }

  const hasExplicitProperties = schema.properties && typeof schema.properties === 'object'
  if (hasExplicitProperties) {
    const nextProperties = Object.fromEntries(
      Object.entries(schema.properties as Record<string, JsonSchema>).map(([key, value]) => [
        key,
        normalizeStrictJsonSchema(value),
      ]),
    )

    normalized.type = types.length > 0 ? schema.type : 'object'
    normalized.properties = nextProperties
    normalized.required = Object.keys(nextProperties)
    normalized.additionalProperties = false
    return
  }

  const usesUnsupportedDynamicObjectFeatures =
    'propertyNames' in schema
    || 'patternProperties' in schema
    || 'unevaluatedProperties' in schema
    || (schema.additionalProperties && typeof schema.additionalProperties === 'object')

  if (usesUnsupportedDynamicObjectFeatures || !('properties' in normalized)) {
    normalized.type = types.length > 0 ? schema.type : 'object'
    normalized.properties = {}
    normalized.required = []
    normalized.additionalProperties = false
  }
}

export function normalizeStrictJsonSchema(schema: JsonSchema): JsonSchema {
  if (typeof schema === 'boolean') {
    return schema
  }

  if (typeof schema.$ref === 'string') {
    const refSchema: Record<string, unknown> = { $ref: schema.$ref }
    if (typeof schema.description === 'string') {
      refSchema.description = schema.description
    }
    if (typeof schema.title === 'string') {
      refSchema.title = schema.title
    }
    return refSchema
  }

  const normalized = pickSupportedKeys(schema)
  const types = asArray(schema.type)

  const definitions = normalizeDefinitions(schema.$defs)
  if (definitions) {
    normalized.$defs = definitions
  }

  if (schema.items && typeof schema.items === 'object') {
    normalized.items = normalizeStrictJsonSchema(schema.items)
  }

  if (Array.isArray(schema.anyOf)) {
    normalized.anyOf = schema.anyOf.map((entry) => normalizeStrictJsonSchema(entry))
  }

  if (Array.isArray(schema.oneOf)) {
    normalized.anyOf = schema.oneOf.map((entry) => normalizeStrictJsonSchema(entry))
  }

  normalizeObjectSchema(schema, normalized, types)

  return normalized
}
