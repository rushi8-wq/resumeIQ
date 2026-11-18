import { Jobs } from './pages/Jobs';
import { JobDetail } from './pages/JobDetail';
import { SavedJobs } from './pages/SavedJobs';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Landing } from './pages/Landing';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { Resumes } from './pages/Resumes';
import { ResumePreview } from './pages/ResumePreview';
import { JobMatch } from './pages/JobMatch';
import { MatchResult } from './pages/MatchResult';
import { MatchHistory } from './pages/MatchHistory';
import { Optimization } from './pages/Optimization';
import { OptimizationHome } from './pages/OptimizationHome';
import './styles.css';
function Protected({ children }) {
  const { user, loading, error, refresh } = useAuth();
  if (loading)
    return (
      <main className="connection-state" role="status">
        Opening your workspace…
      </main>
    );
  if (error)
    return (
      <main className="connection-state">
        <h1>Connection interrupted</h1>
        <p role="alert">{error}</p>
        <button className="button" onClick={refresh}>
          Try again
        </button>
      </main>
    );
  return user ? children : <Navigate to="/login" replace />;
}
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Auth key="login" mode="login" />} />
          <Route
            path="/register"
            element={<Auth key="register" mode="register" />}
          />
          <Route
            path="/app"
            element={
              <Protected>
                <WorkspaceLayout />
              </Protected>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="jobs/:id" element={<JobDetail />} />
            <Route path="saved-jobs" element={<SavedJobs />} />
            <Route path="resumes" element={<Resumes />} />
            <Route path="resumes/:id" element={<ResumePreview />} />
            <Route path="match" element={<JobMatch />} />
            <Route path="match/:id" element={<MatchResult />} />
            <Route path="history" element={<MatchHistory />} />
            <Route path="optimization" element={<OptimizationHome />} />
            <Route path="optimization/:id" element={<Optimization />} />
          </Route>
          <Route
            path="*"
            element={
              <main className="connection-state">
                <h1>Page not found</h1>
                <Link to="/">Back to home</Link>
              </main>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
