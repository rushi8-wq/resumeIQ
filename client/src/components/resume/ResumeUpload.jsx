import { useRef, useState } from 'react';
import { Upload, ShieldCheck } from 'lucide-react';
import { mutate, errorMessage } from '../../lib/api';
const MAX_SIZE = 5 * 1024 * 1024;
export function ResumeUpload({ onUploaded }) {
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [filename, setFilename] = useState('');
  async function upload(file) {
    if (busy || !file) return;
    setError('');
    if (file.size > MAX_SIZE) {
      setError('Resume files must be 5 MB or smaller.');
      return;
    }
    if (!/\.(pdf|docx)$/i.test(file.name) || file.size === 0) {
      setError('Choose a non-empty PDF or DOCX resume.');
      return;
    }
    setBusy(true);
    setProgress(0);
    setFilename(file.name);
    const body = new FormData();
    body.append('resume', file);
    try {
      const { data } = await mutate('/resumes/upload', body, {
        timeout: 30000,
        onUploadProgress: (event) =>
          setProgress(Math.min(100, Math.round((event.progress || 0) * 100))),
      });
      onUploaded(data.resume);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <section className="resume-upload" aria-labelledby="upload-title">
      <h2 id="upload-title">Bring your experience into focus.</h2>
      <p>
        Upload your resume, then review and correct the extracted information.
      </p>
      <div
        className={`drop-zone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length !== 1) {
            setError('Please upload one resume at a time.');
            return;
          }
          upload(e.dataTransfer.files[0]);
        }}
        aria-busy={busy}
      >
        <Upload size={28} />
        <strong>{busy ? filename : 'Drop a resume here'}</strong>
        <span>PDF or DOCX · up to 5 MB</span>
        <input
          ref={input}
          id="resume-file"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          aria-label="Resume file"
          onChange={(e) => upload(e.target.files[0])}
          disabled={busy}
        />
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => input.current.click()}
        >
          {busy ? 'Processing…' : 'Choose a file'}
        </button>
        {busy && (
          <div className="upload-progress" role="status">
            <progress max="100" value={progress} aria-label="Upload progress" />
            <span>
              {progress < 100
                ? `Uploading ${progress}%`
                : 'Upload complete. Reading your document…'}
            </span>
          </div>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="fine-print">
        <ShieldCheck size={16} /> Parsed privately on our server. No external AI
        processing. Original files are not retained.
      </p>
    </section>
  );
}
