import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEvents } from '../src/adapters/claude/events.js'

const fixture = readFileSync(
  join(import.meta.dirname, 'fixtures', 'sample-session.jsonl'),
  'utf8',
)

describe('parseEvents', () => {
  const events = parseEvents(fixture)

  it('returns ordered meaningful events', () => {
    expect(
      events.map((e) => (e.kind === 'tool' ? `tool:${e.name}` : `${e.kind}:${e.text.slice(0, 10)}`)),
    ).toEqual([
      'user:Please add',
      'assistant:Sure, addi',
      'tool:Read',
      'tool:Edit',
      'tool:Bash',
      "user:No, don't ",
      'assistant:Reverted.',
    ])
  })

  it('marks failed tool calls', () => {
    const bash = events.find((e) => e.kind === 'tool' && e.name === 'Bash')
    expect(bash).toMatchObject({ failed: true, target: 'npm test' })
  })
})
