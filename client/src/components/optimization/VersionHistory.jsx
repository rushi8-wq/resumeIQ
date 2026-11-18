import { useState } from 'react';
export function VersionHistory({
  versions,
  pagination,
  page,
  setPage,
  busy,
  onDelete,
}) {
  const [deleting, setDeleting] = useState(null);
  return (
    <section className="match-card">
      <h2>Optimized version history</h2>
      {!versions.length ? (
        <p>
          No saved optimized versions yet. Review and recalculate a draft before
          saving.
        </p>
      ) : (
        versions.map((v) => (
          <article className="saved-version" key={v.id}>
            <h3>
              {new Date(v.createdAt).toLocaleString()} · Source revision{' '}
              {v.sourceResumeVersion}
            </h3>
            <p>
              Original {v.originalScore ?? '—'}% → optimized{' '}
              {v.revisedScore ?? '—'}% · {v.improvement > 0 ? '+' : ''}
              {v.improvement ?? '—'} percentage points
            </p>
            <details>
              <summary>View saved version and approved changes</summary>
              <pre className="match-source-text">
                {JSON.stringify(v.revisedStructuredData, null, 2)}
              </pre>
              {v.appliedChanges.map((c, i) => (
                <p key={i}>
                  {c.keyword}: {c.originalText} → {c.revisedText}
                </p>
              ))}
            </details>
            {deleting === v.id ? (
              <>
                <p>Delete this saved version permanently?</p>
                <button
                  className="danger-button"
                  disabled={busy}
                  onClick={() => onDelete(v)}
                >
                  Confirm delete version
                </button>{' '}
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setDeleting(null)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                className="danger-button"
                disabled={busy}
                onClick={() => setDeleting(v.id)}
              >
                Delete version
              </button>
            )}
          </article>
        ))
      )}
      {pagination?.pages > 1 && (
        <div className="pagination">
          <button
            className="secondary-button"
            disabled={busy || page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous versions
          </button>
          <span>
            Page {page} of {pagination.pages}
          </span>
          <button
            className="secondary-button"
            disabled={busy || page >= pagination.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next versions
          </button>
        </div>
      )}
    </section>
  );
}
