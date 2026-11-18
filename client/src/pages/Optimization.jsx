import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useOptimization } from './useOptimization';
import { SuggestionCard } from '../components/optimization/SuggestionCard';
import { OptimizationPreview } from '../components/optimization/OptimizationPreview';
import { VersionHistory } from '../components/optimization/VersionHistory';
export function Optimization() {
  const { id } = useParams();
  const state = useOptimization(id);
  const [target, setTarget] = useState('');
  const { data, suggestions, config, busy, loading, error, message } = state;
  if (loading)
    return (
      <main className="dashboard" role="status">
        Opening your optimization workspace…
      </main>
    );
  if (!data)
    return (
      <main className="dashboard">
        <h1>Optimization unavailable</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <button className="secondary-button" onClick={state.reload}>
          Try again
        </button>{' '}
        <Link to="/app/history">Analysis history</Link>
      </main>
    );
  const a = data.analysis;
  const bullets = ['projects', 'workExperience'].flatMap((section) =>
    (a.resumeSnapshot.structuredData[section] || []).map((text, index) => ({
      key: `${section}:${index}`,
      section,
      index,
      text,
    })),
  );
  return (
    <main className="dashboard optimization">
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">A CLEARER STORY, GROUNDED IN EVIDENCE</span>
          <h1>AI Optimization</h1>
          <p>
            {data.jobDescription.title || 'Untitled opportunity'} ·{' '}
            {a.resumeSnapshot.originalFilename}
          </p>
        </div>
        <Link className="secondary-button" to={`/app/match/${id}`}>
          Original analysis
        </Link>
      </div>
      <section className="match-card">
        <h2>Your starting point · {a.overallScore ?? '—'}%</h2>
        <p>
          Missing required:{' '}
          {a.missingSkills.required.join(', ') ||
            'None among classified requirements'}
        </p>
        <p>
          Missing preferred:{' '}
          {a.missingSkills.preferred.join(', ') ||
            'None among classified requirements'}
        </p>
        <p>
          Edits are based on saved resume revision {a.resumeSnapshot.version}.
          If you change the original resume, run a new match first.
        </p>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      <section className="match-card ai-controls">
        <h2>Request evidence-based suggestions</h2>
        <p>
          Provider: {config?.provider} · Model: {config?.model}. Up to 30
          evidence entries or one selected bullet are sent; detected email and
          phone snippets are redacted. Redaction does not guarantee anonymity.
        </p>
        {!config?.configured && (
          <p className="error">
            {config?.error ||
              'Groq is not configured. Set GROQ_API_KEY in the backend environment.'}
          </p>
        )}
        <label className="consent-label">
          <input
            type="checkbox"
            checked={state.consent}
            onChange={(e) => state.setConsent(e.target.checked)}
            disabled={busy}
          />
          <span>
            I consent to sending the disclosed resume excerpts and job
            requirements to Groq Cloud for this AI request. I understand
            suggestions must be reviewed and provider data policies apply.
          </span>
        </label>
        <button
          className="button"
          disabled={busy || !state.consent || !config?.configured}
          onClick={() => state.generate()}
        >
          Generate keyword suggestions
        </button>
        <div className="single-bullet-controls">
          <label>
            Project or experience bullet
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={busy}
            >
              <option value="">Select a bullet</option>
              {bullets.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.section}:{b.index} · {b.text.slice(0, 100)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-button"
            disabled={busy || !state.consent || !target || !config?.configured}
            onClick={() => {
              const b = bullets.find((b) => b.key === target);
              state.generate({ section: b.section, index: b.index });
            }}
          >
            Improve selected bullet
          </button>
        </div>
        {busy && <p role="status">Working on your request…</p>}
        <p>
          Groq does not set scores. Unsupported claims need factual
          confirmation, and genuine gaps remain learning recommendations.
          Numerical claims cannot be invented or altered.
        </p>
      </section>
      <section aria-labelledby="suggestions-heading">
        <h2 id="suggestions-heading">Suggestion history</h2>
        {!suggestions.length ? (
          <section className="match-card">
            <p>
              No saved suggestions yet. Consent and request keywords or choose a
              bullet above. A request can return none when no safe improvement
              is available.
            </p>
          </section>
        ) : (
          suggestions.map((s) => (
            <SuggestionCard
              key={`${s.id}:${s.revision}`}
              suggestion={s}
              busy={busy}
              onDecision={state.decide}
              onDelete={state.deleteSuggestion}
            />
          ))
        )}
      </section>
      <OptimizationPreview
        preview={state.preview}
        busy={busy}
        onSave={() => state.compare(true)}
        onRecalculate={() => state.compare(false)}
        acceptedCount={state.accepted.length}
        embeddingBased={a.semantic.method === 'embeddings'}
        embeddingConsent={state.embeddingConsent}
        setEmbeddingConsent={state.setEmbeddingConsent}
      />
      <VersionHistory
        versions={state.versions}
        pagination={state.pagination}
        page={state.page}
        setPage={state.setPage}
        busy={busy}
        onDelete={state.deleteVersion}
      />
    </main>
  );
}
