import { ShieldCheck, ScanLine } from 'lucide-react';
export function MatchProcessing({
  embeddings,
  consent,
  setConsent,
  busy,
  resumeId,
}) {
  return (
    <section className="match-card">
      <h2>03 · Choose processing</h2>
      <p>
        <ShieldCheck size={16} /> Local TF-IDF is the default. No data leaves
        this server in local mode.
      </p>
      {embeddings?.available ? (
        <label className="consent-label">
          <input
            type="checkbox"
            checked={consent}
            disabled={busy}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            I consent to sending skill, education, project and work excerpts
            plus job requirements to OpenAI for this analysis using{' '}
            {embeddings.model}. Contact fields are omitted and detected
            email/phone mentions are redacted. Provider data policies apply. If
            unavailable, use the labeled local fallback.
          </span>
        </label>
      ) : (
        <p>
          Embeddings are unavailable or disabled. This analysis will use a
          clearly labeled local TF-IDF fallback.
        </p>
      )}
      <button className="button" disabled={busy || !resumeId}>
        <ScanLine size={18} />
        {busy ? 'Analyzing…' : 'Analyze Match'}
      </button>
      {busy && (
        <p role="status">
          Comparing skills, evidence, and qualifications. Your result will be
          saved to history.
        </p>
      )}
    </section>
  );
}
