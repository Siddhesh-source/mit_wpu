import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { homeFor, type Role } from '@plc/shared';
import { SessionProvider, useSession } from './lib/session';
import Login from './pages/Login';
import Home from './pages/Home';
import Verify from './pages/Verify';
import StudentHome from './pages/StudentHome';
import NewRequest from './pages/NewRequest';
import RequestPage from './pages/RequestPage';
import Inbox from './pages/Inbox';
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
          <Route path="/requests/:id" element={<Guard roles={['student', 'faculty_coordinator', 'hod', 'dean_sa', 'security', 'admin']}><RequestPage /></Guard>} />
          <Route path="/inbox" element={<Guard roles={['faculty_coordinator', 'hod', 'dean_sa', 'security']}><Inbox /></Guard>} />
          <Route path="/gate" element={<Guard roles={['security']}><Home cta="Scan pass" hint="Checks the QR on the spot, even offline." secondary={{ to: '/inbox', label: 'Approvals waiting for me' }} /></Guard>} />
          <Route path="/admin" element={<Guard roles={['admin']}><Home cta="All requests" hint="Every request and its status." /></Guard>} />
          <Route path="*" element={<Root />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </SessionProvider>
  </React.StrictMode>,
);
