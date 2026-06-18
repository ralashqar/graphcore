import {
  buildWorkflowStreamingMetadata,
  type WorkflowStreamingMetadata,
} from '../../../src/domain/outputWorkflowManifests.ts'
import {
  runOpenAiResponsesStream,
  type OpenAiResponseResult,
  type OpenAiResponsesRequest,
} from './openai.ts'

export type StreamingJsonRecordParseResult<TRecord> = {
  record: TRecord | null
  error: unknown
}

export type StreamingJsonlProcessorStats = {
  acceptedRecordCount: number
  warningCount: number
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function extractCompleteJsonRecords(buffer: string) {
  const records: string[] = []
  let current = ''
  let started = false
  let inString = false
  let escaped = false
  let depth = 0
  let lastConsumedIndex = 0

  for (let index = 0; index < buffer.length; index += 1) {
    const char = buffer[index]
    if (!started) {
      if (char === '{') {
        started = true
        inString = false
        escaped = false
        depth = 1
        current = '{'
        lastConsumedIndex = index + 1
      }
      continue
    }

    if (inString) {
      if (escaped) {
        current += char
        escaped = false
      } else if (char === '\\') {
        current += char
        escaped = true
      } else if (char === '"') {
        current += char
        inString = false
      } else if (char === '\n') {
        current += '\\n'
      } else if (char !== '\r') {
        current += char
      }
      continue
    }

    current += char
    if (char === '"') {
      inString = true
    } else if (char === '{' || char === '[') {
      depth += 1
    } else if (char === '}' || char === ']') {
      depth -= 1
      if (depth === 0) {
        records.push(current.trim())
        current = ''
        started = false
        inString = false
        escaped = false
        lastConsumedIndex = index + 1
      }
    }
  }

  return {
    records,
    rest: started ? current : buffer.slice(lastConsumedIndex),
  }
}

export function createStreamingJsonlProcessor<TRecord>(input: {
  parseRecord: (recordText: string) => StreamingJsonRecordParseResult<TRecord>
  onRecord: (record: TRecord, recordText: string, stats: StreamingJsonlProcessorStats) => Promise<void> | void
  onInvalidRecord: (error: unknown, recordText: string, stats: StreamingJsonlProcessorStats) => Promise<void> | void
}) {
  let buffer = ''
  let acceptedRecordCount = 0
  let warningCount = 0

  const processRecordText = async (recordText: string) => {
    const parsed = input.parseRecord(recordText)
    if (!parsed.record) {
      warningCount += 1
      await input.onInvalidRecord(parsed.error, recordText, { acceptedRecordCount, warningCount })
      return
    }
    acceptedRecordCount += 1
    await input.onRecord(parsed.record, recordText, { acceptedRecordCount, warningCount })
  }

  return {
    get acceptedRecordCount() {
      return acceptedRecordCount
    },
    get warningCount() {
      return warningCount
    },
    get bufferedText() {
      return buffer
    },
    async push(delta: string) {
      buffer += delta
      const extracted = extractCompleteJsonRecords(buffer)
      buffer = extracted.rest
      for (const record of extracted.records) await processRecordText(record)
    },
    async flush() {
      if (buffer.trim().startsWith('{')) {
        const record = buffer
        buffer = ''
        await processRecordText(record)
      }
    },
  }
}

export type OpenAiJsonlStreamProgress = {
  providerRequestId: string
  providerStatus: string
  providerMode: string
  lastProviderPollAt: string
  providerStartedAt: string
  streaming: WorkflowStreamingMetadata
  streamingStatus: WorkflowStreamingMetadata['status']
  streamingEventCount: number
  streamingWarningCount: number
  streamingPartialArtifactKeys: string[]
}

export async function runOpenAiJsonlStream<TRecord>(input: {
  request: OpenAiResponsesRequest
  parseRecord: (recordText: string) => StreamingJsonRecordParseResult<TRecord>
  onRecord: (record: TRecord, recordText: string, stats: StreamingJsonlProcessorStats) => Promise<void> | void
  onInvalidRecord: (error: unknown, recordText: string, stats: StreamingJsonlProcessorStats) => Promise<void> | void
  shouldCancel?: () => Promise<boolean>
  createCancelledError?: () => Error
  onProviderRequestId?: (providerRequestId: string) => Promise<void> | void
  onProgress?: (progress: OpenAiJsonlStreamProgress) => Promise<void>
  progressIntervalMs?: number
}): Promise<{
  response: OpenAiResponseResult
  providerRequestId: string
  providerStartedAt: string
  acceptedRecordCount: number
  warningCount: number
}> {
  const providerStartedAt = new Date().toISOString()
  let providerRequestId = ''
  let lastProgressAt = 0
  const progressIntervalMs = Math.max(1_000, input.progressIntervalMs ?? 15_000)

  const streamProcessor = createStreamingJsonlProcessor<TRecord>({
    parseRecord: input.parseRecord,
    onRecord: input.onRecord,
    onInvalidRecord: input.onInvalidRecord,
  })

  const progress = async (providerStatus: string, force = false) => {
    const now = Date.now()
    if (!force && now - lastProgressAt < progressIntervalMs) return
    lastProgressAt = now
    const streaming = buildWorkflowStreamingMetadata({
      status: providerStatus === 'completed' ? 'completed' : providerStatus === 'failed' ? 'failed' : 'streaming',
      providerRequestId,
      providerStatus,
      eventCount: streamProcessor.acceptedRecordCount,
      warningCount: streamProcessor.warningCount,
      lastEventAt: new Date().toISOString(),
    })
    await input.onProgress?.({
      providerRequestId,
      providerStatus,
      providerMode: 'stream',
      lastProviderPollAt: new Date().toISOString(),
      providerStartedAt,
      streaming,
      streamingStatus: streaming.status,
      streamingEventCount: streaming.eventCount,
      streamingWarningCount: streaming.warningCount,
      streamingPartialArtifactKeys: streaming.partialArtifactKeys,
    })
  }

  await progress('streaming', true)

  const response = await runOpenAiResponsesStream(input.request, {
    onEvent: async (event) => {
      const responseRecord = asRecord(event.data.response)
      providerRequestId = readText(responseRecord.id) || readText(event.data.response_id) || readText(event.data.id) || providerRequestId
      if (providerRequestId) await input.onProviderRequestId?.(providerRequestId)
      await progress(event.type)
      if (await input.shouldCancel?.()) throw input.createCancelledError?.() ?? new Error('OpenAI JSONL stream was cancelled.')
    },
    onTextDelta: async (delta) => {
      await streamProcessor.push(delta)
      await progress('streaming')
    },
  })
  providerRequestId = response.id || providerRequestId
  if (providerRequestId) await input.onProviderRequestId?.(providerRequestId)
  await streamProcessor.flush()
  await progress('completed', true)

  return {
    response,
    providerRequestId,
    providerStartedAt,
    acceptedRecordCount: streamProcessor.acceptedRecordCount,
    warningCount: streamProcessor.warningCount,
  }
}
