import { Link } from 'react-router-dom';
import { Bookmark, ArrowUpRight } from 'lucide-react';
export function JobCard({
  job,
  resumeId,
  onSave,
  busy = false,
  expanded = false,
}) {
  const r = job.recommendation;
  const matched = [
    ...(r?.matchedSkills.required || []),
    ...(r?.matchedSkills.preferred || []),
  ].map((s) => s.skill);
  const missing = [
    ...(r?.missingSkills.required || []),
    ...(r?.missingSkills.preferred || []),
  ];
  return (
    <article className="job-card">
      <div className="job-card-top">
        <span className="eyebrow">
          {job.source} · {job.workMode || 'Mode not specified'}
        </span>
        <strong className="job-score">
          {r?.matchScore == null ? '—' : `${r.matchScore}%`}
          <small>alignment</small>
        </strong>
      </div>
      <h2>
        <Link
          to={`/app/jobs/${job.id}${resumeId ? `?resumeId=${resumeId}` : ''}`}
        >
          {job.title}
        </Link>
      </h2>
      <p className="job-company">{job.company}</p>
      <p>{job.location || 'Location not provided'}</p>
      <div className="job-meta">
        {job.employmentType.length
          ? job.employmentType.join(' · ')
          : 'Employment type not provided'}{' '}
        · {job.experienceLevel || 'Level not provided'}
      </div>
      <p className="job-meta">
        Posted{' '}
        {job.postedAt
          ? new Date(job.postedAt).toLocaleDateString()
          : 'date unknown'}{' '}
        · Fetched {new Date(job.fetchedAt).toLocaleString()}
      </p>
      {r && (
        <>
          <div className="job-skills">
            <strong>Matched</strong>
            {matched.length ? (
              matched.slice(0, expanded ? undefined : 8).map((s) => (
                <span className="tag" key={s}>
                  {s}
                </span>
              ))
            ) : (
              <span>No recognized skills matched</span>
            )}
          </div>
          <div className="job-skills">
            <strong>Missing</strong>
            {missing.length ? (
              missing.slice(0, expanded ? undefined : 8).map((s) => (
                <span className="tag job-gap" key={s}>
                  {s}
                </span>
              ))
            ) : (
              <span>No recognized gaps; review the full requirements</span>
            )}
          </div>
          <p className="job-explanation">{r.explanation}</p>
        </>
      )}
      <div className="job-actions">
        <Link
          className="secondary-button"
          to={`/app/jobs/${job.id}${resumeId ? `?resumeId=${resumeId}` : ''}`}
        >
          View details
        </Link>
        <button
          className="secondary-button"
          disabled={
            busy || (!resumeId && !job.savedId) || (job.expired && !job.savedId)
          }
          onClick={() => onSave(job)}
        >
          <Bookmark size={16} />
          {job.savedId ? 'Unsave job' : 'Save job'}
        </button>
        <a
          className="button"
          href={job.applicationUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Apply externally <ArrowUpRight size={16} />
        </a>
      </div>
    </article>
  );
}
