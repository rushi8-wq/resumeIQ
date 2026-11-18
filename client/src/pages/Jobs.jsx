import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, mutate, errorMessage } from '../lib/api';
import { JobCard } from '../components/JobCard';
import { JobFilters, initialFilters } from '../components/JobFilters';
export function Jobs() {
  const [filters, setFilters] = useState(initialFilters),
    [resumes, setResumes] = useState([]),
    [data, setData] = useState(null),
    [sources, setSources] = useState([]),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(''),
    [error, setError] = useState(''),
    [active, setActive] = useState(initialFilters);
  useEffect(() => {
    let current = true;
    Promise.all([
      api.get('/resumes?limit=100'),
      api.get('/jobs/providers/status'),
    ])
      .then(([r, s]) => {
        if (current) {
          setResumes(r.data.resumes);
          setSources(
            s.data.providers.filter((p) => p.mode === 'external-search'),
          );
        }
      })
      .catch((e) => current && setError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, []);
  async function search(e, page = 1, f = filters) {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try {
      const params = {
        ...f,
        page,
        limit: 12,
        minScore: f.resumeId ? f.minScore : 0,
      };
      if (!f.resumeId) delete params.resumeId;
      const response = await api.get(
        f.resumeId ? '/jobs/recommended' : '/jobs',
        { params, timeout: 60000 },
      );
      setData(response.data);
      setActive({ ...f });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(job) {
    setSaving(job.id);
    setError('');
    try {
      let savedId = null;
      if (job.savedId)
        await mutate(`/jobs/saved/${job.savedId}`, undefined, {
          method: 'delete',
        });
      else
        savedId = (
          await mutate('/jobs/save', {
            jobId: job.id,
            resumeId: active.resumeId,
          })
        ).data.saved.id;
      setData((d) => ({
        ...d,
        jobs: d.jobs.map((j) => (j.id === job.id ? { ...j, savedId } : j)),
      }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving('');
    }
  }
  return (
    <main className="dashboard">
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">YOUR EXPERIENCE. NEW POSSIBILITIES.</span>
          <h1>Job discovery</h1>
          <p>Find opportunities and see how your saved experience aligns.</p>
        </div>
        <Link className="secondary-button" to="/app/saved-jobs">
          Saved jobs
        </Link>
      </div>
      <JobFilters
        filters={filters}
        setFilters={setFilters}
        resumes={resumes}
        busy={busy}
        onSearch={search}
      />
      {!resumes.length && (
        <p>
          To get personalized scores and save jobs,{' '}
          <Link to="/app/resumes">upload a resume</Link>.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <div className="job-source-notice" role="status">
            <strong>
              {data.provider.fixture
                ? 'Automated-test fixtures · no live provider request'
                : data.provider.state === 'live'
                  ? 'Live sync completed'
                  : data.provider.state === 'cached'
                    ? 'Cached results'
                    : data.provider.state === 'stale'
                      ? 'Provider unavailable · using stale cache'
                      : 'Provider unavailable'}
            </strong>
            <p>
              Source:{' '}
              <a
                href="https://jobicy.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Jobicy
              </a>
              .{' '}
              {data.provider.fetchedAt
                ? `Last successful fetch: ${new Date(data.provider.fetchedAt).toLocaleString()}. `
                : ''}
              Fetched listings have not been individually verified as open. Sync
              runs at most hourly; listings expire from discovery after seven
              days without refresh.{' '}
              {data.provider.partialCoverage
                ? 'Each sync imports up to 300 recent listings; earlier cached listings may remain.'
                : ''}
            </p>
            <p>
              Alignment uses the existing local scoring engine, not AI
              percentages. Scores are not hiring probabilities. The skill
              dictionary has limited coverage outside technology; read each full
              description.
            </p>
          </div>
          <h2>
            {active.resumeId
              ? 'Recommended for you'
              : 'Available opportunities'}{' '}
            <span className="job-result-count">
              {data.pagination.total} results
            </span>
          </h2>
          {active.resumeId && (
            <p>
              Based on {data.resume.filename}, saved version{' '}
              {data.resume.version}, and the selected job preferences.
            </p>
          )}
          {!data.jobs.length && (
            <div className="match-card">
              <h3>No jobs match these preferences</h3>
              <p>
                Try a broader keyword, location or lower minimum score. The
                source currently provides remote jobs only.
              </p>
            </div>
          )}
          <div className="job-grid" aria-busy={busy}>
            {data.jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                resumeId={active.resumeId}
                onSave={save}
                busy={saving === job.id}
              />
            ))}
          </div>
          <div className="pagination">
            <button
              className="secondary-button"
              disabled={busy || data.pagination.page <= 1}
              onClick={() => search(null, data.pagination.page - 1, active)}
            >
              Previous
            </button>
            <span>
              Page {data.pagination.page} of{' '}
              {Math.max(1, data.pagination.pages)}
            </span>
            <button
              className="secondary-button"
              disabled={busy || data.pagination.page >= data.pagination.pages}
              onClick={() => search(null, data.pagination.page + 1, active)}
            >
              Next
            </button>
          </div>
        </>
      )}
      <section className="match-card external-job-sources">
        <h2>Search other platforms</h2>
        <p>
          External searches open the source website. These results are not
          imported, verified or scored by ResumeIQ.
        </p>
        <div className="job-actions">
          {sources.map((s) => (
            <a
              key={s.source}
              className="secondary-button"
              href={
                s.source === 'linkedin'
                  ? `${s.url}?${new URLSearchParams({ keywords: filters.keyword, location: filters.location })}`
                  : s.url
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              {s.name} ↗
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
