import { describe, expect, it } from 'vitest'
import { parseSelection, renderSessionList } from '../src/cli/render.js'

describe('parseSelection', () => {
  it('defaults to the first session on empty input', () => {
    expect(parseSelection('', 3)).toBe(0)
    expect(parseSelection('  ', 3)).toBe(0)
  })

  it('accepts a valid 1-based number', () => {
    expect(parseSelection('2', 3)).toBe(1)
    expect(parseSelection(' 3 ', 3)).toBe(2)
  })

  it('rejects out-of-range or non-numeric input', () => {
    expect(parseSelection('0', 3)).toBeUndefined()
    expect(parseSelection('4', 3)).toBeUndefined()
    expect(parseSelection('abc', 3)).toBeUndefined()
  })
})

describe('renderSessionList', () => {
  it('renders a numbered list with id, times, and prompt snippet', () => {
    const lines = renderSessionList([
      {
        path: '/x/bbb.jsonl',
        id: 'bbb47121-faee-41b5-b266-1406e575f01d',
        startedAt: new Date('2026-02-01T09:00:00.000Z'),
        lastActiveAt: new Date('2026-02-01T11:30:00.000Z'),
        firstPrompt: 'Fix the login bug in the auth service because users cannot sign in',
      },
      {
        path: '/x/aaa.jsonl',
        id: 'aaa16218-0000-0000-0000-000000000000',
        lastActiveAt: new Date('2026-01-01T10:00:00.000Z'),
      },
    ])
    const output = lines.join('\n')
    expect(output).toContain('1. bbb47121')
    expect(output).toContain('2. aaa16218')
    expect(output).toContain('Fix the login bug')
    expect(output).not.toContain('cannot sign in')
    expect(output).toContain('last active')
  })
})
