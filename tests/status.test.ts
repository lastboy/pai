import { describe, expect, it } from 'vitest'
import { getStatus, renderStatus } from '../src/core/status.js'

describe('getStatus', () => {
  it('reports ready status in local mode', () => {
    expect(getStatus()).toEqual({ status: 'ready', mode: 'local' })
  })
})

describe('renderStatus', () => {
  it('renders the status as display lines', () => {
    expect(renderStatus(getStatus())).toEqual([
      'PAI',
      'Status: ready',
      'Mode: local',
    ])
  })
})
