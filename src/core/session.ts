export type ToolKind = 'file-read' | 'file-write' | 'command' | 'other'

export interface ToolCall {
  name: string
  kind: ToolKind
  target?: string
  failed: boolean
}

export interface UserMessage {
  timestamp?: string
  text: string
}

export interface Session {
  id: string
  title?: string
  model?: string
  startedAt?: Date
  endedAt?: Date
  userMessages: UserMessage[]
  assistantMessageCount: number
  toolCalls: ToolCall[]
}
