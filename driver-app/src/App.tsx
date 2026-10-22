import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getMe } from './api';
import { getToken } from './lib/token';
import { t } from './strings';
import Login from './pages/Login';
import Shift from './pages/Shift';
import Running from './pages/Running';
import Setup from './pages/Setup';

// Lets a screen through only when the saved token still works.
function RequireLogin({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'ok' | 'no'>(getToken() ? 'checking' : 'no');

  useEffect(() => {
    if (!getToken()) {
      setState('no');
      return;
    }
    getMe()
      .then(() => setState('ok'))
      .catch((e: { status?: number }) => {
        // 401 means the token is bad. Other errors (no network) keep the driver in.
        setState(e.status === 401 ? 'no' : 'ok');
      });
  }, []);

  if (state === 'checking') return <div className="page">{t.loading}</div>;
  if (state === 'no') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/shift" element={<RequireLogin><Shift /></RequireLogin>} />
      <Route path="/running" element={<RequireLogin><Running /></RequireLogin>} />
      <Route path="*" element={<Navigate to="/shift" replace />} />
    </Routes>
  );
}
