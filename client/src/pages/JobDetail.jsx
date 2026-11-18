import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, mutate, errorMessage } from '../lib/api';
import { JobCard } from '../components/JobCard';
export function JobDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const resumeId = params.get('resumeId') || '';
  const [job, setJob] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    api
      .get(`/jobs/${id}`, {
        params: resumeId ? { resumeId } : {},
        timeout: 60000,
      })
      .then((r) => current && setJob(r.data.job))
      .catch((e) => current && setError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [id, resumeId]);
  async function save() {
    setBusy(true);
    setError('');
    try {
      if (job.savedId) {
        await mutate(`/jobs/saved/${job.savedId}`, undefined, {
          method: 'delete',
        });
        setJob((j) => ({ ...j, savedId: null }));
      } else {
        const r = await mutate('/jobs/save', { jobId: id, resumeId });
        setJob((j) => ({ ...j, savedId: r.data.saved.id }));
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="dashboard">
      <Link to="/app/jobs">← Job discovery</Link>
      <h1>Job details</h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!job && !error && <p role="status">Loading job…</p>}
      {job && (
        <>
          {job.expired && (
            <p className="error">
              This cached listing has expired. Check the source for availability
              before applying.
            </p>
          )}
          <JobCard
            expanded
            job={job}
            resumeId={resumeId}
            onSave={save}
            busy={busy}
          />
          <section className="match-card">
            <h2>Full description</h2>
            {job.descriptionTruncated && (
              <p className="error">
                This description exceeds the 15,000 character limit. The excerpt
                below was used for scoring; read the complete listing at the
                source.
              </p>
            )}
            <p className="job-meta">
              Original source link:{' '}
              <a
                href={job.applicationUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {job.applicationUrl}
              </a>
            </p>
            <p>
              Last fetched: {new Date(job.fetchedAt).toLocaleString()}.{' '}
              {job.lastVerifiedAt
                ? `Last verified: ${new Date(job.lastVerifiedAt).toLocaleString()}`
                : 'Availability has not been individually verified.'}
            </p>
            {job.salary && (
              <p>
                Salary: {job.salary.min ?? 'Unspecified minimum'} –{' '}
                {job.salary.max ?? 'Unspecified maximum'} {job.salary.currency}{' '}
                / {job.salary.period || 'period not provided'}
              </p>
            )}
            <div className="job-description">{job.description}</div>
          </section>
          {job.recommendation && (
            <section className="match-card">
              <h2>Score details</h2>
              <p>
                Algorithm: {job.recommendation.algorithmVersion} · Resume
                version {job.recommendation.resumeVersion}
              </p>
              <dl className="job-components">
                {Object.entries(job.recommendation.componentScores).map(
                  ([key, c]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>
                        {c.score ?? 'Not applicable'}{' '}
                        {c.applicable
                          ? `· effective weight ${c.effectiveWeight}%`
                          : ''}
                        <p>{c.explanation}</p>
                      </dd>
                    </div>
                  ),
                )}
              </dl>
              <ul>
                {job.recommendation.limitations.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
