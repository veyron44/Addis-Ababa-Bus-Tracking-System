import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ApiError,
  endShift,
  getCurrentShift,
  getDirections,
  selectDirection,
  type Direction,
  setCrowding as apiSetCrowding,
  departingNow as apiDepartingNow,
  startReturn as apiStartReturn,
  sendPings,
} from '../api';
import { isRunning, isAtTerminal, canChangeRoute, statusLabel, type CrowdingCode } from '../lib/shift';
import { GpsSender, type SenderState } from '../lib/sender';
import { usePolling } from '../lib/usePolling';
import { t } from '../strings';

// Label for the GPS light.
function gpsLightLabel(light: SenderState['light']): string {
  if (light === 'green') return t.gpsGreen;
  if (light === 'amber') return t.gpsAmber;
  return t.gpsRed;
}

export default function Running() {
  const navigate = useNavigate();
  const shift = usePolling(getCurrentShift, 10);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [directions, setDirections] = useState<Direction[]>([]);
  const [senderState, setSenderState] = useState<SenderState>({
    sent: 0, waiting: 0, light: 'amber', warnings: [], status: null, error: null, stopped: false,
  });

  const senderRef = useRef<GpsSender | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const assignment = shift.data?.assignment ?? null;

  // ---- Wake Lock ----
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
      }
    } catch {
      // Wake lock not available or denied.
    }
  }, []);

  // Re-acquire wake lock when tab becomes visible.
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) requestWakeLock();
    };
    document.addEventListener('visibilitychange', onVisibility);
    requestWakeLock();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      wakeLockRef.current?.release().catch(() => {});
    };
  }, [requestWakeLock]);

  // ---- GPS Sender ----
  useEffect(() => {
    const sender = new GpsSender(sendPings, setSenderState);
    senderRef.current = sender;
    sender.start();
    return () => {
      sender.stop();
      senderRef.current = null;
    };
  }, []);

  // When the ping reply contains a status flip or events, reload the shift.
  useEffect(() => {
    if (senderState.status && assignment && senderState.status !== assignment.status) {
      shift.refresh();
    }
  }, [senderState.status]);

  // A shift that is not running belongs on the Shift screen.
  useEffect(() => {
    if (assignment && !isRunning(assignment.status)) navigate('/shift', { replace: true });
    if (shift.error instanceof ApiError && (shift.error.status === 404 || shift.error.status === 401)) {
      navigate('/shift', { replace: true });
    }
  }, [assignment, shift.error, navigate]);


  async function handleCrowding(code: CrowdingCode) {
    setBusy(true);
    setError(null);
    try {
      await apiSetCrowding(code);
      senderRef.current?.setCrowding(code);
      await shift.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set crowding');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeparting() {
    setBusy(true);
    setError(null);
    try {
      await apiDepartingNow();
      await shift.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not depart');
    } finally {
      setBusy(false);
    }
  }

  async function handleReturn() {
    setBusy(true);
    setError(null);
    try {
      await apiStartReturn();
      await shift.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start return trip');
    } finally {
      setBusy(false);
    }
  }

  async function openPicker() {
    setError(null);
    try {
      const r = await getDirections();
      setDirections(r.directions);
      setPicking(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load routes');
    }
  }

  async function chooseDirection(id: number) {
    setBusy(true);
    setError(null);
    try {
      await selectDirection(id);
      setPicking(false);
      await shift.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the route');
    } finally {
      setBusy(false);
    }
  }

  async function handleEnd() {
    setBusy(true);
    setError(null);
    try {
      // Tell the server first. Stop GPS only after the shift is really ended.
      await endShift();
      senderRef.current?.stop();
      navigate('/shift', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not end the shift');
      setBusy(false);
    }
  }

  const atTerminal = assignment ? isAtTerminal(assignment.status) : false;
  const currentCrowding = assignment?.crowding ?? 'not_reported';

  return (
    <div className="page">
      <h1>{t.running}</h1>

      {}
      {senderState.warnings.length > 0 && (
        <div className="warning-bar">{senderState.warnings.join(' · ')}</div>
      )}

      {/* GPS status bar */}
      <div className="gps-bar">
        <div className={`gps-dot ${senderState.light}`} />
        <span className="gps-text">{gpsLightLabel(senderState.light)}</span>
        <span className="gps-counts">
          {t.sent} <strong>{senderState.sent}</strong> &nbsp;
          {t.waiting} <strong>{senderState.waiting}</strong>
        </span>
      </div>

      <div className="keep-on">{t.keepScreenOn}</div>

      {/* Shift info card */}
      {assignment ? (
        <div className="card">
          <div className="row"><span>{t.bus}</span><strong>{assignment.plate}</strong></div>
          <div className="row"><span>{t.route}</span><strong>{assignment.routeNumber}</strong></div>
          <div className="row"><span>{t.direction}</span><strong>{assignment.directionName}</strong></div>
          <div className="row">
            <span>{t.status}</span>
            <span className="chip">{statusLabel(assignment.status)}</span>
          </div>
        </div>
      ) : (
        <div className="card">{t.loading}</div>
      )}

      {/* Sender error  */}
      {senderState.error && <div className="error">{senderState.error}</div>}
      {error && <div className="error">{error}</div>}

      {/* Crowding buttons */}
      <div className="crowd-row">
        <button
          className={`crowd-btn seats${currentCrowding === 'seats_available' ? ' active' : ''}`}
          onClick={() => handleCrowding('seats_available')}
          disabled={busy}
        >
          {t.seatsAvailable}
        </button>
        <button
          className={`crowd-btn standing${currentCrowding === 'standing_only' ? ' active' : ''}`}
          onClick={() => handleCrowding('standing_only')}
          disabled={busy}
        >
          {t.standingOnly}
        </button>
        <button
          className={`crowd-btn full${currentCrowding === 'full' ? ' active' : ''}`}
          onClick={() => handleCrowding('full')}
          disabled={busy}
        >
          {t.full}
        </button>
      </div>

      {/* Terminal-only buttons */}
      {atTerminal && assignment && picking && (
        <div className="card">
          <h2>{t.chooseRoute}</h2>
          {directions.map((d) => (
            <button
              key={d.id}
              className={`option${d.id === assignment.routeDirectionId ? ' current' : ''}`}
              onClick={() => chooseDirection(d.id)}
              disabled={busy}
            >
              <strong>{d.routeNumber}</strong> {d.directionName}
              {d.id === assignment.routeDirectionId && <span className="muted"> ({t.currentChoice})</span>}
            </button>
          ))}
          <button className="btn secondary" onClick={() => setPicking(false)} disabled={busy}>
            {t.cancel}
          </button>
        </div>
      )}
      {atTerminal && !picking && (
        <div className="terminal-row">
          <button className="terminal-btn depart" onClick={handleDeparting} disabled={busy}>
            {t.departingNow}
          </button>
          <button className="terminal-btn returnTrip" onClick={handleReturn} disabled={busy}>
            {t.startReturn}
          </button>
          {assignment && canChangeRoute(assignment.status) && (
            <button className="terminal-btn" style={{ background: '#475569' }} onClick={openPicker} disabled={busy}>
              {t.changeRoute}
            </button>
          )}
        </div>
      )}

      {/* End shift */}
      {!confirming ? (
        <button className="btn red" onClick={() => setConfirming(true)}>{t.endShift}</button>
      ) : (
        <div className="confirm-card">
          <p>{t.endAsk}</p>
          <button className="btn red" onClick={handleEnd} disabled={busy}>{busy ? t.ending : t.sure}</button>
          <button className="btn secondary" onClick={() => setConfirming(false)} disabled={busy}>{t.no2}</button>
        </div>
      )}
    </div>
  );
}