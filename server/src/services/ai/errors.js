import Groq from 'groq-sdk';
import { AIError, HttpError } from '../../middleware/errors.js';
export function providerError(error, context = {}) {
  if (error instanceof AIError) return error.withContext(context);
  if (error instanceof HttpError) return error;
  const status = error?.status;
  const diagnostics = {
    ...context,
    upstreamStatus: status,
    requestId: error?.headers?.get?.('x-request-id'),
  };
  if (status === 401 || status === 403)
    return new AIError(
      503,
      'AI_ACCESS_DENIED',
      'Groq rejected access. Check the backend API key and model permissions.',
      diagnostics,
    );
  if (status === 429) {
    const retryAfter = Number(error?.headers?.get?.('retry-after'));
    return new AIError(
      429,
      'AI_RATE_LIMITED',
      'Groq rate limit or quota reached. Wait before trying again and check Groq usage limits.',
      { ...diagnostics, ...(retryAfter > 0 ? { retryAfter } : {}) },
    );
  }
  if (status === 404 || status === 410)
    return new AIError(
      503,
      'AI_MODEL_UNAVAILABLE',
      'The configured Groq model is unavailable. Check GROQ_MODEL in server/.env.',
      diagnostics,
    );
  if (
    status === 400 &&
    ['json_validate_failed', 'json_generation_failed'].includes(
      error?.error?.error?.code || error?.error?.code,
    )
  )
    return new AIError(
      502,
      'AI_INVALID_RESPONSE',
      'Groq could not generate a valid structured response. No suggestions were saved. Try again.',
      diagnostics,
    );
  if (status === 400 || status === 422)
    return new AIError(
      503,
      'AI_CONFIGURATION',
      'Groq rejected the request configuration. Check the model and structured-output support in the backend.',
      diagnostics,
    );
  if (
    error instanceof Groq.APIConnectionTimeoutError ||
    error instanceof Groq.APIUserAbortError ||
    ['AbortError', 'TimeoutError'].includes(error?.name) ||
    status === 408 ||
    status === 504
  )
    return new AIError(
      504,
      'AI_TIMEOUT',
      'Groq took too long to respond. No suggestions were saved. Please try again.',
      diagnostics,
    );
  if (error instanceof Groq.APIConnectionError)
    return new AIError(
      503,
      'AI_NETWORK_ERROR',
      'The backend could not connect to Groq. No suggestions were saved. Please try again.',
      diagnostics,
    );
  if (Number.isInteger(status) && status >= 500)
    return new AIError(
      502,
      'AI_PROVIDER_ERROR',
      'Groq is temporarily failing. No suggestions were saved. Please try again later.',
      diagnostics,
    );
  // A programming/database error is not a provider outage. Never expose its message.
  return new AIError(
    500,
    'AI_INTERNAL_ERROR',
    'The AI request could not be completed due to an internal error.',
    diagnostics,
  );
}
