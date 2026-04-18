// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildProviderQueueColumns,
  buildProviderQueueResultContextPatch,
  extractProviderQueueHandleFromBody,
  normalizeProviderQueueHandle,
} from './providerQueue.ts'

test('provider queue normalization prefers explicit overrides and nested workflow queue metadata', () => {
  const handle = normalizeProviderQueueHandle({
    resultContext: {
      providerRequestId: 'legacy_req',
      workflow: {
        providerQueue: {
          providerRequestId: 'workflow_req',
          statusUrl: ' https://status.example ',
        },
      },
    },
    overrides: {
      providerRequestId: 'override_req',
      responseUrl: 'https://response.example',
    },
  })

  assert.equal(handle.providerRequestId, 'override_req')
  assert.equal(handle.statusUrl, 'https://status.example')
  assert.equal(handle.responseUrl, 'https://response.example')
})

test('provider queue body extraction handles fal queue url shapes', () => {
  const handle = extractProviderQueueHandleFromBody({
    request_id: 'req_123',
    urls: {
      status: 'https://queue.example/status',
      response_url: 'https://queue.example/result',
    },
    cancel_url: 'https://queue.example/cancel',
  })

  assert.deepEqual(buildProviderQueueColumns(handle), {
    provider_request_id: 'req_123',
    status_url: 'https://queue.example/status',
    response_url: 'https://queue.example/result',
    cancel_url: 'https://queue.example/cancel',
  })
  assert.equal(buildProviderQueueResultContextPatch(handle).requestId, 'req_123')
})
