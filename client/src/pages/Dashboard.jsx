import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  ScanLine,
  Compass,
  Bookmark,
  ArrowUpRight,
  ShieldCheck,
  Check,
  Circle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, errorMessage } from '../lib/api';
export function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  async function load() {
    setError('');
    try {
      setData((await api.get('/dashboard')).data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <main className="dashboard">
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">A LITTLE CLARITY. A NEW DIRECTION.</span>
          <h1>Welcome, {user.name.split(' ')[0]}.</h1>
          <p>Let’s make your next career move an intentional one.</p>
        </div>
        <span className="tag">
          <span className="status-dot" /> Workspace ready
        </span>
      </div>
      {error && (
        <div className="error" role="alert">
          {error} <button onClick={load}>Try again</button>
        </div>
      )}
      <section
        className="metrics"
        aria-label="Workspace statistics"
        aria-busy={!data}
      >
        {[
          [FileText, 'Resumes', data?.metrics.resumes],
          [ScanLine, 'Completed analyses', data?.metrics.analyses],
          [Compass, 'Average alignment', data?.metrics.averageScore ?? '—'],
          [Bookmark, 'Saved jobs', data?.metrics.savedJobs],
        ].map(([Icon, label, value]) => (
          <div key={label}>
            <span>
              <Icon size={18} />
              {label}
            </span>
            <strong>{data ? value : '…'}</strong>
            <small>
              {label === 'Average alignment'
                ? data?.metrics.averageScore == null
                  ? 'Available after your first analysis'
                  : 'Across saved analyses'
                : 'Your workspace starts here'}
            </small>
          </div>
        ))}
      </section>
      <div className="dashboard-grid">
        <section className="welcome-panel">
          <span className="eyebrow">YOUR CAREER, WITH MORE CONTEXT</span>
          <h2>
            Start with your story.
            <br />
            <em>Find where it belongs.</em>
          </h2>
          <p>
            Upload your resume, review the extracted information, and make sure
            your experience is represented accurately.
          </p>
          <Link className="availability" to="/app/resumes">
            <FileText size={18} /> Upload or review a resume{' '}
            <ArrowUpRight size={16} />
          </Link>
          <Link className="availability" to="/app/match">
            <ScanLine size={18} /> Compare with a job <ArrowUpRight size={16} />
          </Link>
          <Link className="availability" to="/app/jobs">
            <Compass size={18} />
            Discover matching jobs <ArrowUpRight size={16} />
          </Link>
          <div className="panel-footer">
            <ShieldCheck size={16} /> Resume content is never sent to external
            AI during parsing.
          </div>
        </section>
        <section className="roadmap">
          <span className="eyebrow">THE PATH AHEAD</span>
          <h2>Building your workspace</h2>
          {[
            ['Secure account & workspace', 'Available now', true],
            ['Resume upload & parsing', 'Available now', true],
            ['Explainable match analysis', 'Available now', true],
            ['Evidence-based AI improvements', 'Available now', true],
            ['Personalized job discovery', 'Available now', true],
          ].map(([title, n, done]) => (
            <div className="roadmap-row" key={title}>
              {done ? (
                <Check className="done" size={20} />
              ) : (
                <Circle size={19} />
              )}
              <div>
                <strong>{title}</strong>
                <small>{n}</small>
              </div>
            </div>
          ))}
        </section>
      </div>
      <section className="privacy-strip">
        <ShieldCheck size={24} />
        <div>
          <h2>Your experience stays yours.</h2>
          <p>
            Resume parsing stays local. External embeddings require consent for
            each analysis. Scores estimate job alignment, never hiring
            probability.
          </p>
        </div>
        <ArrowUpRight size={20} />
      </section>
    </main>
  );
}
