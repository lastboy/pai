import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProgram } from '../src/cli/program.js'

describe('pai --version', () => {
  it('reports the version from package.json', () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
    ) as { version: string }

    expect(createProgram(() => {}).version()).toBe(pkg.version)
  })
})
