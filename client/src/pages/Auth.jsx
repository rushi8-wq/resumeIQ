import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { Brand } from '../components/Brand';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../lib/api';
export function Auth({ mode }) {
  const register = mode === 'register';
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(false);
  if (user) return <Navigate to="/app" replace />;
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await signIn(mode, data);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <aside className="auth-aside">
        <Brand />
        <div>
          <div className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</div>
          <div className="auth-statement">
            Good things
            <br />
            start with
            <br />
            <em>knowing you.</em>
          </div>
          <p>
            A little clarity can change the way you approach your next
            opportunity.
          </p>
        </div>
        <p className="fine-print">
          <ShieldCheck size={18} /> Your information. Your control.
        </p>
      </aside>
      <section className="auth-main">
        <Link className="back-link" to="/">
          ← Back to home
        </Link>
        <div className="auth-form">
          <span className="eyebrow">WELCOME TO RESUMEIQ</span>
          <h1>{register ? 'Make room for what’s next.' : 'Welcome back.'}</h1>
          <p>
            {register
              ? 'Create your private career workspace.'
              : 'Your next chapter is waiting for you.'}
          </p>
          <form onSubmit={submit}>
            {register && (
              <label>
                Full name
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="Your name"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                maxLength={254}
                required
              />
            </label>
            <label>
              Password
              <div className="password-field">
                <input
                  name="password"
                  type={visible ? 'text' : 'password'}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  placeholder={
                    register ? 'At least 12 characters' : 'Enter your password'
                  }
                  required
                  minLength={register ? 12 : 1}
                  maxLength={72}
                />
                <button
                  type="button"
                  aria-label={visible ? 'Hide password' : 'Show password'}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {register && (
              <p className="field-hint">
                Use 12 or more characters. External AI processing is off by
                default.
              </p>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="button" disabled={busy}>
              {busy ? 'One moment…' : register ? 'Create account' : 'Sign in'}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {register ? 'Already have an account?' : 'New to ResumeIQ?'}{' '}
            <Link to={register ? '/login' : '/register'}>
              {register ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
        </div>
        <span className="auth-footnote">
          A clearer path forward, one step at a time.
        </span>
      </section>
    </main>
  );
}
