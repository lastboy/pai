import type { UserMessage } from './session.js'

export interface PossibleCorrection {
  timestamp?: string
  text: string
}

// Deliberately simple first pass. These phrases MAY indicate the user is
// correcting or redirecting the agent — they are not classified as mistakes.
// "no" and "stop" are anchored to the message start to reduce noise.
const CORRECTION_PATTERNS: RegExp[] = [
  /^no\b/i,
  /^stop\b/i,
  /\bdon'?t\b/i,
  /\bthat'?s not what i asked\b/i,
  /\bwe already\b/i,
  /\bwe agreed\b/i,
  /\bwhy did you\b/i,
  /\byou forgot\b/i,
  /\bread\b.{0,60}\bfirst\b/i,
  /\bthat'?s wrong\b/i,
]

export function detectPossibleCorrections(messages: UserMessage[]): PossibleCorrection[] {
  return messages
    .filter((m) => CORRECTION_PATTERNS.some((p) => p.test(m.text)))
    .map((m) => ({ timestamp: m.timestamp, text: m.text }))
}
