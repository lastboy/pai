import { describe, expect, it } from 'vitest'
import { detectPossibleCorrections } from '../src/core/corrections.js'

const at = '2026-01-10T17:20:00.000Z'

describe('detectPossibleCorrections', () => {
  it('flags messages with correction language and preserves the evidence', () => {
    const result = detectPossibleCorrections([
      { timestamp: at, text: "No, don't change the router" },
      { timestamp: at, text: 'Please add a health endpoint' },
      { timestamp: at, text: 'We already discussed this approach' },
      { timestamp: at, text: 'why did you delete the test?' },
      { timestamp: at, text: "that's not what I asked" },
      { timestamp: at, text: 'you forgot the error case' },
    ])

    expect(result.map((c) => c.text)).toEqual([
      "No, don't change the router",
      'We already discussed this approach',
      'why did you delete the test?',
      "that's not what I asked",
      'you forgot the error case',
    ])
    expect(result[0]?.timestamp).toBe(at)
  })

  it('does not flag neutral messages that merely start with similar letters', () => {
    const result = detectPossibleCorrections([
      { timestamp: at, text: 'Now add logging' },
      { timestamp: at, text: 'Nothing else needed, thanks' },
      { timestamp: at, text: 'Stopwatch feature next please' },
    ])
    expect(result).toEqual([])
  })
})
