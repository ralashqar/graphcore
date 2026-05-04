import test from 'node:test'
import assert from 'node:assert/strict'

import { parseOpenAiResponseStatus } from './openai.ts'

test('background response helper parses provider status and output text', () => {
  const parsed = parseOpenAiResponseStatus({
    id: 'resp_test',
    status: 'completed',
    output: [{
      content: [{ type: 'output_text', text: 'Finished section text.' }],
    }],
  })

  assert.equal(parsed.id, 'resp_test')
  assert.equal(parsed.status, 'completed')
  assert.equal(parsed.outputText, 'Finished section text.')
})
