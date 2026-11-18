import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, mutate, errorMessage } from '../lib/api';
export function SavedJobs() {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1);
  async function load(p = page) {
    setBusy(true);
    setError('');
    try {
      setData(
        (await api.get('/jobs/saved', { params: { page: p, limit: 12 } })).data,
      );
      setPage(p);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load(1);
  }, []);
  async function remove(id) {
    setBusy(true);
    try {
      await mutate(`/jobs/saved/${id}`, undefined, { method: 'delete' });
      await load(data.jobs.length === 1 && page > 1 ? page - 1 : page);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="dashboard">
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">OPPORTUNITIES TO RETURN TO</span>
          <h1>Saved jobs</h1>
          <p>Your private bookmarks. Availability can change at the source.</p>
        </div>
        <Link className="button" to="/app/jobs">
          Discover jobs
        </Link>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {busy && <p role="status">Updating saved jobs…</p>}
      {data?.jobs.length === 0 && (
        <p>
          No saved jobs yet. Select a resume in Job discovery to bookmark a
          listing.
        </p>
      )}
      <div className="job-grid">
        {data?.jobs.map((s) => (
          <article className="job-card" key={s.id}>
            <span className="eyebrow">
              {s.job?.source || 'Source unavailable'}
            </span>
            <h2>{s.job?.title || 'Listing unavailable'}</h2>
            <p>
              {s.job?.company} · {s.job?.location || 'Location not provided'}
            </p>
            <p>Saved {new Date(s.savedAt).toLocaleDateString()}</p>
            {s.job?.expired && (
              <p className="error">
                Expired cached listing; check availability at the source.
              </p>
            )}
            <div className="job-actions">
              {s.job && (
                <>
                  <Link
                    className="secondary-button"
                    to={`/app/jobs/${s.job.id}?resumeId=${s.resumeId}`}
                  >
                    View details
                  </Link>
                  <a
                    className="secondary-button"
                    href={s.job.applicationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Apply externally ↗
                  </a>
                </>
              )}
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => remove(s.id)}
              >
                Remove saved job
              </button>
            </div>
          </article>
        ))}
      </div>
      {data && (
        <div className="pagination">
          <button
            className="secondary-button"
            disabled={busy || page <= 1}
            onClick={() => load(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {Math.max(1, data.pagination.pages)}
          </span>
          <button
            className="secondary-button"
            disabled={busy || page >= data.pagination.pages}
            onClick={() => load(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </main>
  );
}
