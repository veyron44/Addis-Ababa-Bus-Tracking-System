import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getAdminMe } from './api';
import { getToken } from './lib/token';
import { t } from './strings';
import Login from './pages/Login';
import Live from './pages/Live';
import Vehicles from './pages/Vehicles';
import Drivers from './pages/Drivers';
import Shifts from './pages/Shifts';
import Shell from './components/Shell';

// Guards a route: checks that the saved admin token is still valid.
// A 5-second timeout prevents the screen from hanging if the backend is down.
// Any error (bad token, network, timeout) sends the admin to the Login page.
function RequireLogin({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'ok' | 'no'>(getToken() ? 'checking' : 'no');

  useEffect(() => {
    if (!getToken()) {
      setState('no');
      return;
    }
    const timer = setTimeout(() => setState('no'), 5000);
    getAdminMe()
      .then(() => { clearTimeout(timer); setState('ok'); })
      .catch(() => { clearTimeout(timer); setState('no'); });
    return () => clearTimeout(timer);
  }, []);

  if (state === 'checking') return <div style={{ padding: 32, color: '#6b7280' }}>{t.loading}</div>;
  if (state === 'no') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireLogin>
            <Shell />
          </RequireLogin>
        }
      >
        <Route path="/live"     element={<Live />} />
        <Route path="/vehicles" element={<Vehicles />} />
        <Route path="/drivers"  element={<Drivers />} />
        <Route path="/shifts"   element={<Shifts />} />
      </Route>
      <Route path="*" element={<Navigate to="/live" replace />} />
    </Routes>
  );
}
