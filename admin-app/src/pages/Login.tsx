import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from '../api';
import { saveToken } from '../lib/token';
import { t } from '../strings';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) { setError(t.enterBoth); return; }
    setBusy(true);
    setError('');
    try {
      const result = await adminLogin(username, password);
      saveToken(result.token);
      navigate('/live', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>{t.appName}</h1>
        <p className="subtitle">{t.loginTitle}</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="admin-username">{t.username}</label>
            <input
              id="admin-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="admin-password">{t.password}</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {error && <div className="error-bar">{error}</div>}

          <button id="login-btn" className="btn primary" type="submit" disabled={busy}>
            {busy ? t.loggingIn : t.login}
          </button>
        </form>
      </div>
    </div>
  );
}
