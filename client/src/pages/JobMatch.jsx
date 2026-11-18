import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MatchProcessing } from '../components/match/MatchProcessing';
import { api, mutate, errorMessage } from '../lib/api';
export function JobMatch() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [resumes, setResumes] = useState([]);
  const [resumeId, setResumeId] = useState(params.get('resume') || '');
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      api.get('/resumes', { params: { page, limit: 100 } }),
      api.get('/match/config'),
    ])
      .then(([r, c]) => {
        if (active) {
          setResumes(r.data.resumes);
          setPagination(r.data.pagination);
          setConfig(c.data);
          setResumeId((old) =>
            r.data.resumes.some((x) => x.id === old)
              ? old
              : r.data.resumes[0]?.id || '',
          );
        }
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
  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const form = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const { data } = await mutate(
        '/match/analyze',
        { ...form, resumeId, embeddingConsent: consent },
        { timeout: 30000 },
      );
      navigate(`/app/match/${data.analysis.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="dashboard job-match">
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">CLARITY BEFORE YOUR NEXT MOVE</span>
          <h1>Job Match</h1>
          <p>Compare your saved experience with a specific opportunity.</p>
        </div>
        <Link className="secondary-button" to="/app/history">
          Analysis history
        </Link>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}{' '}
          {!config && (
            <button onClick={() => setRetry((n) => n + 1)}>Try again</button>
          )}
        </div>
      )}
      {loading ? (
        <p role="status">Loading your saved resumes…</p>
      ) : resumes.length === 0 ? (
        <section className="match-card">
          <h2>Start with your resume.</h2>
          <p>Upload and review a resume before analyzing a job description.</p>
          <Link className="button" to="/app/resumes">
            Upload a resume
          </Link>
        </section>
      ) : (
        <form className="match-input-form" onSubmit={submit}>
          <section className="match-card">
            <h2>01 · Choose your resume</h2>
            <label>
              Saved resume
              <select
                value={resumeId}
                disabled={busy}
                onChange={(e) => setResumeId(e.target.value)}
                required
              >
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.originalFilename} · revision {r.version} ·{' '}
                    {r.parsingStatus === 'reviewed'
                      ? 'Reviewed'
                      : 'Review recommended'}
                  </option>
                ))}
              </select>
            </label>
            <p>
              The analysis uses the latest saved corrections. Unsaved edits are
              not included.
            </p>
            {pagination.pages > 1 && (
              <div className="pagination">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous resumes
                </button>
                <span>
                  Page {page} of {pagination.pages}
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || page >= pagination.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next resumes
                </button>
              </div>
            )}
          </section>
          <section className="match-card">
            <h2>02 · Add the opportunity</h2>
            <div className="contact-grid">
              <label>
                Job title (optional)
                <input
                  name="title"
                  maxLength={150}
                  placeholder="Full Stack Developer"
                  disabled={busy}
                />
              </label>
              <label>
                Company (optional)
                <input
                  name="company"
                  maxLength={150}
                  placeholder="Company name"
                  disabled={busy}
                />
              </label>
            </div>
            <label>
              Job description
              <textarea
                name="description"
                rows={14}
                minLength={30}
                maxLength={15000}
                required
                disabled={busy}
                placeholder="Paste the job description, including required skills, preferred skills, responsibilities, and qualifications."
              />
            </label>
            <p>
              Include the original required/preferred wording. Incomplete
              descriptions reduce confidence.
            </p>
          </section>
          <MatchProcessing
            embeddings={config?.embeddings}
            consent={consent}
            setConsent={setConsent}
            busy={busy}
            resumeId={resumeId}
          />
        </form>
      )}
    </main>
  );
}
