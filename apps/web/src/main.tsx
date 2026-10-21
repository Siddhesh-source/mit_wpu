import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { APPROVER_ROLES, homeFor, type Role } from '@plc/shared';
import { SessionProvider, useSession } from './lib/session';
import Login from './pages/Login';
import Verify from './pages/Verify';
import StudentHome from './pages/StudentHome';
import NewRequest from './pages/NewRequest';
import RequestPage from './pages/RequestPage';
import AmendPage from './pages/AmendPage';
import Gate from './pages/Gate';
import Admin from './pages/Admin';
import Profile from './pages/Profile';
import SendDocument from './pages/SendDocument';
import { ROLES } from '@plc/shared';
import Inbox from './pages/Inbox';
import History from './pages/History';
import { Toaster } from './components/ui';
import './index.css';

function Guard({ roles, children }: { roles: Role[]; children: React.ReactElement }) {
  const { me, loading } = useSession();
  if (loading) return null;
  if (!me) return <Navigate to="/login" replace />;
  if (!me.roles.some((r) => roles.includes(r))) return <Navigate to={homeFor(me.roles)} replace />;
  return children;
}

function Root() {
  const { me, loading } = useSession();
  if (loading) return null;
  return <Navigate to={me ? homeFor(me.roles) : '/login'} replace />;
}

// Offline support (installable app, gate works without network). Production builds only, so dev reloads stay simple.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      // Also cache what this first visit already loaded (scripts, styles, fonts), so the next visit works offline.
      const urls = performance.getEntriesByType('resource').map((e) => e.name)
        .filter((u) => (u.startsWith(location.origin) && !u.includes('/api/')) || u.includes('fonts.g'));
      const cache = await caches.open('plc-shell-v2');
      await Promise.all(urls.map((u) => cache.add(u).catch(() => undefined)));
    } catch {
      /* offline support is best effort */
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Root />} />
          <Route path="/login" element={<Login />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/student" element={<Guard roles={['student']}><StudentHome /></Guard>} />
          <Route path="/student/new" element={<Guard roles={['student']}><NewRequest /></Guard>} />
          <Route path="/student/send" element={<Guard roles={['student']}><SendDocument /></Guard>} />
          <Route path="/profile" element={<Guard roles={[...ROLES]}><Profile /></Guard>} />
          <Route path="/requests/:id" element={<Guard roles={['student', 'admin', ...APPROVER_ROLES]}><RequestPage /></Guard>} />
          <Route path="/requests/:id/amend" element={<Guard roles={['student']}><AmendPage /></Guard>} />
          <Route path="/inbox" element={<Guard roles={[...APPROVER_ROLES, 'student']}><Inbox /></Guard>} />
          <Route path="/history" element={<Guard roles={[...APPROVER_ROLES, 'admin']}><History /></Guard>} />
          <Route path="/gate" element={<Guard roles={['security']}><Gate /></Guard>} />
          <Route path="/admin" element={<Guard roles={['admin']}><Admin /></Guard>} />
          <Route path="*" element={<Root />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </SessionProvider>
  </React.StrictMode>,
);
