import { detectPossibleCorrections, type PossibleCorrection } from './corrections.js'
import type { Session, ToolKind } from './session.js'

export interface ReviewSummary {
  sessionId: string
  title?: string
  model?: string
  startedAt?: Date
  endedAt?: Date
  durationMs?: number
  userMessageCount: number
  assistantMessageCount: number
  toolCallCount: number
  toolFailureCount: number
  filesRead: number
  filesModified: number
  commandCount: number
  possibleCorrections: PossibleCorrection[]
}

function distinctTargets(session: Session, kind: ToolKind): number {
  const targets = session.toolCalls
    .filter((c) => c.kind === kind && c.target !== undefined)
    .map((c) => c.target)
  return new Set(targets).size
}

export function buildReview(session: Session): ReviewSummary {
  return {
    sessionId: session.id,
    title: session.title,
    model: session.model,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    durationMs:
      session.startedAt && session.endedAt
        ? session.endedAt.getTime() - session.startedAt.getTime()
        : undefined,
    userMessageCount: session.userMessages.length,
    assistantMessageCount: session.assistantMessageCount,
    toolCallCount: session.toolCalls.length,
    toolFailureCount: session.toolCalls.filter((c) => c.failed).length,
    filesRead: distinctTargets(session, 'file-read'),
    filesModified: distinctTargets(session, 'file-write'),
    commandCount: session.toolCalls.filter((c) => c.kind === 'command').length,
    possibleCorrections: detectPossibleCorrections(session.userMessages),
  }
}
