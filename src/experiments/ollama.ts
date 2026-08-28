// Shared minimal Ollama HTTP client for experiments. Direct fetch, no SDK.

export interface OllamaGeneration {
  raw: string
  latencyMs: number
  modelDurationMs?: number
}

export async function ollamaGenerate(
  prompt: string,
  model: string,
  baseUrl = 'http://localhost:11434',
): Promise<OllamaGeneration> {
  const startedAt = performance.now()
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      format: 'json',
      options: { temperature: 0 },
    }),
  })
  if (!response.ok) {
    throw new Error(`Ollama responded ${response.status}: ${await response.text()}`)
  }
  const body = (await response.json()) as { response?: string; total_duration?: number }
  return {
    raw: body.response ?? '',
    latencyMs: performance.now() - startedAt,
    modelDurationMs:
      typeof body.total_duration === 'number' ? body.total_duration / 1_000_000 : undefined,
  }
}
