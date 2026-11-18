import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, ArrowUpRight } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { ResumeUpload } from '../components/resume/ResumeUpload';
export const statusLabel = (status) =>
  status === 'reviewed'
    ? 'Reviewed'
    : status === 'needs_review'
      ? 'Needs attention'
      : 'Ready to review';
export function Resumes() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    api
      .get('/resumes', { params: { page, limit: 10 } })
      .then(({ data }) => {
        if (active) {
          setItems(data.resumes);
          setPagination(data.pagination);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [page, reload]);
  return (
    <main className="dashboard resumes-page">
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">YOUR EXPERIENCE, IN YOUR WORDS</span>
          <h1>My resumes</h1>
          <p>A private home for your professional story.</p>
        </div>
      </div>
      <ResumeUpload
        onUploaded={(resume) =>
          navigate(`/app/resumes/${resume.id}`, { state: { uploaded: true } })
        }
      />
      <section className="resume-library" aria-labelledby="library-title">
        <div className="resume-section-heading">
          <h2 id="library-title">Your resume library</h2>
          <span className="tag">{pagination?.total ?? '—'} resumes</span>
        </div>
        {error ? (
          <div className="error" role="alert">
            {error}{' '}
            <button onClick={() => setReload((n) => n + 1)}>Try again</button>
          </div>
        ) : busy ? (
          <p role="status">Loading your resumes…</p>
        ) : items.length === 0 ? (
          <div className="resume-empty">
            <FileText size={28} />
            <h3>Your story starts here.</h3>
            <p>Upload your first resume to see its extracted information.</p>
          </div>
        ) : (
          <>
            <ul className="resume-list">
              {items.map((item) => (
                <li key={item.id}>
                  <Link to={`/app/resumes/${item.id}`}>
                    <FileText size={22} />
                    <div>
                      <strong>{item.originalFilename}</strong>
                      <span>
                        {item.fileType.toUpperCase()} ·{' '}
                        {new Date(item.uploadedAt).toLocaleDateString()} ·{' '}
                        {statusLabel(item.parsingStatus)}
                      </span>
                    </div>
                    <ArrowUpRight size={18} />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="pagination">
              <button
                className="secondary-button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} of {pagination.pages}
              </span>
              <button
                className="secondary-button"
                disabled={page >= pagination.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
