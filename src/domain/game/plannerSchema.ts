import { z } from 'zod'

/** OpenAI structured output supports homogeneous arrays, not JSON Schema tuples.
 * Keep the original Zod schema for parsing responses and enforcing refinements.
 */
export function gamePlannerJsonSchema(schema: z.ZodType) {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit)
    if (!value || typeof value !== 'object') return value
    const source = value as Record<string, unknown>
    const result = Object.fromEntries(Object.entries(source).map(([key, child]) => [key, visit(child)]))
    if (Array.isArray(source.prefixItems)) {
      const elements = source.prefixItems.map(visit)
      if (!elements.length || elements.some(item => JSON.stringify(item) !== JSON.stringify(elements[0]))) {
        throw new Error('Game planner requires homogeneous nonempty tuples')
      }
      if (source.items && source.items !== false) throw new Error('Game planner does not support variadic tuples')
      delete result.prefixItems
      result.items = elements[0]
      result.minItems = elements.length
      result.maxItems = elements.length
    }
    return result
  }
  return visit(z.toJSONSchema(schema)) as Record<string, unknown>
}
