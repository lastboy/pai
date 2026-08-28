import type { Session, ToolCall, UserMessage } from '../../core/session.js'

// Maps Claude Code tool names to normalized kinds. Anything unknown is 'other'.
function normalizeToolCall(name: string, input: unknown): ToolCall {
  const inputObj = (input ?? {}) as Record<string, unknown>
  const str = (key: string): string | undefined =>
    typeof inputObj[key] === 'string' ? (inputObj[key] as string) : undefined

  switch (name) {
    case 'Read':
      return { name, kind: 'file-read', target: str('file_path'), failed: false }
    case 'Edit':
    case 'Write':
      return { name, kind: 'file-write', target: str('file_path'), failed: false }
    case 'NotebookEdit':
      return { name, kind: 'file-write', target: str('notebook_path'), failed: false }
    case 'Bash':
      return { name, kind: 'command', target: str('command'), failed: false }
    default:
      return { name, kind: 'other', failed: false }
  }
}

// Real user prompts are string content; strings starting with '<' or '['
// are UI artifacts (slash-command XML, "[Request interrupted...]").
export function isRealUserPrompt(text: string): boolean {
  return text.length > 0 && !text.startsWith('<') && !text.startsWith('[')
}

export function parseTranscript(jsonl: string, sessionId: string): Session {
  const userMessages: UserMessage[] = []
  const toolCalls: ToolCall[] = []
  const callsByToolUseId = new Map<string, ToolCall>()
  const assistantMessageIds = new Set<string>()
  let title: string | undefined
  let model: string | undefined
  let startedAt: Date | undefined
  let endedAt: Date | undefined

  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue
    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }
    if (entry === null || typeof entry !== 'object') continue
    if (entry['type'] === 'ai-title') {
      // Title lines repeat as the session evolves — the last one wins.
      if (typeof entry['aiTitle'] === 'string') title = entry['aiTitle']
      continue
    }
    if (entry['type'] !== 'user' && entry['type'] !== 'assistant') continue
    if (entry['isSidechain'] === true || entry['isMeta'] === true) continue
    const message = entry['message'] as Record<string, unknown> | undefined
    if (!message || typeof message !== 'object') continue

    if (typeof entry['timestamp'] === 'string') {
      const ts = new Date(entry['timestamp'])
      if (!Number.isNaN(ts.getTime())) {
        if (!startedAt || ts < startedAt) startedAt = ts
        if (!endedAt || ts > endedAt) endedAt = ts
      }
    }

    const content = message['content']
    if (entry['type'] === 'user') {
      if (typeof content === 'string') {
        const text = content.trim()
        if (isRealUserPrompt(text)) {
          userMessages.push({
            timestamp: typeof entry['timestamp'] === 'string' ? entry['timestamp'] : undefined,
            text,
          })
        }
      } else if (Array.isArray(content)) {
        for (const block of content as Array<Record<string, unknown>>) {
          if (
            block?.['type'] === 'tool_result' &&
            block['is_error'] === true &&
            typeof block['tool_use_id'] === 'string'
          ) {
            const call = callsByToolUseId.get(block['tool_use_id'])
            if (call) call.failed = true
          }
        }
      }
    } else {
      if (typeof message['model'] === 'string') model = message['model']
      if (typeof message['id'] === 'string') assistantMessageIds.add(message['id'])
      if (Array.isArray(content)) {
        for (const block of content as Array<Record<string, unknown>>) {
          if (block?.['type'] === 'tool_use' && typeof block['name'] === 'string') {
            const call = normalizeToolCall(block['name'], block['input'])
            toolCalls.push(call)
            if (typeof block['id'] === 'string') callsByToolUseId.set(block['id'], call)
          }
        }
      }
    }
  }

  return {
    id: sessionId,
    title,
    model,
    startedAt,
    endedAt,
    userMessages,
    assistantMessageCount: assistantMessageIds.size,
    toolCalls,
  }
}
