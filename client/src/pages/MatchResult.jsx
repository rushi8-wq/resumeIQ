import { useEffect, useState, lazy, Suspense } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, mutate, errorMessage } from '../lib/api';
const ScoreSummary = lazy(() =>
  import('../components/match/ScoreSummary').then((module) => ({
    default: module.ScoreSummary,
  })),
);
import { MatchEvidence } from '../components/match/MatchEvidence';
export function MatchResult() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    setLoading(true);
    api
      .get(`/match/${id}`)
      .then((r) => {
        if (active) setData(r.data);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, retry]);
  async function remove() {
    setBusy(true);
    setError('');
    try {
      await mutate(`/match/${id}`, undefined, { method: 'delete' });
      navigate('/app/history', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main className="dashboard" role="status">
        Loading your analysis…
      </main>
    );
  if (!data)
    return (
      <main className="dashboard">
        <h1>Analysis unavailable</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <button
          className="secondary-button"
          onClick={() => setRetry((n) => n + 1)}
        >
          Try again
        </button>{' '}
        <Link to="/app/history">Analysis history</Link>
      </main>
    );
  const { analysis: a, jobDescription: j } = data;
  return (
    <main className="dashboard match-result">
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">UNDERSTAND YOUR ALIGNMENT</span>
          <h1>Match analysis</h1>
          <p>
            {j.title || 'Untitled opportunity'}
            {j.company ? ` · ${j.company}` : ''}
          </p>
        </div>
        <Link className="secondary-button" to="/app/match">
          New analysis
        </Link>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Suspense fallback={<p role="status">Loading score visualization…</p>}>
        <ScoreSummary analysis={a} />
      </Suspense>
      {a.overallScore !== null && a.overallScore < 50 && (
        <aside className="parsing-warning">
          Your resume has several gaps relative to this job description. Review
          the AI Optimization workspace for evidence-based improvement
          suggestions.
        </aside>
      )}
      <p>
        <Link className="button" to={`/app/optimization/${id}`}>
          Open AI Optimization
        </Link>
      </p>
      <section className="match-card">
        <h2>Confidence and limitations</h2>
        <ul className="limitations-list">
          {a.limitations.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
        <p>
          Non-applicable or unevaluable components contribute no points; their
          weights are redistributed to applicable components. Missing resume
          evidence earns zero on an applicable requirement.
        </p>
      </section>
      <MatchEvidence analysis={a} requirements={j.parsedRequirements} />
      <section className="match-card">
        <h2>Analysis references</h2>
        <p>
          <Link className="text-link" to={`/app/resumes/${a.resumeId}`}>
            {a.resumeSnapshot.originalFilename}
          </Link>{' '}
          · Saved revision {a.resumeSnapshot.version} · Analyzed{' '}
          {new Date(a.createdAt).toLocaleString()}
        </p>
        <p>
          This result retains the resume evidence and job description used at
          analysis time. Later corrections require a new analysis.
        </p>
        <details>
          <summary>Job description · {j.id}</summary>
          <pre className="match-source-text">{j.description}</pre>
        </details>
        <details>
          <summary>Resume evidence snapshot</summary>
          <pre className="match-source-text">
            {Object.entries(a.resumeSnapshot.structuredData)
              .map(
                ([key, values]) => `${key}
${values.join('\n')}`,
              )
              .join('\n\n')}
          </pre>
        </details>
      </section>
      <section className="match-card">
        <h2>Delete this analysis</h2>
        <p>
          Removes the saved result, evidence snapshot, and its job description.
          Your resume stays in your library.
        </p>
        {confirm ? (
          <div role="alert">
            <p>Delete this analysis permanently?</p>
            <button className="danger-button" disabled={busy} onClick={remove}>
              Confirm delete analysis
            </button>{' '}
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button className="danger-button" onClick={() => setConfirm(true)}>
            Delete analysis
          </button>
        )}
      </section>
    </main>
  );
}
