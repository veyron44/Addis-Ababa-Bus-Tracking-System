import { useEffect, useState } from 'react';
import { apiBase, getHealth, type Health } from '../api';
import { t } from '../strings';

type Fix = { lat: number; lng: number; acc: number };

function locationError(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) return t.denied;
  if (err.code === err.POSITION_UNAVAILABLE) return t.unavailable;
  return t.timeout;
}


export default function Setup() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const [fix, setFix] = useState<Fix | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  function check() {
    setChecking(true);
    setHealthError(null);
    getHealth()
      .then(setHealth)
      .catch((e: Error) => {
        setHealth(null);
        setHealthError(e.message);
      })
      .finally(() => setChecking(false));
  }

  useEffect(check, []);

  function getLocation() {
    setLocError(null);
    if (!window.isSecureContext || !navigator.geolocation) {
      setLocError(t.notSecure);
      return;
    }
    setAsking(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy });
        setAsking(false);
      },
      (err) => {
        setLocError(locationError(err));
        setAsking(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  return (
    <div className="page">
      <h1>{t.title}</h1>

      <div className="card">
        <h2>{t.backend}</h2>
        <div className="row"><span>{t.address}</span><span>{apiBase}</span></div>
        <div className="row">
          <span>{t.backend}</span>
          {checking ? (
            <span>{t.checking}</span>
          ) : health ? (
            <span className="ok">{t.reachable}</span>
          ) : (
            <span className="bad">{t.notReachable}</span>
          )}
        </div>
        {health && (
          <div className="row">
            <span>{t.database}</span>
            <span className={health.database === 'ok' ? 'ok' : 'bad'}>{health.database}</span>
          </div>
        )}
        {healthError && <div className="error">{healthError}</div>}
        <button className="btn" onClick={check} disabled={checking}>{t.retry}</button>
      </div>

      <div className="card">
        <h2>{t.location}</h2>
        <div className="row">
          <span>{t.secure}</span>
          <span className={window.isSecureContext ? 'ok' : 'bad'}>
            {window.isSecureContext ? t.yes : t.no}
          </span>
        </div>
        {fix && (
          <>
            <div className="row"><span>{t.latitude}</span><span>{fix.lat.toFixed(6)}</span></div>
            <div className="row"><span>{t.longitude}</span><span>{fix.lng.toFixed(6)}</span></div>
            <div className="row">
              <span>{t.accuracy}</span>
              <span>{Math.round(fix.acc)} {t.metres}</span>
            </div>
          </>
        )}
        {locError && <div className="error">{locError}</div>}
        <button className="btn" onClick={getLocation} disabled={asking}>
          {asking ? t.asking : t.getLocation}
        </button>
      </div>
    </div>
  );
}
