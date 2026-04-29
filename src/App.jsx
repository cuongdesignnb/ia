import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { authVerify } from './utils/api';
import { PageProvider } from './contexts/PageContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import CreatePost from './pages/CreatePost';
import PostList from './pages/PostList';
import SettingsPage from './pages/SettingsPage';
import FbPagesPage from './pages/FbPagesPage';
import LoginPage from './pages/LoginPage';
import AutoContentPage from './pages/AutoContentPage';
import StoryReviewPage from './pages/StoryReviewPage';
import MediaLibraryPage from './pages/MediaLibraryPage';
import { ToastProvider } from './components/Toast';
import './App.css';

function RouteWatcher({ onRouteChange }) {
  const location = useLocation();
  useEffect(() => { onRouteChange(); }, [location.pathname]);
  return null;
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(null);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen(v => !v), []);

  useEffect(() => {
    const token = localStorage.getItem('ia_token');
    if (!token) { setAuthenticated(false); return; }
    authVerify()
      .then(() => setAuthenticated(true))
      .catch(() => { localStorage.removeItem('ia_token'); setAuthenticated(false); });
  }, []);

  useEffect(() => {
    const handler = () => setAuthenticated(false);
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, []);

  const handleLogin = () => setAuthenticated(true);
  const handleLogout = () => setAuthenticated(false);

  if (authenticated === null) {
    return <div className="login-page"><div className="loading-spinner" style={{ width: 32, height: 32 }} /></div>;
  }

  if (!authenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <PageProvider>
          <RouteWatcher onRouteChange={closeSidebar} />
          <button className="mobile-menu-toggle" onClick={toggleSidebar} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`} onClick={closeSidebar} />
          <Sidebar isOpen={sidebarOpen} />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/auto-content" element={<AutoContentPage />} />
              <Route path="/review/:id" element={<StoryReviewPage />} />
              <Route path="/create" element={<CreatePost />} />
              <Route path="/posts" element={<PostList />} />
              <Route path="/pages" element={<FbPagesPage />} />
              <Route path="/media" element={<MediaLibraryPage />} />
              <Route path="/settings" element={<SettingsPage onLogout={handleLogout} />} />
            </Routes>
          </main>
        </PageProvider>
      </BrowserRouter>
    </ToastProvider>
  );
}
