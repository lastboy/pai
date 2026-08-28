import { describe, expect, it } from 'vitest'
import type { TranscriptEvent } from '../src/adapters/claude/events.js'
import {
  buildCorrectionContext,
  buildPrompt,
  parseModelResponse,
} from '../src/experiments/correction-analysis.js'

const events: TranscriptEvent[] = [
  { kind: 'user', text: 'Please add a health endpoint' },
  { kind: 'assistant', text: 'Sure, adding it.' },
  { kind: 'tool', name: 'Read', target: '/app/src/server.ts', failed: false },
  { kind: 'tool', name: 'Edit', target: '/app/src/router.ts', failed: false },
  { kind: 'tool', name: 'Bash', target: 'npm test', failed: true },
  { kind: 'user', text: "No, don't change the router, we agreed to keep it" },
]

describe('buildCorrectionContext', () => {
  const context = buildCorrectionContext(events, 5)

  it('captures the goal, preceding events, and the correction', () => {
    expect(context.goal).toBe('Please add a health endpoint')
    expect(context.correction).toBe("No, don't change the router, we agreed to keep it")
    expect(context.events).toHaveLength(4)
    expect(context.events[0]).toMatchObject({ kind: 'assistant' })
    expect(context.events[3]).toMatchObject({ kind: 'tool', name: 'Bash', failed: true })
  })

  it('omits the goal when the correction is the first user message', () => {
    const context = buildCorrectionContext(
      [{ kind: 'user', text: 'stop doing that' }],
      0,
    )
    expect(context.goal).toBeUndefined()
    expect(context.events).toHaveLength(0)
  })
})

describe('buildPrompt', () => {
  it('includes goal, events, correction, and the JSON contract', () => {
    const prompt = buildPrompt(buildCorrectionContext(events, 5))
    expect(prompt).toContain('Please add a health endpoint')
    expect(prompt).toContain('Bash')
    expect(prompt).toContain("No, don't change the router")
    expect(prompt).toContain('"isCorrection"')
    expect(prompt).toContain('not_correction')
  })
})

describe('parseModelResponse', () => {
  it('parses a valid structured response', () => {
    expect(
      parseModelResponse(
        '{"isCorrection": true, "category": "ignored_guidance", "confidence": 0.9, "reason": "user reverts router change"}',
      ),
    ).toEqual({
      isCorrection: true,
      category: 'ignored_guidance',
      confidence: 0.9,
      reason: 'user reverts router change',
    })
  })

  it('extracts JSON embedded in surrounding text', () => {
    const parsed = parseModelResponse(
      'Here is my answer:\n{"isCorrection": false, "category": "not_correction", "confidence": 0.6, "reason": "just a new request"}\nDone.',
    )
    expect(parsed?.isCorrection).toBe(false)
  })

  it('returns undefined for garbage', () => {
    expect(parseModelResponse('sorry I cannot')).toBeUndefined()
    expect(parseModelResponse('{"unrelated": 1}')).toBeUndefined()
  })
})
