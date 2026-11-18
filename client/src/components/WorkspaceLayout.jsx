import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  ScanLine,
  WandSparkles,
  Compass,
  Bookmark,
  History,
  LogOut,
  Moon,
  Sun,
  ShieldCheck,
} from 'lucide-react';
import { Brand } from './Brand';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../lib/api';
export function WorkspaceLayout() {
  const { user, signOut } = useAuth();
  const [error, setError] = useState('');
  const [dark, setDark] = useState(
    () => localStorage.getItem('resumeiq-theme') === 'dark',
  );
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('resumeiq-theme', dark ? 'dark' : 'light');
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [dark]);
  const links = (
    <>
      <NavLink
        end
        to="/app"
        className={({ isActive }) => (isActive ? 'active' : '')}
      >
        <LayoutDashboard size={18} />
        Overview
      </NavLink>
      <NavLink
        to="/app/resumes"
        className={({ isActive }) => (isActive ? 'active' : '')}
      >
        <FileText size={18} />
        My resumes
      </NavLink>
      <NavLink
        to="/app/match"
        className={({ isActive }) => (isActive ? 'active' : '')}
      >
        <ScanLine size={18} />
        Job Match
      </NavLink>
      <NavLink
        to="/app/history"
        className={({ isActive }) => (isActive ? 'active' : '')}
      >
        <History size={18} />
        History
      </NavLink>
      <NavLink
        to="/app/optimization"
        className={({ isActive }) => (isActive ? 'active' : '')}
      >
        <WandSparkles size={18} />
        AI Optimization
      </NavLink>
      <NavLink
        to="/app/jobs"
        className={({ isActive }) => (isActive ? 'active' : '')}
      >
        <Compass size={18} />
        Job discovery
      </NavLink>
      <NavLink
        to="/app/saved-jobs"
        className={({ isActive }) => (isActive ? 'active' : '')}
      >
        <Bookmark size={18} />
        Saved jobs
      </NavLink>
    </>
  );
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-caption">YOUR WORKSPACE</div>
        <nav aria-label="Workspace">{links}</nav>
        <div className="sidebar-note">
          <ShieldCheck size={21} />
          <strong>Private by default</strong>
          <p>
            Local parsing and matching are private. External AI requires your
            consent for each request.
          </p>
        </div>
        <button
          className="logout"
          onClick={async () => {
            try {
              await signOut();
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          <LogOut size={17} /> Sign out
        </button>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <span>Workspace</span>
          <div>
            <button
              className="icon-button"
              onClick={() => setDark(!dark)}
              aria-label={dark ? 'Use light theme' : 'Use dark theme'}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <span className="avatar" aria-label={user.name}>
              {user.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <nav className="mobile-workspace-nav" aria-label="Mobile workspace">
          {links}
        </nav>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <Outlet />
      </div>
    </div>
  );
}
