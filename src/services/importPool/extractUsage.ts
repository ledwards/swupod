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
  /** The part of cacheCreationTokens written with the 1-hour TTL (billed at
   *  2x input instead of 1.25x). */
  cacheCreation1hTokens?: number
  /** The same counts split by the model that served each call, so a
   *  pipeline whose operations run on different models prices correctly. */
  byModel?: Record<string, Omit<ExtractUsage, 'byModel'>>
}

export function newExtractUsage(): ExtractUsage {
  return { apiCalls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, byModel: {} }
}

function add(t: Omit<ExtractUsage, 'byModel'>, usage: any): void {
  t.apiCalls++
  t.inputTokens += usage.input_tokens || 0
  t.outputTokens += usage.output_tokens || 0
  t.cacheReadTokens += usage.cache_read_input_tokens || 0
  t.cacheCreationTokens += usage.cache_creation_input_tokens || 0
  t.cacheCreation1hTokens = (t.cacheCreation1hTokens || 0) + (usage.cache_creation?.ephemeral_1h_input_tokens || 0)
}

/** Add one API response's usage block into the sink. No-op if either is
 *  missing. Pass the response's model to keep the per-model split. */
export function addResponseUsage(sink: ExtractUsage | undefined, usage: any, model?: string): void {
  if (!sink || !usage) return
  add(sink, usage)
  if (model) {
    sink.byModel ??= {}
    sink.byModel[model] ??= { apiCalls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
    add(sink.byModel[model], usage)
  }
}
