import { describe, expect, it } from 'vitest'
import { decodeTextFile } from '../src/persistence/text-file.js'

const json = '{"version":1,"rules":[]}'

describe('decodeTextFile', () => {
  it('decodes plain UTF-8', () => {
    expect(decodeTextFile(Buffer.from(json, 'utf8'))).toBe(json)
  })

  it('strips a UTF-8 BOM (Windows editors, Set-Content)', () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(json, 'utf8')])
    expect(decodeTextFile(withBom)).toBe(json)
  })

  it('decodes UTF-16LE with BOM (PowerShell 5.1 redirect default)', () => {
    expect(decodeTextFile(Buffer.from(`﻿${json}`, 'utf16le'))).toBe(json)
  })

  it('decodes UTF-16BE with BOM', () => {
    expect(decodeTextFile(Buffer.from(`﻿${json}`, 'utf16le').swap16())).toBe(json)
  })

  it('preserves non-ASCII characters', () => {
    const text = '{"rule":"שמור על תשובות קצרות — פאי"}'
    expect(decodeTextFile(Buffer.from(text, 'utf8'))).toBe(text)
    expect(decodeTextFile(Buffer.from(`﻿${text}`, 'utf16le'))).toBe(text)
  })
})
