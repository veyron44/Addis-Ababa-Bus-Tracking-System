import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api';
import { saveToken } from '../lib/token';
import { t } from '../strings';

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError(t.enterBoth);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await login(username.trim(), password);
      saveToken(result.token);
      navigate('/shift', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>{t.title}</h1>
      <form className="card" onSubmit={submit}>
        <label className="field">
          <span>{t.username}</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
          />
        </label>
        <label className="field">
          <span>{t.password}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? t.loggingIn : t.login}
        </button>
      </form>
    </div>
  );
}
