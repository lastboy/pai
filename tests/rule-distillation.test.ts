import { describe, expect, it } from 'vitest'
import {
  buildDistillPrompt,
  parseDistillResponse,
} from '../src/experiments/rule-distillation.js'

describe('buildDistillPrompt', () => {
  it('includes the user message and the JSON contract', () => {
    const prompt = buildDistillPrompt('Keep answers short. Do not add background.')
    expect(prompt).toContain('Keep answers short')
    expect(prompt).toContain('"rules"')
    expect(prompt).toContain('One-off')
  })

  it('clips very long messages', () => {
    const prompt = buildDistillPrompt('x'.repeat(10_000))
    expect(prompt.length).toBeLessThan(5_000)
  })
})

describe('parseDistillResponse', () => {
  it('parses a rules array', () => {
    expect(
      parseDistillResponse(
        '{"rules": [{"rule": "Ask before making decisions", "category": "Decision making", "confidence": 0.9}]}',
      ),
    ).toEqual([
      { rule: 'Ask before making decisions', category: 'Decision making', confidence: 0.9 },
    ])
  })

  it('returns empty for no rules or malformed entries', () => {
    expect(parseDistillResponse('{"rules": []}')).toEqual([])
    expect(parseDistillResponse('{"rules": [{"bogus": 1}]}')).toEqual([])
    expect(parseDistillResponse('garbage')).toEqual([])
  })

  it('fills defaults for missing optional fields', () => {
    expect(parseDistillResponse('{"rules": [{"rule": "Keep answers short"}]}')).toEqual([
      { rule: 'Keep answers short', category: 'General', confidence: 0 },
    ])
  })
})
