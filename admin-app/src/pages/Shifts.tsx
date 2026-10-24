import { useCallback, useEffect, useState } from 'react';
import {
  getAssignments, createAssignment, endAssignment,
  getDrivers, getVehicles, getRouteDirections,
  type AdminAssignment, type Driver, type Vehicle, type RouteDirection,
} from '../api';
import { usePolling } from '../lib/usePolling';
import { t } from '../strings';

function statusChip(status: string) {
  if (status === 'on_trip')     return <span className="chip blue">On trip</span>;
  if (status === 'at_terminal') return <span className="chip warn">At terminal</span>;
  if (status === 'assigned')    return <span className="chip muted">Assigned</span>;
  if (status === 'ended')       return <span className="chip muted">Ended</span>;
  return <span className="chip muted">{status}</span>;
}

export default function Shifts() {
  const { data, error, loading, refresh } = usePolling(
    useCallback(() => getAssignments(), []), 15,
  );
  const assignments: AdminAssignment[] = data?.assignments ?? [];

  // Supporting data for the create form
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [directions, setDirections] = useState<RouteDirection[]>([]);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [directionId, setDirectionId] = useState('');
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState('');

  // Confirm end-shift
  const [confirmId, setConfirmId] = useState<number | null>(null);

  // Load supporting lists once when the form opens
  useEffect(() => {
    if (!showForm) return;
    Promise.all([getDrivers(), getVehicles(), getRouteDirections()])
      .then(([d, v, r]) => {
        setDrivers(d.drivers);
        setVehicles(v.vehicles);
        setDirections(r.directions);
      })
      .catch(() => setApiErr('Could not load drivers/vehicles/routes.'));
  }, [showForm]);

  function openForm() {
    setShowForm(true);
    setDriverId(''); setVehicleId(''); setDirectionId('');
    setFieldErrs({}); setApiErr('');
  }

  function closeForm() { setShowForm(false); setApiErr(''); }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!driverId)   errs.driver    = t.pickDriver;
    if (!vehicleId)  errs.vehicle   = t.pickVehicle;
    if (!directionId) errs.direction = t.pickDirection;
    setFieldErrs(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleCreate() {
    if (!validate()) return;
    setBusy(true); setApiErr('');
    try {
      await createAssignment(Number(driverId), Number(vehicleId), Number(directionId));
      closeForm();
      refresh();
    } catch (err) {
      setApiErr(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  async function handleEnd(id: number) {
    setBusy(true); setApiErr('');
    try {
      await endAssignment(id);
      setConfirmId(null);
      refresh();
    } catch (err) {
      setApiErr(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  // Filter to active (non-ended) on top, then ended at bottom
  const sorted = [...assignments].sort((a, b) => {
    const aEnded = a.status === 'ended' ? 1 : 0;
    const bEnded = b.status === 'ended' ? 1 : 0;
    return aEnded - bEnded;
  });

  return (
    <>
      <div className="page-header">
        <h1>{t.shiftsTitle}</h1>
        <button id="create-shift-btn" className="btn primary" onClick={openForm}>
          + {t.createShift}
        </button>
      </div>

      {apiErr && <div className="error-bar">{apiErr}</div>}
      {error && !data && <div className="error-bar">{error.message}</div>}

      {/* Create form */}
      {showForm && (
        <div className="inline-form">
          <h3>{t.createShift}</h3>
          <div className="form-row">
            <div className="field">
              <label htmlFor="shift-driver">{t.driverLabel}</label>
              <select
                id="shift-driver"
                value={driverId}
                onChange={e => setDriverId(e.target.value)}
              >
                <option value="">{t.pickDriver}</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.username})</option>
                ))}
              </select>
              {fieldErrs.driver && <span className="field-err">{fieldErrs.driver}</span>}
            </div>

            <div className="field">
              <label htmlFor="shift-vehicle">{t.vehicleLabel}</label>
              <select
                id="shift-vehicle"
                value={vehicleId}
                onChange={e => setVehicleId(e.target.value)}
              >
                <option value="">{t.pickVehicle}</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.plate}</option>
                ))}
              </select>
              {fieldErrs.vehicle && <span className="field-err">{fieldErrs.vehicle}</span>}
            </div>

            <div className="field">
              <label htmlFor="shift-direction">{t.routeDirectionLabel}</label>
              <select
                id="shift-direction"
                value={directionId}
                onChange={e => setDirectionId(e.target.value)}
              >
                <option value="">{t.pickDirection}</option>
                {directions.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.routeNumber} – {r.directionName}
                  </option>
                ))}
              </select>
              {fieldErrs.direction && <span className="field-err">{fieldErrs.direction}</span>}
            </div>
          </div>
          <div className="form-actions">
            <button id="shift-save-btn" className="btn primary" onClick={handleCreate} disabled={busy}>
              {busy ? t.saving : t.createShift}
            </button>
            <button className="btn secondary" onClick={closeForm} disabled={busy}>{t.cancel}</button>
          </div>
        </div>
      )}

      {loading && !data && <div className="muted">{t.loading}</div>}
      {!loading && assignments.length === 0 && !error && <div className="info-bar">{t.noData}</div>}

      {sorted.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t.driverLabel}</th>
                  <th>{t.vehicleLabel}</th>
                  <th>{t.route}</th>
                  <th>{t.direction}</th>
                  <th>{t.shiftStatus}</th>
                  <th>{t.startedAt}</th>
                  <th>{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(a => {
                  const ended = a.status === 'ended';
                  return (
                    <tr key={a.id} style={{ opacity: ended ? 0.55 : 1 }}>
                      <td className="muted">{a.id}</td>
                      <td>{a.driverName}</td>
                      <td>{a.plate}</td>
                      <td>{a.routeNumber}</td>
                      <td style={{ maxWidth: 200 }}>{a.directionName}</td>
                      <td>{statusChip(a.status)}</td>
                      <td className="muted">
                        {a.startedAt
                          ? new Date(a.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : t.notStarted}
                      </td>
                      <td>
                        {!ended && (
                          confirmId === a.id ? (
                            <div className="confirm-box">
                              <span>{t.confirmEnd}</span>
                              <button className="btn danger sm" onClick={() => handleEnd(a.id)} disabled={busy}>
                                {busy ? t.ending : t.yes}
                              </button>
                              <button className="btn secondary sm" onClick={() => setConfirmId(null)} disabled={busy}>
                                {t.no}
                              </button>
                            </div>
                          ) : (
                            <button className="btn danger sm" onClick={() => setConfirmId(a.id)}>
                              {t.end}
                            </button>
                          )
                        )}
                        {ended && <span className="muted">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
