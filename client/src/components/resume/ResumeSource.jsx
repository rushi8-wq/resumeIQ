import { useState } from 'react';
import { Trash2 } from 'lucide-react';
export function ResumeSource({ resume, busy, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <aside className="resume-source">
      <h2>Extracted text</h2>
      <p>
        Use this read-only source to check the editable fields. Layout may
        differ from your original document.
      </p>
      <pre>
        {resume.extractedText ||
          'No readable text was found. Enter the information from your original resume manually, or upload a text-based document.'}
      </pre>
      <div className="delete-resume">
        <h2>Remove this resume</h2>
        <p>
          Deletes this resume and its saved match analyses permanently. The
          original upload is already discarded.
        </p>
        {confirmDelete ? (
          <div role="alert">
            <p>Delete this resume? This cannot be undone.</p>
            <button
              className="danger-button"
              disabled={busy}
              onClick={onDelete}
            >
              Confirm delete
            </button>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="danger-button"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={16} /> Delete resume
          </button>
        )}
      </div>
    </aside>
  );
}
