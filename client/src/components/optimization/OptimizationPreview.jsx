export function OptimizationPreview({
  preview,
  busy,
  onSave,
  embeddingBased,
  embeddingConsent,
  setEmbeddingConsent,
  onRecalculate,
  acceptedCount,
}) {
  return (
    <section className="match-card optimization-preview">
      <h2>Preview and compare</h2>
      <p>
        Only accepted, validated edits enter this draft. The original resume
        stays unchanged. Scores may rise, fall, or stay the same.
      </p>
      {embeddingBased && (
        <label className="consent-label">
          <input
            type="checkbox"
            checked={embeddingConsent}
            onChange={(e) => setEmbeddingConsent(e.target.checked)}
            disabled={busy}
          />
          <span>
            I consent to sending the original and revised evidence to the
            original OpenAI embedding model for this comparison and approved
            save. Contact fields are omitted.
          </span>
        </label>
      )}
      <button
        className="button"
        disabled={
          busy || !acceptedCount || (embeddingBased && !embeddingConsent)
        }
        onClick={onRecalculate}
      >
        {busy ? 'Working…' : 'Recalculate preview'}
      </button>
      <p>
        {acceptedCount} accepted edit(s). Multiple edits to one bullet must be
        reconciled before scoring.
      </p>
      {preview && (
        <>
          <div className="comparison-scores" role="status">
            <div>
              <span>Original score</span>
              <strong>{preview.originalScore ?? '—'}%</strong>
            </div>
            <div>
              <span>Optimized score</span>
              <strong>{preview.revisedScore ?? '—'}%</strong>
            </div>
            <div>
              <span>Change</span>
              <strong>
                {preview.improvement === null
                  ? '—'
                  : `${preview.improvement > 0 ? '+' : ''}${preview.improvement}`}{' '}
                pp
              </strong>
            </div>
          </div>
          <p>
            Calculated with the original scoring weights and algorithm:{' '}
            {preview.algorithmVersion}. Estimated alignment, not an employer ATS
            score or hiring probability.
          </p>
          {preview.appliedChanges.map((change) => (
            <div className="bullet-comparison" key={change.suggestionId}>
              <section>
                <h3>
                  Original · {change.section}:{change.index}
                </h3>
                <p>{change.originalText}</p>
              </section>
              <section>
                <h3>Revised</h3>
                <p>{change.revisedText}</p>
              </section>
            </div>
          ))}
          <h3>Remaining skill gaps</h3>
          <p>
            Required:{' '}
            {preview.revisedAnalysis.missingSkills.required.join(', ') ||
              'None among classified requirements'}
          </p>
          <p>
            Preferred:{' '}
            {preview.revisedAnalysis.missingSkills.preferred.join(', ') ||
              'None among classified requirements'}
          </p>
          <details>
            <summary>View revised resume draft</summary>
            <pre className="match-source-text">
              {JSON.stringify(preview.revisedStructuredData, null, 2)}
            </pre>
          </details>
          <button className="button" disabled={busy} onClick={onSave}>
            Approve and save new version
          </button>
        </>
      )}
    </section>
  );
}
