/**
 * Token-usage accounting for the Import Pool extraction pipelines.
 *
 * Every Anthropic call in the extraction path adds its response usage into a
 * shared sink so callers (eval harness, prod route logging) can see what an
 * extraction actually cost. Added 2026-07-03 after an eval session ran ~$100
 * of untracked API spend — the pipeline previously discarded usage data.
 */
export interface ExtractUsage {
  apiCalls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export function newExtractUsage(): ExtractUsage {
  return { apiCalls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
}

/** Add one API response's usage block into the sink. No-op if either is missing. */
export function addResponseUsage(sink: ExtractUsage | undefined, usage: any): void {
  if (!sink || !usage) return
  sink.apiCalls++
  sink.inputTokens += usage.input_tokens || 0
  sink.outputTokens += usage.output_tokens || 0
  sink.cacheReadTokens += usage.cache_read_input_tokens || 0
  sink.cacheCreationTokens += usage.cache_creation_input_tokens || 0
}
