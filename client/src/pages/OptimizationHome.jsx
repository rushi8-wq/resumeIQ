import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
export function OptimizationHome() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    api
      .get('/match/history', { params: { page, limit: 10 } })
      .then((r) => {
        if (active) setData(r.data);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [page, retry]);
  return (
    <main className="dashboard">
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">REAL EXPERIENCE. CLEARER WORDING.</span>
          <h1>AI Optimization</h1>
          <p>
            Choose an existing match analysis to improve how you describe your
            experience.
          </p>
        </div>
      </div>
      <section className="match-card">
        {error ? (
          <p className="error" role="alert">
            {error}{' '}
            <button onClick={() => setRetry((n) => n + 1)}>Try again</button>
          </p>
        ) : !data ? (
          <p role="status">Loading analyses…</p>
        ) : !data.analyses.length ? (
          <>
            <h2>Start with a job match</h2>
            <p>
              Suggestions need your saved resume and a specific job description.
            </p>
            <Link className="button" to="/app/match">
              Analyze a job
            </Link>
          </>
        ) : (
          <>
            <ul className="analysis-list">
              {data.analyses.map((a) => (
                <li key={a.id}>
                  <Link to={`/app/optimization/${a.id}`}>
                    <div>
                      <strong>
                        {a.jobSnapshot.title || 'Untitled opportunity'}
                      </strong>
                      <span>
                        {a.resumeSnapshot.originalFilename} ·{' '}
                        {a.overallScore ?? '—'}% original alignment
                      </span>
                    </div>
                    <span>Open optimizer →</span>
                  </Link>
                </li>
              ))}
            </ul>
            {data.pagination.pages > 1 && (
              <div className="pagination">
                <button
                  className="secondary-button"
                  disabled={page <= 1}
                  onClick={() => setPage((n) => n - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {data.pagination.pages}
                </span>
                <button
                  className="secondary-button"
                  disabled={page >= data.pagination.pages}
                  onClick={() => setPage((n) => n + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
