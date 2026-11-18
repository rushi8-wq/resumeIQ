import { useState } from 'react';
const labels = {
  supported: 'Supported by evidence',
  confirmation_required: 'Requires confirmation',
  skill_gap: 'Genuine skill gap',
};
export function SuggestionCard({ suggestion: s, busy, onDecision, onDelete }) {
  const [text, setText] = useState(s.editedText || s.suggestedText);
  const [editing, setEditing] = useState(false);
  const [confirmed, setConfirmed] = useState(s.confirmed);
  const [evidence, setEvidence] = useState(s.confirmationEvidence || '');
  const [deleting, setDeleting] = useState(false);
  const changed =
    text !== (s.editedText || s.suggestedText) ||
    confirmed !== s.confirmed ||
    evidence !== (s.confirmationEvidence || '');
  const decision = (status) =>
    onDecision(s, {
      status,
      editedText: text,
      confirmed,
      confirmationEvidence: evidence,
      revision: s.revision,
    });
  return (
    <article className="match-card suggestion-card">
      <div className="suggestion-heading">
        <h3>{s.keyword}</h3>
        <span className="tag">{s.importance}</span>
        <span className="tag">{labels[s.verificationStatus]}</span>
        <span className="tag">{s.status}</span>
        {s.confirmed && <span className="tag">User-confirmed addition</span>}
      </div>
      <p>{s.explanation}</p>
      <p>
        <strong>Job requirement:</strong> {s.requirement}
      </p>
      {s.evidence.length > 0 && (
        <details>
          <summary>View cited resume evidence</summary>
          {s.evidence.map((e) => (
            <blockquote key={e.id}>
              <small>{e.id}</small>
              <p>{e.text}</p>
            </blockquote>
          ))}
        </details>
      )}
      {s.guardNotes.length > 0 && (
        <p className="parsing-warning">{s.guardNotes.join(' ')}</p>
      )}
      {s.verificationStatus === 'skill_gap' ? (
        <p className="learning-note">
          Learning recommendation only. This cannot be added to your current
          resume or score.
        </p>
      ) : (
        <>
          <div className="bullet-comparison">
            <section>
              <h4>Original bullet</h4>
              <p>{s.originalText || 'No editable source selected.'}</p>
            </section>
            <section>
              <h4>Proposed bullet</h4>
              {editing ? (
                <label>
                  Edited bullet
                  <textarea
                    rows={5}
                    maxLength={2000}
                    value={text}
                    disabled={busy}
                    onChange={(e) => setText(e.target.value)}
                  />
                </label>
              ) : (
                <p>{text || 'No proposed edit.'}</p>
              )}
            </section>
          </div>
          <button
            className="secondary-button"
            disabled={busy || !s.section}
            onClick={() => setEditing(!editing)}
          >
            {editing ? 'Close editor' : 'Edit suggestion'}
          </button>
          <details
            className="confirmation-details"
            open={s.verificationStatus === 'confirmation_required' || undefined}
          >
            <summary>Confirm additional factual support (if needed)</summary>
            <label>
              Factual confirmation evidence
              <textarea
                rows={3}
                maxLength={2000}
                value={evidence}
                disabled={busy}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="Describe the actual experience supporting this specific bullet. Do not add future learning plans."
              />
            </label>
            <label className="consent-label">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                I confirm these additional claims accurately describe my real
                experience in this project or role.
              </span>
            </label>
          </details>
        </>
      )}
      <div className="suggestion-actions">
        <button
          className="button"
          disabled={
            busy ||
            s.verificationStatus === 'skill_gap' ||
            !s.section ||
            (s.status === 'accepted' && !changed)
          }
          onClick={() => decision('accepted')}
        >
          Accept suggestion
        </button>
        <button
          className="secondary-button"
          disabled={busy || s.status === 'rejected'}
          onClick={() => decision('rejected')}
        >
          Reject suggestion
        </button>
        <button
          className="secondary-button"
          disabled={busy || s.status === 'pending'}
          onClick={() => {
            setText(s.suggestedText);
            setConfirmed(false);
            setEvidence('');
            onDecision(s, {
              status: 'pending',
              editedText: s.suggestedText,
              revision: s.revision,
            });
          }}
        >
          Revert decision
        </button>
        {deleting ? (
          <>
            <button
              className="danger-button"
              disabled={busy}
              onClick={() => onDelete(s)}
            >
              Confirm delete suggestion
            </button>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => setDeleting(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            className="danger-button"
            disabled={busy}
            onClick={() => setDeleting(true)}
          >
            Delete suggestion
          </button>
        )}
      </div>
    </article>
  );
}
