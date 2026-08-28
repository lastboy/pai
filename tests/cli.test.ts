import { describe, expect, it } from 'vitest'
import { createProgram } from '../src/cli/program.js'

describe('pai status', () => {
  it('prints the status information', async () => {
    const lines: string[] = []
    const program = createProgram((line) => lines.push(line))

    await program.parseAsync(['status'], { from: 'user' })

    expect(lines).toEqual(['PAI', 'Status: ready', 'Mode: local'])
  })
})
