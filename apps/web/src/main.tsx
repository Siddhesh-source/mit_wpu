import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { homeFor, type Role } from '@plc/shared';
import { SessionProvider, useSession } from './lib/session';
import Login from './pages/Login';
import Home from './pages/Home';
import Verify from './pages/Verify';
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
          <Route path="/student" element={<Guard roles={['student']}><Home cta="New request" hint="Pick a form, fill it once, and track every signature." /></Guard>} />
          <Route path="/inbox" element={<Guard roles={['faculty_coordinator', 'hod', 'dean_sa']}><Home cta="Review next" hint="One request at a time. Approve, return or reject." /></Guard>} />
          <Route path="/gate" element={<Guard roles={['security']}><Home cta="Scan pass" hint="Checks the QR on the spot, even offline." /></Guard>} />
          <Route path="/admin" element={<Guard roles={['admin']}><Home cta="All requests" hint="Every request and its status." /></Guard>} />
          <Route path="*" element={<Root />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  </React.StrictMode>,
);
