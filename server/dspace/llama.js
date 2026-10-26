/**
 * Meta Llama API client for D-Space drafting and Q&A.
 *
 * Reads its key from the environment only (LLAMA_API_KEY), so the key never
 * lands in a file this project writes. Uses the OpenAI-compatible chat
 * endpoint by default; LLAMA_API_BASE and LLAMA_MODEL override it.
 */

export const DEFAULT_LLAMA_BASE = 'https://api.llama.com/compat/v1';
export const DEFAULT_LLAMA_MODEL = 'Llama-4-Maverick-17B-128E-Instruct-FP8';
const TIMEOUT_MS = 45 * 1000;

/** Llama settings from an environment, or null when no key is set. */
export function llamaConfig(env = process.env) {
  const apiKey = String(env.LLAMA_API_KEY || env.META_LLAMA_API_KEY || '').trim();
  if (!apiKey) return null;
  return {
    apiKey,
    base: String(env.LLAMA_API_BASE || DEFAULT_LLAMA_BASE).replace(/\/+$/, ''),
    model: String(env.LLAMA_MODEL || DEFAULT_LLAMA_MODEL),
  };
}

/** Pull the reply text out of either the compat or the native response shape. */
export function replyText(body) {
  const compat = body?.choices?.[0]?.message?.content;
  if (typeof compat === 'string') return compat;
  if (Array.isArray(compat))
    return compat.map((part) => part?.text || '').join('');
  const native = body?.completion_message?.content;
  if (typeof native === 'string') return native;
  if (typeof native?.text === 'string') return native.text;
  return '';
}

/**
 * Send chat messages to the Llama API and return the reply text.
 * @param {object} config from llamaConfig()
 * @param {Array} messages OpenAI-style chat messages
 */
export async function llamaChat(
  config,
  messages,
  { fetchImpl = globalThis.fetch, maxTokens = 300, signal } = {},
) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const response = await fetchImpl(`${config.base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 200);
    throw new Error(`Llama API ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return replyText(await response.json()).trim();
}
