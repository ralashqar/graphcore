export type StreamingJsonRecordParseResult<TRecord> = {
  record: TRecord | null
  error: unknown
}

export type StreamingJsonlProcessorStats = {
  acceptedRecordCount: number
  warningCount: number
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
