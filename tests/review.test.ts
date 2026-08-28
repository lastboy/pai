import { describe, expect, it } from 'vitest'
import { buildReview } from '../src/core/review.js'
import type { Session } from '../src/core/session.js'
import { renderReview } from '../src/cli/render.js'

const session: Session = {
  id: 'abc123',
  title: 'Fix login flow',
  model: 'claude-test-1',
  startedAt: new Date('2026-01-10T17:14:00.000Z'),
  endedAt: new Date('2026-01-10T18:37:00.000Z'),
  userMessages: [
    { timestamp: '2026-01-10T17:14:00.000Z', text: 'Please add a health endpoint' },
    { timestamp: '2026-01-10T17:20:00.000Z', text: "No, don't change the router" },
  ],
  assistantMessageCount: 3,
  toolCalls: [
    { name: 'Read', kind: 'file-read', target: '/a.ts', failed: false },
    { name: 'Read', kind: 'file-read', target: '/a.ts', failed: false },
    { name: 'Edit', kind: 'file-write', target: '/a.ts', failed: false },
    { name: 'Write', kind: 'file-write', target: '/b.ts', failed: false },
    { name: 'Bash', kind: 'command', target: 'npm test', failed: true },
  ],
}

describe('buildReview', () => {
  const review = buildReview(session)

  it('aggregates conversation and activity stats', () => {
    expect(review).toMatchObject({
      sessionId: 'abc123',
      model: 'claude-test-1',
      durationMs: 83 * 60 * 1000,
      userMessageCount: 2,
      assistantMessageCount: 3,
      toolCallCount: 5,
      toolFailureCount: 1,
      filesRead: 1,
      filesModified: 2,
      commandCount: 1,
    })
  })

  it('includes possible corrections with evidence', () => {
    expect(review.possibleCorrections).toHaveLength(1)
    expect(review.possibleCorrections[0]?.text).toBe("No, don't change the router")
  })
})

describe('renderReview', () => {
  it('renders a readable summary', () => {
    const output = renderReview(buildReview(session)).join('\n')
    expect(output).toContain('PAI — Session Review')
    expect(output).toContain('Session: abc123')
    expect(output).toContain('Title: Fix login flow')
    expect(output).toContain('Model: claude-test-1')
    expect(output).toContain('Started: 10 Jan 2026')
    expect(output).toContain('Last active: 10 Jan 2026')
    expect(output).toContain('Duration: 1h 23m')
    expect(output).toContain('User messages')
    expect(output).toContain('Possible corrections')
    expect(output).toContain("No, don't change the router")
  })
})
