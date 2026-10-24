import { useState } from 'react';
import {
  getVehicles, createVehicle, updateVehicle, deleteVehicle,
  type Vehicle,
} from '../api';
import { usePolling } from '../lib/usePolling';
import { t } from '../strings';

type Mode = { type: 'add' } | { type: 'edit'; vehicle: Vehicle } | null;

export default function Vehicles() {
  const { data, error, loading, refresh } = usePolling(getVehicles, 30);
  const vehicles: Vehicle[] = data?.vehicles ?? [];

  const [mode, setMode] = useState<Mode>(null);
  const [plate, setPlate] = useState('');
  const [fieldErr, setFieldErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState('');

  // Confirm-delete state: holds the id being deleted
  const [confirmId, setConfirmId] = useState<number | null>(null);

  function openAdd() {
    setMode({ type: 'add' });
    setPlate('');
    setFieldErr('');
    setApiErr('');
  }

  function openEdit(v: Vehicle) {
    setMode({ type: 'edit', vehicle: v });
    setPlate(v.plate);
    setFieldErr('');
    setApiErr('');
  }

  function closeForm() {
    setMode(null);
    setApiErr('');
  }

  async function handleSave() {
    if (!plate.trim()) { setFieldErr(t.plateRequired); return; }
    setFieldErr('');
    setBusy(true);
    setApiErr('');
    try {
      if (mode?.type === 'add') {
        await createVehicle(plate.trim());
      } else if (mode?.type === 'edit') {
        await updateVehicle(mode.vehicle.id, plate.trim());
      }
      setMode(null);
      refresh();
    } catch (err) {
      setApiErr(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    setBusy(true);
    setApiErr('');
    try {
      await deleteVehicle(id);
      setConfirmId(null);
      refresh();
    } catch (err) {
      setApiErr(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>{t.vehiclesTitle}</h1>
        <button id="add-vehicle-btn" className="btn primary" onClick={openAdd}>
          + {t.addVehicle}
        </button>
      </div>

      {apiErr && <div className="error-bar">{apiErr}</div>}
      {error && !data && <div className="error-bar">{error.message}</div>}

      {/* Add / Edit form */}
      {mode && (
        <div className="inline-form">
          <h3>{mode.type === 'add' ? t.addVehicle : t.editVehicle}</h3>
          <div className="form-row">
            <div className="field">
              <label htmlFor="vehicle-plate">{t.plateLabel}</label>
              <input
                id="vehicle-plate"
                type="text"
                value={plate}
                onChange={e => setPlate(e.target.value)}
                placeholder="e.g. ET-12345"
                autoFocus
              />
              {fieldErr && <span className="field-err">{fieldErr}</span>}
            </div>
          </div>
          <div className="form-actions">
            <button id="vehicle-save-btn" className="btn primary" onClick={handleSave} disabled={busy}>
              {busy ? t.saving : t.save}
            </button>
            <button className="btn secondary" onClick={closeForm} disabled={busy}>{t.cancel}</button>
          </div>
        </div>
      )}

      {loading && !data && <div className="muted">{t.loading}</div>}

      {!loading && vehicles.length === 0 && !error && (
        <div className="info-bar">{t.noData}</div>
      )}

      {vehicles.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t.plateLabel}</th>
                  <th>{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map(v => (
                  <>
                    <tr key={v.id}>
                      <td className="muted">{v.id}</td>
                      <td><strong>{v.plate}</strong></td>
                      <td>
                        {confirmId === v.id ? (
                          <div className="confirm-box">
                            <span>{t.confirmDelete}</span>
                            <button className="btn danger sm" onClick={() => handleDelete(v.id)} disabled={busy}>
                              {busy ? t.deleting : t.yes}
                            </button>
                            <button className="btn secondary sm" onClick={() => setConfirmId(null)} disabled={busy}>
                              {t.no}
                            </button>
                          </div>
                        ) : (
                          <div className="td-actions">
                            <button className="btn secondary sm" onClick={() => openEdit(v)}>{t.edit}</button>
                            <button className="btn danger sm" onClick={() => setConfirmId(v.id)}>{t.delete}</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
