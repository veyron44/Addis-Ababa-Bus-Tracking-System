import { useCallback } from 'react';
import { getLiveAll, type LiveBus, type CrowdingView } from '../api';
import { usePolling } from '../lib/usePolling';
import { t } from '../strings';

function crowdingChip(crowding: CrowdingView | null) {
  const code = crowding?.code ?? null;
  const old = crowding && crowding.ageSec !== null && crowding.ageSec > 120;
  const suffix = old ? ' (old)' : '';
  if (!code || code === 'not_reported') return <span className="chip muted">—</span>;
  if (code === 'seats_available') return <span className="chip ok">Seats{suffix}</span>;
  if (code === 'standing_only')   return <span className="chip warn">Standing{suffix}</span>;
  if (code === 'full')            return <span className="chip bad">Full{suffix}</span>;
  return <span className="chip muted">{code}{suffix}</span>;
}

function statusChip(status: string) {
  if (status === 'on_trip')      return <span className="chip blue">On trip</span>;
  if (status === 'at_terminal')  return <span className="chip warn">At terminal</span>;
  if (status === 'assigned')     return <span className="chip muted">Assigned</span>;
  if (status === 'ended')        return <span className="chip muted">Ended</span>;
  return <span className="chip muted">{status}</span>;
}

function pingAge(ageSec: number | null) {
  if (ageSec === null) return <span className="muted">—</span>;
  const color = ageSec < 30 ? '#16a34a' : ageSec < 120 ? '#d97706' : '#dc2626';
  const label = ageSec < 60 ? t.secondsAgo(ageSec) : t.minutesAgo(Math.floor(ageSec / 60));
  return <span style={{ color, fontWeight: 600 }}>{label}</span>;
}

export default function Live() {
  const fetch = useCallback(() => getLiveAll(), []);
  const { data, error, loading, refresh } = usePolling(fetch, 5);
  const buses: LiveBus[] = data?.buses ?? [];

  return (
    <>
      <div className="page-header">
        <h1>{t.liveTitle}</h1>
        <button id="live-refresh-btn" className="btn secondary sm" onClick={refresh}>{t.refresh}</button>
      </div>

      {error && !data && (
        <div className="error-bar">{error.message}</div>
      )}
      {error && data && (
        <div className="error-bar" style={{ marginBottom: 12 }}>
          No connection — showing last data.
        </div>
      )}

      {loading && !data && <div className="muted">{t.loading}</div>}

      {!loading && buses.length === 0 && !error && (
        <div className="info-bar">{t.noBuses}</div>
      )}

      {buses.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.plate}</th>
                  <th>{t.route}</th>
                  <th>{t.direction}</th>
                  <th>{t.status}</th>
                  <th>{t.crowding}</th>
                  <th>{t.lastPing}</th>
                  <th>{t.warnings}</th>
                </tr>
              </thead>
              <tbody>
                {buses.map(bus => (
                  <tr key={bus.busId}>
                    <td><strong>{bus.plate}</strong></td>
                    <td>{bus.routeNumber}</td>
                    <td style={{ maxWidth: 200 }}>{bus.directionName}</td>
                    <td>{statusChip(bus.status)}</td>
                    <td>{crowdingChip(bus.crowding ?? null)}</td>
                    <td>{pingAge(bus.lastPingAgeSec)}</td>
                    <td>
                      {bus.warnings.length > 0
                        ? <span style={{ color: '#d97706', fontSize: 12 }}>{bus.warnings.map((w) => w.type).join(', ')}</span>
                        : <span className="muted">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}