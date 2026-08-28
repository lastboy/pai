import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTranscript } from '../src/adapters/claude/parser.js'

const fixture = readFileSync(
  join(import.meta.dirname, 'fixtures', 'sample-session.jsonl'),
  'utf8',
)

describe('parseTranscript', () => {
  const session = parseTranscript(fixture, 'fix-1')

  it('keeps only real user prompts', () => {
    expect(session.userMessages.map((m) => m.text)).toEqual([
      'Please add a health endpoint',
      "No, don't change the router, we agreed to keep it",
    ])
  })

  it('counts assistant messages by distinct message id', () => {
    expect(session.assistantMessageCount).toBe(3)
  })

  it('reports the model', () => {
    expect(session.model).toBe('claude-test-1')
  })

  it('picks up the last session title', () => {
    expect(session.title).toBe('Add health endpoint')
  })

  it('normalizes tool calls with kinds and targets', () => {
    expect(session.toolCalls).toEqual([
      { name: 'Read', kind: 'file-read', target: '/app/src/server.ts', failed: false },
      { name: 'Edit', kind: 'file-write', target: '/app/src/server.ts', failed: false },
      { name: 'Bash', kind: 'command', target: 'npm test', failed: true },
    ])
  })

  it('derives start and end times from message timestamps', () => {
    expect(session.startedAt?.toISOString()).toBe('2026-01-10T17:14:00.000Z')
    expect(session.endedAt?.toISOString()).toBe('2026-01-10T17:24:00.000Z')
  })

  it('survives malformed lines and carries the session id', () => {
    expect(session.id).toBe('fix-1')
  })
})
