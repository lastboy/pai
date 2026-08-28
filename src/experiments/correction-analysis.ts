// EXPERIMENT — not production architecture. Tests whether a small local LLM
// (via Ollama's HTTP API, no SDK) understands user corrections better than the
// keyword detector. Nothing in core or in `pai review` depends on this.
import type { TranscriptEvent } from '../adapters/claude/events.js'
import { ollamaGenerate } from './ollama.js'

export interface CorrectionContext {
  goal?: string
  events: TranscriptEvent[]
  correction: string
}

export interface CorrectionAnalysis {
  isCorrection: boolean
  category: string
  confidence: number
  reason: string
}

const CATEGORIES = [
  'scope_drift',
  'repeated_failure',
  'ignored_guidance',
  'misunderstanding',
  'regression',
  'other',
  'not_correction',
]

const MAX_PRECEDING_EVENTS = 5
const MAX_EVENT_CHARS = 300
const MAX_GOAL_CHARS = 500

function clip(text: string, max: number): string {
  const singleLine = text.replace(/\s+/g, ' ').trim()
  return singleLine.length > max ? `${singleLine.slice(0, max - 3)}...` : singleLine
}

export function buildCorrectionContext(
  events: TranscriptEvent[],
  correctionIndex: number,
): CorrectionContext {
  const correction = events[correctionIndex]
  if (!correction || correction.kind !== 'user') {
    throw new Error('correctionIndex must point at a user event')
  }
  const firstUser = events.find((e, i) => e.kind === 'user' && i < correctionIndex)
  return {
    goal: firstUser?.kind === 'user' ? firstUser.text : undefined,
    // The goal message is sent separately — don't duplicate it in the window.
    events: events
      .slice(Math.max(0, correctionIndex - MAX_PRECEDING_EVENTS), correctionIndex)
      .filter((e) => e !== firstUser),
    correction: correction.text,
  }
}

function describeEvent(event: TranscriptEvent): string {
  switch (event.kind) {
    case 'user':
      return `[user] ${clip(event.text, MAX_EVENT_CHARS)}`
    case 'assistant':
      return `[assistant] ${clip(event.text, MAX_EVENT_CHARS)}`
    case 'tool':
      return `[tool] ${event.name}${event.target ? ` ${clip(event.target, 120)}` : ''}${event.failed ? ' (FAILED)' : ''}`
  }
}

export function buildPrompt(context: CorrectionContext): string {
  const parts: string[] = [
    'You are analyzing one moment in a coding-agent session.',
    'Decide whether the user message below is the user CORRECTING or REDIRECTING the AI assistant (as opposed to a normal new request, answer, or approval).',
    '',
  ]
  if (context.goal) {
    parts.push('User request earlier in the session:', `"${clip(context.goal, MAX_GOAL_CHARS)}"`, '')
  }
  if (context.events.length > 0) {
    parts.push('Events immediately before the message:')
    context.events.forEach((event, i) => parts.push(`${i + 1}. ${describeEvent(event)}`))
    parts.push('')
  }
  parts.push(
    'User message to analyze:',
    `"${clip(context.correction, MAX_GOAL_CHARS)}"`,
    '',
    'Respond with ONLY this JSON, nothing else:',
    `{"isCorrection": true or false, "category": "${CATEGORIES.join('" | "')}", "confidence": 0.0 to 1.0, "reason": "short explanation"}`,
  )
  return parts.join('\n')
}

export function parseModelResponse(text: string): CorrectionAnalysis | undefined {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return undefined
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return undefined
  }
  if (typeof parsed['isCorrection'] !== 'boolean') return undefined
  return {
    isCorrection: parsed['isCorrection'],
    category: typeof parsed['category'] === 'string' ? parsed['category'] : 'other',
    confidence: typeof parsed['confidence'] === 'number' ? parsed['confidence'] : 0,
    reason: typeof parsed['reason'] === 'string' ? parsed['reason'] : '',
  }
}

export interface OllamaResult {
  raw: string
  parsed?: CorrectionAnalysis
  latencyMs: number
  modelDurationMs?: number
}

export async function analyzeWithOllama(
  prompt: string,
  model: string,
  baseUrl = 'http://localhost:11434',
): Promise<OllamaResult> {
  const generation = await ollamaGenerate(prompt, model, baseUrl)
  return { ...generation, parsed: parseModelResponse(generation.raw) }
}
