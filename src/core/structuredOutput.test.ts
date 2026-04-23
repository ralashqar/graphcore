import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeStrictJsonSchema } from '../../supabase/functions/_shared/structured-output.ts'

test('normalizeStrictJsonSchema removes unsupported dynamic object keywords', () => {
  const normalized = normalizeStrictJsonSchema({
    type: 'object',
    properties: {
      metadata: {
        type: 'object',
        propertyNames: { type: 'string' },
        patternProperties: {
          '^x-': { type: 'string' },
        },
        additionalProperties: {
          type: 'string',
        },
      },
    },
  })

  assert.deepEqual(normalized, {
    type: 'object',
    properties: {
      metadata: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
    required: ['metadata'],
    additionalProperties: false,
  })
})

test('normalizeStrictJsonSchema rewrites oneOf to anyOf and preserves supported defs', () => {
  const normalized = normalizeStrictJsonSchema({
    type: 'object',
    properties: {
      subject: {
        oneOf: [
          { type: 'string', minLength: 1 },
          { type: ['string', 'null'] },
        ],
      },
      step: {
        $ref: '#/$defs/step',
      },
    },
    $defs: {
      step: {
        type: 'object',
        properties: {
          explanation: { type: 'string' },
          output: { type: 'string' },
        },
      },
    },
  })

  assert.deepEqual(normalized, {
    type: 'object',
    properties: {
      subject: {
        anyOf: [
          { type: 'string', minLength: 1 },
          { type: ['string', 'null'] },
        ],
      },
      step: {
        $ref: '#/$defs/step',
      },
    },
    required: ['subject', 'step'],
    additionalProperties: false,
    $defs: {
      step: {
        type: 'object',
        properties: {
          explanation: { type: 'string' },
          output: { type: 'string' },
        },
        required: ['explanation', 'output'],
        additionalProperties: false,
      },
    },
  })
})
