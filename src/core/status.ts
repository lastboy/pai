export interface PaiStatus {
  status: 'ready'
  mode: 'local'
}

export function getStatus(): PaiStatus {
  return { status: 'ready', mode: 'local' }
}

export function renderStatus(status: PaiStatus): string[] {
  return ['PAI', `Status: ${status.status}`, `Mode: ${status.mode}`]
}
