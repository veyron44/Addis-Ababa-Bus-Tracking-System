import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ApiError,
  getCurrentShift,
  getDirections,
  getMe,
  selectDirection,
  startShift,
  type Direction,
} from '../api';
import { clearToken } from '../lib/token';
import { canChangeRoute, canStart, isRunning, statusLabel } from '../lib/shift';
import { usePolling } from '../lib/usePolling';
import { t } from '../strings';

export default function Shift() {
  const navigate = useNavigate();
  const shift = usePolling(getCurrentShift, 10);
  const [name, setName] = useState('');
  const [picking, setPicking] = useState(false);
  const [directions, setDirections] = useState<Direction[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    getMe().then((r) => setName(r.driver.name)).catch(() => {});
  }, []);

  const assignment = shift.data?.assignment ?? null;

  // A started shift belongs on the Running screen.
  useEffect(() => {
    if (assignment && isRunning(assignment.status)) navigate('/running', { replace: true });
  }, [assignment, navigate]);

  // 401 clears the token inside api(). Go to Login.
  useEffect(() => {
    if (shift.error instanceof ApiError && shift.error.status === 401) navigate('/login', { replace: true });
  }, [shift.error, navigate]);

  function logout() {
    clearToken();
    navigate('/login', { replace: true });
  }

  async function openPicker() {
    setActionError(null);
    try {
      const r = await getDirections();
      setDirections(r.directions);
      setPicking(true);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not load routes');
    }
  }

  async function choose(id: number) {
    setBusy(true);
    setActionError(null);
    try {
      await selectDirection(id);
      setPicking(false);
      await shift.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not change the route');
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setBusy(true);
    setActionError(null);
    try {
      await startShift();
      await shift.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not start the shift');
    } finally {
      setBusy(false);
    }
  }

  // No shift is a normal state (404), not a failure.
  const noShift = shift.error instanceof ApiError && shift.error.status === 404;
  const offline = shift.error instanceof ApiError && shift.error.status === 0;

  return (
    <div className="page">
      <h1>{t.yourShift}</h1>
      {name && <p className="muted">{t.hello}, {name}</p>}
      {offline && <div className="banner">{t.offline}</div>}

      {shift.loading && !assignment && !noShift && <div className="card">{t.loading}</div>}

      {noShift && (
        <div className="card">
          <h2>{t.noShiftTitle}</h2>
          <p>{t.noShiftText}</p>
          <button className="btn" onClick={shift.refresh}>{t.refresh}</button>
        </div>
      )}

      {assignment && !picking && (
        <div className="card">
          <div className="row"><span>{t.bus}</span><strong>{assignment.plate}</strong></div>
          <div className="row"><span>{t.route}</span><strong>{assignment.routeNumber}</strong></div>
          <div className="row"><span>{t.direction}</span><strong>{assignment.directionName}</strong></div>
          <div className="row">
            <span>{t.status}</span>
            <span className="chip">{statusLabel(assignment.status)}</span>
          </div>
          {actionError && <div className="error">{actionError}</div>}
          {canChangeRoute(assignment.status) && (
            <button className="btn secondary" onClick={openPicker} disabled={busy}>
              {t.changeRoute}
            </button>
          )}
          {canStart(assignment.status) && (
            <button className="btn green" onClick={start} disabled={busy}>
              {busy ? t.starting : t.startShift}
            </button>
          )}
        </div>
      )}

      {assignment && picking && (
        <div className="card">
          <h2>{t.chooseRoute}</h2>
          {directions.map((d) => (
            <button
              key={d.id}
              className={`option${d.id === assignment.routeDirectionId ? ' current' : ''}`}
              onClick={() => choose(d.id)}
              disabled={busy}
            >
              <strong>{d.routeNumber}</strong> {d.directionName}
              {d.id === assignment.routeDirectionId && <span className="muted"> ({t.currentChoice})</span>}
            </button>
          ))}
          {actionError && <div className="error">{actionError}</div>}
          <button className="btn secondary" onClick={() => setPicking(false)} disabled={busy}>
            {t.cancel}
          </button>
        </div>
      )}

      <button className="link" onClick={logout}>{t.logout}</button>
    </div>
  );
}
