import {
  ArrowUpRight,
  ArrowRight,
  Check,
  FileText,
  ShieldCheck,
  Compass,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { useAuth } from '../context/AuthContext';
export function Landing() {
  const { user } = useAuth();
  return (
    <div className="landing">
      <header className="public-nav">
        <Brand />
        <nav aria-label="Main">
          <a href="#approach">Our approach</a>
          <Link to={user ? '/app' : '/login'}>
            {user ? 'Your workspace' : 'Sign in'} <ArrowUpRight size={16} />
          </Link>
        </nav>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="status-dot" /> A MORE INTENTIONAL JOB SEARCH
            </div>
            <h1>
              Your experience.
              <br />
              Your next <em>chapter.</em>
            </h1>
            <p className="intro">
              Make sense of what you bring to the table. Build a clearer resume
              and find opportunities that fit.
            </p>
            <Link className="button" to={user ? '/app' : '/register'}>
              {user ? 'Open your workspace' : 'Create your workspace'}
              <ArrowRight size={18} />
            </Link>
            <p className="fine-print">
              <ShieldCheck size={15} /> Private by default. Your experience
              stays yours.
            </p>
          </div>
          <div
            className="editorial-visual"
            aria-label="ResumeIQ approach: understand, refine, discover"
          >
            <div className="visual-top">
              <span>THE NEXT CHAPTER</span>
              <span>01 — 03</span>
            </div>
            <div className="visual-word">
              Find
              <br />
              your <em>fit.</em>
            </div>
            <div className="visual-rule" />
            <div className="visual-step">
              <span>01</span> Understand your experience <Check size={17} />
            </div>
            <div className="visual-step">
              <span>02</span> Tell a clearer story <ArrowUpRight size={17} />
            </div>
            <div className="visual-step">
              <span>03</span> Discover your direction <ArrowUpRight size={17} />
            </div>
            <div className="visual-bottom">LESS GUESSWORK. MORE DIRECTION.</div>
          </div>
        </section>
        <section className="approach" id="approach">
          <div className="section-intro">
            <div className="eyebrow">BUILT WITH INTENTION</div>
            <h2>
              A thoughtful foundation
              <br />
              for your next move.
            </h2>
            <p>
              We’re building ResumeIQ step by step. Your secure workspace is
              ready. Upload, review, and compare your resume with a job now. Job
              discovery is coming next.
            </p>
          </div>
          <div className="approach-list">
            {[
              [
                ShieldCheck,
                '01',
                'A workspace you can trust',
                'Create an account, sign in securely, and return to your private workspace.',
                'Available now',
              ],
              [
                FileText,
                '02',
                'Clarity, backed by evidence',
                'Upload your PDF or DOCX, review extracted skills and experience, and correct the details.',
                'Available now',
              ],
              [
                Compass,
                '03',
                'Opportunity with context',
                'Discover roles with explainable alignment and honest skill-gap insights.',
                'In development',
              ],
            ].map(([Icon, n, title, body, status]) => (
              <article key={n}>
                <span className="approach-number">{n}</span>
                <div>
                  <Icon size={22} />
                  <h3>{title}</h3>
                  <p>{body}</p>
                  <span className="tag">{status}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
      <footer>
        <Brand />
        <span>Build on what makes you, you.</span>
        <span>© {new Date().getFullYear()} ResumeIQ</span>
      </footer>
    </div>
  );
}
