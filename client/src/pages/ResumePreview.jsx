import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Check, FileText } from 'lucide-react';
import { api, mutate, errorMessage } from '../lib/api';
import {
  ResumeEditor,
  toDraft,
  fromDraft,
} from '../components/resume/ResumeEditor';
import { ResumeSource } from '../components/resume/ResumeSource';
import { statusLabel } from './Resumes';
export function ResumePreview() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [resume, setResume] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [success, setSuccess] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true);
    setResume(null);
    setDraft(null);
    setSuccess('');
    setError('');
    api
      .get(`/resumes/${id}`)
      .then(({ data }) => {
        if (active) {
          setResume(data.resume);
          setDraft(toDraft(data.resume.structuredData));
          if (location.state?.uploaded && data.resume.version === 1)
            setSuccess(
              'Resume uploaded and parsed. Please review the information below.',
            );
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, reload]);
  const dirty =
    !!resume &&
    !!draft &&
    JSON.stringify(draft) !== JSON.stringify(toDraft(resume.structuredData));
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await mutate(
        `/resumes/${id}`,
        { structuredData: fromDraft(draft), version: resume.version },
        { method: 'patch' },
      );
      setResume(data.resume);
      setDraft(toDraft(data.resume.structuredData));
      setSuccess('Corrections saved. Your resume is marked as reviewed.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError('');
    try {
      await mutate(`/resumes/${id}`, undefined, { method: 'delete' });
      navigate('/app/resumes', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main className="dashboard" role="status">
        Loading your resume…
      </main>
    );
  if (!resume)
    return (
      <main className="dashboard">
        <h1>Resume unavailable</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <button
          className="secondary-button"
          onClick={() => setReload((n) => n + 1)}
        >
          Try again
        </button>{' '}
        <Link to="/app/resumes">Back to my resumes</Link>
      </main>
    );
  return (
    <main className="dashboard resume-preview">
      <Link
        className="back-link"
        to="/app/resumes"
        onClick={(e) => {
          if (dirty && !window.confirm('Discard your unsaved corrections?'))
            e.preventDefault();
        }}
      >
        ← Back to my resumes
      </Link>
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">REVIEW YOUR STORY</span>
          <h1>{resume.originalFilename}</h1>
          <p>
            {resume.fileType.toUpperCase()} · Uploaded{' '}
            {new Date(resume.uploadedAt).toLocaleDateString()} · Version{' '}
            {resume.version}
          </p>
        </div>
        <span className="tag">
          <FileText size={14} />
          {statusLabel(resume.parsingStatus)}
        </span>
      </div>
      {success && (
        <p className="success" role="status">
          <Check size={17} />
          {success}
        </p>
      )}
      {resume.warnings.length > 0 && (
        <aside className="parsing-warning" aria-label="Parsing notes">
          <strong>Parsing notes — check against your original resume</strong>
          <ul>
            {resume.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p>
            These notes describe the original extraction and remain available
            after corrections.
          </p>
        </aside>
      )}
      <p>
        <Link className="secondary-button" to={`/app/match?resume=${id}`}>
          Analyze this saved resume
        </Link>
      </p>
      <div className="resume-preview-grid">
        <form onSubmit={save}>
          <ResumeEditor
            draft={draft}
            setDraft={(value) => {
              setDraft(value);
              setSuccess('');
            }}
            disabled={busy}
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="editor-actions">
            <button className="button" disabled={busy}>
              {busy ? 'Saving…' : 'Save corrections'}
            </button>
            <span>
              {dirty
                ? 'Unsaved changes'
                : resume.parsingStatus === 'reviewed'
                  ? 'All corrections saved'
                  : 'Review each section, then save to confirm.'}
            </span>
          </div>
        </form>
        <ResumeSource resume={resume} busy={busy} onDelete={remove} />
      </div>
    </main>
  );
}
