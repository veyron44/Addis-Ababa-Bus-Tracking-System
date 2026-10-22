import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, endShift, getCurrentShift } from '../api';
import { isRunning, statusLabel } from '../lib/shift';
import { usePolling } from '../lib/usePolling';
import { t } from '../strings';

// Placeholder: shows the running shift. Sending the position is added on the next step.
export default function Running() {
  const navigate = useNavigate();
  const shift = usePolling(getCurrentShift, 10);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignment = shift.data?.assignment ?? null;

  // A shift that is not running (not started, or gone) belongs on the Shift screen.
  useEffect(() => {
    if (assignment && !isRunning(assignment.status)) navigate('/shift', { replace: true });
    if (shift.error instanceof ApiError && (shift.error.status === 404 || shift.error.status === 401)) {
      navigate('/shift', { replace: true });
    }
  }, [assignment, shift.error, navigate]);

  async function end() {
    setBusy(true);
    setError(null);
    try {
      await endShift();
      navigate('/shift', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not end the shift');
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>{t.running}</h1>
      {assignment ? (
        <div className="card">
          <div className="row"><span>{t.bus}</span><strong>{assignment.plate}</strong></div>
          <div className="row"><span>{t.route}</span><strong>{assignment.routeNumber}</strong></div>
          <div className="row"><span>{t.direction}</span><strong>{assignment.directionName}</strong></div>
          <div className="row">
            <span>{t.status}</span>
            <span className="chip">{statusLabel(assignment.status)}</span>
          </div>
          <p className="muted">{t.runningNote}</p>
        </div>
      ) : (
        <div className="card">{t.loading}</div>
      )}

      {error && <div className="error">{error}</div>}

      {!confirming ? (
        <button className="btn red" onClick={() => setConfirming(true)}>{t.endShift}</button>
      ) : (
        <div className="card">
          <p>{t.endAsk}</p>
          <button className="btn red" onClick={end} disabled={busy}>{busy ? t.ending : t.sure}</button>
          <button className="btn secondary" onClick={() => setConfirming(false)} disabled={busy}>{t.no2}</button>
        </div>
      )}
    </div>
  );
}
