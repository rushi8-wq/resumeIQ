export const resumeSections = [
  ['education', 'Education'],
  ['skills', 'Skills'],
  ['projects', 'Projects'],
  ['workExperience', 'Work experience'],
  ['certifications', 'Certifications'],
  ['achievements', 'Achievements'],
];
export function ResumeEditor({ draft, setDraft, disabled }) {
  const update = (field, value) =>
    setDraft((previous) => ({ ...previous, [field]: value }));
  return (
    <fieldset disabled={disabled} className="resume-editor">
      <legend className="sr-only">Correct your resume information</legend>
      <section className="editor-section">
        <h2>Contact information</h2>
        <p>Leave anything blank if it is not present in your resume.</p>
        <div className="contact-grid">
          <label>
            Full name
            <input
              value={draft.name}
              maxLength={150}
              autoComplete="off"
              onChange={(e) => update('name', e.target.value)}
            />
          </label>
          <label>
            Email address
            <input
              value={draft.email}
              type="email"
              maxLength={254}
              autoComplete="off"
              onChange={(e) => update('email', e.target.value)}
            />
          </label>
        </div>
      </section>
      {resumeSections.map(([field, label]) => (
        <section key={field} className="editor-section">
          <h2>{label}</h2>
          <label>
            <span className="field-hint">
              {field === 'skills'
                ? 'One skill per line. Known technology aliases are normalized when saved.'
                : 'One entry or bullet point per line. Add only information that accurately describes your experience.'}
            </span>
            <textarea
              aria-label={label}
              rows={field === 'skills' ? 4 : 5}
              value={draft[field]}
              maxLength={field === 'skills' ? 12100 : 200100}
              onChange={(e) => update(field, e.target.value)}
            />
          </label>
        </section>
      ))}
    </fieldset>
  );
}
export function toDraft(data) {
  return {
    ...data,
    ...Object.fromEntries(
      resumeSections.map(([key]) => [key, data[key].join('\n')]),
    ),
  };
}
export function fromDraft(draft) {
  return {
    ...draft,
    ...Object.fromEntries(
      resumeSections.map(([key]) => [
        key,
        draft[key]
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      ]),
    ),
  };
}
