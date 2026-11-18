export const initialFilters = {
  resumeId: '',
  keyword: '',
  location: '',
  workMode: '',
  employmentType: '',
  experienceLevel: '',
  minScore: '0',
  source: 'all',
  sort: 'score',
};
export function JobFilters({ filters, setFilters, resumes, busy, onSearch }) {
  const field = (name) => ({
    value: filters[name],
    onChange: (e) => setFilters((f) => ({ ...f, [name]: e.target.value })),
  });
  return (
    <form className="match-card job-filters" onSubmit={onSearch}>
      <label className="job-filter-wide">
        Saved resume
        <select {...field('resumeId')}>
          <option value="">Browse without a score</option>
          {resumes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.originalFilename}
            </option>
          ))}
        </select>
      </label>
      <label className="job-filter-wide">
        Job keywords
        <input
          type="search"
          maxLength={120}
          placeholder="Role, company or skill"
          {...field('keyword')}
        />
      </label>
      <label>
        Location
        <input
          maxLength={120}
          placeholder="Country or region"
          {...field('location')}
        />
      </label>
      <label>
        Work mode
        <select {...field('workMode')}>
          <option value="">Any mode</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">Onsite</option>
        </select>
      </label>
      <label>
        Employment type
        <select {...field('employmentType')}>
          <option value="">Any type</option>
          {['full-time', 'internship', 'contract', 'part-time'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        Experience level
        <select {...field('experienceLevel')}>
          <option value="">Any level</option>
          {['entry', 'junior', 'midlevel', 'senior', 'lead', 'manager'].map(
            (s) => (
              <option key={s}>{s}</option>
            ),
          )}
        </select>
      </label>
      <label>
        Minimum alignment (%)
        <input
          type="number"
          min="0"
          max="100"
          disabled={!filters.resumeId}
          {...field('minScore')}
        />
      </label>
      <label>
        Job source
        <select {...field('source')}>
          <option value="all">All integrated sources</option>
          <option value="jobicy">Jobicy</option>
        </select>
      </label>
      <label>
        Sort results
        <select {...field('sort')}>
          <option value="score">Match score</option>
          <option value="date">Posted date</option>
        </select>
      </label>
      <button className="button" disabled={busy}>
        {busy ? 'Finding opportunities…' : 'Search jobs'}
      </button>
      <p className="job-filter-wide job-meta">
        Filters are your current job preferences. Remote does not mean worldwide
        eligibility. Hybrid and onsite results require an additional authorized
        provider.
      </p>
    </form>
  );
}
