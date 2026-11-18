function SkillGroup({ title, matched, missing }) {
  return (
    <section className="match-card">
      <h2>{title}</h2>
      <h3>Matched · {matched.length}</h3>
      {matched.length ? (
        <ul className="evidence-list">
          {matched.map((item) => (
            <li key={item.skill}>
              <strong>{item.skill}</strong>
              {item.evidence.map((e, i) => (
                <p key={i}>
                  <span className="evidence-source">{e.section}</span>
                  {e.text}
                </p>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <p>No matching evidence found.</p>
      )}
      <h3>Missing · {missing.length}</h3>
      <div className="skill-chips">
        {missing.length ? (
          missing.map((skill) => (
            <span className="missing-skill" key={skill}>
              {skill}
            </span>
          ))
        ) : (
          <p>No gaps among classified requirements.</p>
        )}
      </div>
    </section>
  );
}
function RelevantEntries({ title, items }) {
  return (
    <section className="match-card">
      <h2>{title}</h2>
      {items.length ? (
        <ul className="evidence-list">
          {items.map((item, i) => (
            <li key={i}>
              <p>{item.text}</p>
              <small>{item.relevance}% local text relevance</small>
            </li>
          ))}
        </ul>
      ) : (
        <p>No relevant saved evidence identified.</p>
      )}
    </section>
  );
}
export function MatchEvidence({ analysis, requirements }) {
  return (
    <>
      <div className="match-two-column">
        <SkillGroup
          title="Required skills"
          matched={analysis.matchedSkills.required}
          missing={analysis.missingSkills.required}
        />
        <SkillGroup
          title="Preferred skills"
          matched={analysis.matchedSkills.preferred}
          missing={analysis.missingSkills.preferred}
        />
        <RelevantEntries
          title="Relevant projects"
          items={analysis.relevantProjects}
        />
        <RelevantEntries
          title="Relevant work experience"
          items={analysis.relevantExperience}
        />
      </div>
      <section className="match-card">
        <h2>Experience and qualifications</h2>
        {analysis.experienceChecks.length ? (
          analysis.experienceChecks.map((item, i) => (
            <article className="qualification-row" key={i}>
              <strong>{item.requirement}</strong>
              <p>
                {item.demonstratedYears} explicitly stated years found against{' '}
                {item.requiredYears} required. {item.explanation}
              </p>
            </article>
          ))
        ) : (
          <p>
            No explicit mandatory duration requirement was recognized. Project
            and work relevance may still apply.
          </p>
        )}
        {analysis.qualificationChecks.length ? (
          analysis.qualificationChecks.map((item, i) => (
            <article className="qualification-row" key={i}>
              <strong>
                {item.evaluable
                  ? item.matched
                    ? 'Demonstrated'
                    : 'Qualification gap'
                  : 'Needs manual review'}{' '}
                · {item.requirement}
              </strong>
              <p>{item.explanation}</p>
              {item.evidence.map((e, j) => (
                <p key={j}>{e}</p>
              ))}
            </article>
          ))
        ) : (
          <p>
            No assessable mandatory qualification requirement was recognized.
            Unrecognized qualifications require manual review.
          </p>
        )}
      </section>
      <details className="match-card">
        <summary>View parsed job requirements and source evidence</summary>
        <div className="requirements-grid">
          {[
            ['Programming languages', requirements.programmingLanguages],
            ['Frameworks & libraries', requirements.frameworks],
            ['Tools & platforms', requirements.toolsAndPlatforms],
            ['Unclassified skill mentions', requirements.ambiguousSkills],
            ['Responsibilities', requirements.responsibilities],
            [
              'Certifications',
              (requirements.certifications || []).map((c) => c.text),
            ],
          ].map(([title, items]) => (
            <section key={title}>
              <h3>{title}</h3>
              <p>{items.length ? items.join(' · ') : 'None recognized'}</p>
            </section>
          ))}
        </div>
        <ul className="evidence-list">
          {requirements.skillEvidence.map((e, i) => (
            <li key={i}>
              <strong>
                {e.skill} · {e.classification}
              </strong>
              <p>{e.text}</p>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
