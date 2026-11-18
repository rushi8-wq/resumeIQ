import { cosine } from './text.js';
export function embeddingAvailability(env) {
  return {
    available: env.EMBEDDING_PROVIDER === 'openai' && !!env.OPENAI_API_KEY,
    provider: env.EMBEDDING_PROVIDER || 'disabled',
    model: env.EMBEDDING_MODEL || 'text-embedding-3-small',
  };
}
export function createEmbeddingProvider(env, { fetchImpl = fetch } = {}) {
  if (!embeddingAvailability(env).available) return null;
  return {
    name: 'openai',
    model: env.EMBEDDING_MODEL || 'text-embedding-3-small',
    async similarity(first, second) {
      // Limit inputs conservatively by UTF-8 bytes; do not silently truncate saved evidence.
      if ([first, second].some((s) => Buffer.byteLength(s, 'utf8') > 6000))
        throw new Error('Embedding input limit');
      const response = await fetchImpl('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          input: [first, second].map((text) =>
            text
              .replace(
                /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
                '[redacted-email]',
              )
              .replace(/\+?\d[\d ()-]{8,}\d/g, '[redacted-number]'),
          ),
          encoding_format: 'float',
        }),
      });
      if (!response.ok) throw new Error('Embedding provider unavailable');
      const json = await response.json();
      const data = json.data?.slice().sort((a, b) => a.index - b.index);
      if (
        !Array.isArray(data) ||
        data.length !== 2 ||
        data[0].index !== 0 ||
        data[1].index !== 1
      )
        throw new Error('Invalid vectors');
      const vectors = data.map((d) => d.embedding);
      if (
        vectors.some(
          (v) =>
            !Array.isArray(v) ||
            !v.length ||
            v.length > 4096 ||
            v.some((n) => !Number.isFinite(n)) ||
            v.every((n) => n === 0),
        ) ||
        vectors[0].length !== vectors[1].length
      )
        throw new Error('Invalid vectors');
      const value = cosine(...vectors);
      if (!Number.isFinite(value)) throw new Error('Invalid vector magnitude');
      return { value, model: json.model || this.model };
    },
  };
}
