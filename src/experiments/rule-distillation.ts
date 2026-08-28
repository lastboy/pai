// EXPERIMENT — Task 3 checkpoint. Distills candidate personal-guidance rules
// from real user messages with a local Ollama model, so distillation quality
// can be judged before building the approve/store flow.

export interface CandidateRule {
  rule: string
  category: string
  confidence: number
}

const MAX_MESSAGE_CHARS = 3_000

export function buildDistillPrompt(message: string): string {
  const clipped =
    message.length > MAX_MESSAGE_CHARS ? `${message.slice(0, MAX_MESSAGE_CHARS)}...` : message
  return [
    'You extract personal working-preference rules that a user teaches an AI coding assistant.',
    'From the user message below, extract 0 to 3 rules the user wants the assistant to follow IN GENERAL across future work.',
    'A rule is a lasting preference, constraint, or way of working (e.g. "ask before making decisions", "keep answers short").',
    'One-off task instructions ("add a button", "fix this bug", "rename X") are NOT rules — return them nowhere.',
    'If the message contains no lasting guidance, return an empty rules array.',
    '',
    'User message:',
    `"${clipped}"`,
    '',
    'Respond with ONLY this JSON, nothing else:',
    '{"rules": [{"rule": "short imperative rule", "category": "one or two words", "confidence": 0.0 to 1.0}]}',
  ].join('\n')
}

export function parseDistillResponse(text: string): CandidateRule[] {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return []
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return []
  }
  if (!Array.isArray(parsed['rules'])) return []
  const rules: CandidateRule[] = []
  for (const entry of parsed['rules'] as Array<Record<string, unknown>>) {
    if (typeof entry?.['rule'] !== 'string' || entry['rule'].trim() === '') continue
    rules.push({
      rule: entry['rule'].trim(),
      category: typeof entry['category'] === 'string' ? entry['category'] : 'General',
      confidence: typeof entry['confidence'] === 'number' ? entry['confidence'] : 0,
    })
  }
  return rules
}
