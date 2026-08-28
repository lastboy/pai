import { isRealUserPrompt } from './parser.js'

// Experimental: ordered per-event view of a transcript, used by experiments
// that need conversational context rather than aggregate stats.
export type TranscriptEvent =
  | { kind: 'user'; timestamp?: string; text: string }
  | { kind: 'assistant'; timestamp?: string; text: string }
  | { kind: 'tool'; timestamp?: string; name: string; target?: string; failed: boolean }

function toolTarget(name: string, input: Record<string, unknown>): string | undefined {
  const key = name === 'Bash' ? 'command' : name === 'NotebookEdit' ? 'notebook_path' : 'file_path'
  return typeof input[key] === 'string' ? (input[key] as string) : undefined
}

export function parseEvents(jsonl: string): TranscriptEvent[] {
  const events: TranscriptEvent[] = []
  const toolEventsByUseId = new Map<string, TranscriptEvent & { kind: 'tool' }>()

  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue
    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }
    if (entry === null || typeof entry !== 'object') continue
    if (entry['type'] !== 'user' && entry['type'] !== 'assistant') continue
    if (entry['isSidechain'] === true || entry['isMeta'] === true) continue
    const message = entry['message'] as Record<string, unknown> | undefined
    if (!message || typeof message !== 'object') continue
    const timestamp = typeof entry['timestamp'] === 'string' ? entry['timestamp'] : undefined
    const content = message['content']

    if (entry['type'] === 'user') {
      if (typeof content === 'string') {
        const text = content.trim()
        if (isRealUserPrompt(text)) events.push({ kind: 'user', timestamp, text })
      } else if (Array.isArray(content)) {
        for (const block of content as Array<Record<string, unknown>>) {
          if (
            block?.['type'] === 'tool_result' &&
            block['is_error'] === true &&
            typeof block['tool_use_id'] === 'string'
          ) {
            const call = toolEventsByUseId.get(block['tool_use_id'])
            if (call) call.failed = true
          }
        }
      }
    } else if (Array.isArray(content)) {
      for (const block of content as Array<Record<string, unknown>>) {
        if (block?.['type'] === 'text' && typeof block['text'] === 'string') {
          const text = block['text'].trim()
          if (text) events.push({ kind: 'assistant', timestamp, text })
        } else if (block?.['type'] === 'tool_use' && typeof block['name'] === 'string') {
          const event: TranscriptEvent & { kind: 'tool' } = {
            kind: 'tool',
            timestamp,
            name: block['name'],
            target: toolTarget(
              block['name'],
              (block['input'] ?? {}) as Record<string, unknown>,
            ),
            failed: false,
          }
          events.push(event)
          if (typeof block['id'] === 'string') toolEventsByUseId.set(block['id'], event)
        }
      }
    }
  }
  return events
}
