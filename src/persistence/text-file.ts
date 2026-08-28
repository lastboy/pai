import { readFileSync } from 'node:fs'

// Files exported on one platform are routinely imported on another. Windows
// tooling adds byte-order marks and PowerShell 5.1's `>` redirect writes
// UTF-16LE, both of which break a plain UTF-8 read.
export function decodeTextFile(bytes: Buffer): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3).toString('utf8')
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.subarray(2).toString('utf16le')
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const body = bytes.subarray(2)
    if (body.length % 2 !== 0) return body.toString('utf8')
    // swap16 mutates, so work on a copy of the caller's buffer.
    return Buffer.from(body).swap16().toString('utf16le')
  }
  return bytes.toString('utf8')
}

export function readTextFile(path: string): string {
  return decodeTextFile(readFileSync(path))
}
