import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
export function MatchHistory() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api
      .get('/match/history', { params: { page, limit: 10 } })
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
  }, [page, retry]);
  return (
    <main className="dashboard">
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">YOUR PATH, WITH CONTEXT</span>
          <h1>Analysis history</h1>
          <p>Revisit your saved job comparisons and their evidence.</p>
        </div>
        <Link className="button" to="/app/match">
          New analysis
        </Link>
      </div>
      <section className="match-card">
        {error ? (
          <p className="error" role="alert">
            {error}{' '}
            <button onClick={() => setRetry((n) => n + 1)}>Try again</button>
          </p>
        ) : loading ? (
          <p role="status">Loading analyses…</p>
        ) : !data?.analyses.length ? (
          <>
            <h2>No analyses yet</h2>
            <p>
              Compare a saved resume with a job description to start your
              history.
            </p>
          </>
        ) : (
          <>
            <ul className="analysis-list">
              {data.analyses.map((a) => (
                <li key={a.id}>
                  <Link to={`/app/match/${a.id}`}>
                    <div>
                      <strong>
                        {a.jobSnapshot.title || 'Untitled opportunity'}
                      </strong>
                      <span>
                        {a.jobSnapshot.company || 'Company not specified'} ·{' '}
                        {a.resumeSnapshot.originalFilename}
                      </span>
                      <small>
                        {new Date(a.createdAt).toLocaleString()} ·{' '}
                        {a.semantic.method === 'embeddings'
                          ? 'Embeddings'
                          : 'Local TF-IDF'}
                      </small>
                    </div>
                    <div className="history-score">
                      <strong>
                        {a.overallScore === null ? '—' : `${a.overallScore}%`}
                      </strong>
                      <span>{a.interpretation}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="pagination">
              <button
                className="secondary-button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} of {data.pagination.pages}
              </span>
              <button
                className="secondary-button"
                disabled={page >= data.pagination.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
