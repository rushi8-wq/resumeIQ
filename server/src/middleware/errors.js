import { ZodError } from 'zod';
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const diagnosticStages = new Set([
  'models',
  'completion',
  'json',
  'schema',
  'evidence',
  'target',
  'bullet_count',
]);
const diagnosticKeys = new Set([
  'suggestions',
  'keyword',
  'importance',
  'explanation',
  'requirement',
  'evidenceIds',
  'targetId',
  'section',
  'index',
  'suggestedText',
  'verificationStatus',
]);
function safeDiagnostics(input) {
  const safe = { provider: 'groq' };
  if (diagnosticStages.has(input.stage)) safe.stage = input.stage;
  if (
    [
      'openai/gpt-oss-20b',
      'openai/gpt-oss-120b',
      'llama-3.1-8b-instant',
      'llama-3.3-70b-versatile',
    ].includes(input.model)
  )
    safe.model = input.model;
  if (
    Number.isInteger(input.upstreamStatus) &&
    input.upstreamStatus >= 100 &&
    input.upstreamStatus <= 599
  )
    safe.upstreamStatus = input.upstreamStatus;
  if (
    ['stop', 'length', 'content_filter', 'tool_calls'].includes(
      input.finishReason,
    )
  )
    safe.finishReason = input.finishReason;
  if (
    typeof input.requestId === 'string' &&
    /^req_[a-zA-Z0-9_-]{1,95}$/.test(input.requestId)
  )
    safe.requestId = input.requestId;
  if (Number.isFinite(input.retryAfter) && input.retryAfter > 0)
    safe.retryAfter = Math.min(3600, Math.ceil(input.retryAfter));
  if (Array.isArray(input.validationIssues))
    safe.validationIssues = input.validationIssues.slice(0, 8).map((i) => ({
      path: Array.isArray(i.path)
        ? i.path
            .filter(
              (p) =>
                diagnosticKeys.has(p) ||
                (Number.isInteger(p) && p >= 0 && p < 100),
            )
            .join('.')
        : '',
      code: [
        'invalid_type',
        'invalid_value',
        'too_small',
        'too_big',
        'unrecognized_keys',
      ].includes(i.code)
        ? i.code
        : 'invalid_response',
    }));
  return safe;
}
export class AIError extends HttpError {
  constructor(status, code, message, diagnostics = {}) {
    super(status, message);
    this.name = 'AIError';
    this.code = code;
    this.diagnostics = safeDiagnostics({
      ...(code === 'AI_EVIDENCE_INVALID' ? { stage: 'evidence' } : {}),
      ...diagnostics,
    });
  }
  withContext(context) {
    this.diagnostics = safeDiagnostics({ ...context, ...this.diagnostics });
    return this;
  }
}
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError)
    return res.status(400).json({
      error: {
        message: 'Please check your input.',
        fields: err.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      },
    });
  if (err.code === 11000)
    return res.status(409).json({
      error: { message: 'An account with this email already exists.' },
    });

  const status = err.status || 500;
  const ai = err instanceof AIError;
  if (ai || status >= 500) {
    const diagnostic = {
      err: {
        name: ai ? 'AIError' : 'Error',
        ...(ai ? { code: err.code } : {}),
      },
      ...(ai ? { ai: err.diagnostics } : {}),
    };
    if (status >= 500) req.log?.error(diagnostic, 'Request failed');
    else req.log?.warn(diagnostic, 'AI request rejected');
  }
  if (ai && err.diagnostics.retryAfter)
    res.set('Retry-After', String(err.diagnostics.retryAfter));
  res.status(status).json({
    error: {
      message:
        status >= 500 && !ai
          ? 'Something went wrong. Please try again.'
          : err.message,
      ...(ai ? { code: err.code } : {}),
      ...(ai && err.diagnostics.retryAfter
        ? { retryAfter: err.diagnostics.retryAfter }
        : {}),
    },
  });
}
