import { useState } from 'react';
import {
  getDrivers, createDriver, updateDriver, deleteDriver, resetDriverPassword,
  type Driver,
} from '../api';
import { usePolling } from '../lib/usePolling';
import { t } from '../strings';

type Mode =
  | { type: 'add' }
  | { type: 'edit'; driver: Driver }
  | { type: 'password'; driver: Driver }
  | null;

export default function Drivers() {
  const { data, error, loading, refresh } = usePolling(getDrivers, 30);
  const drivers: Driver[] = data?.drivers ?? [];

  const [mode, setMode] = useState<Mode>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);

  function openAdd() {
    setMode({ type: 'add' });
    setName(''); setUsername(''); setPassword('');
    setFieldErrs({}); setApiErr('');
  }

  function openEdit(d: Driver) {
    setMode({ type: 'edit', driver: d });
    setName(d.name); setUsername(d.username); setPassword('');
    setFieldErrs({}); setApiErr('');
  }

  function openPassword(d: Driver) {
    setMode({ type: 'password', driver: d });
    setPassword('');
    setFieldErrs({}); setApiErr('');
  }

  function close() { setMode(null); setApiErr(''); }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (mode?.type === 'add' || mode?.type === 'edit') {
      if (!name.trim()) errs.name = t.nameRequired;
      if (!username.trim()) errs.username = t.usernameRequired;
    }
    if (mode?.type === 'add' || mode?.type === 'password') {
      if (!password.trim()) errs.password = t.passwordRequired;
    }
    setFieldErrs(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setBusy(true); setApiErr('');
    try {
      if (mode?.type === 'add') {
        await createDriver(name.trim(), username.trim(), password.trim());
      } else if (mode?.type === 'edit') {
        await updateDriver(mode.driver.id, name.trim(), username.trim());
      } else if (mode?.type === 'password') {
        await resetDriverPassword(mode.driver.id, password.trim());
      }
      close();
      refresh();
    } catch (err) {
      setApiErr(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    setBusy(true); setApiErr('');
    try {
      await deleteDriver(id);
      setConfirmId(null);
      refresh();
    } catch (err) {
      setApiErr(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  const formTitle =
    mode?.type === 'add' ? t.addDriver :
    mode?.type === 'edit' ? t.editDriver :
    t.resetPassword;

  return (
    <>
      <div className="page-header">
        <h1>{t.driversTitle}</h1>
        <button id="add-driver-btn" className="btn primary" onClick={openAdd}>
          + {t.addDriver}
        </button>
      </div>

      {apiErr && <div className="error-bar">{apiErr}</div>}
      {error && !data && <div className="error-bar">{error.message}</div>}

      {/* Form */}
      {mode && (
        <div className="inline-form">
          <h3>{formTitle}</h3>
          {(mode.type === 'add' || mode.type === 'edit') && (
            <div className="form-row">
              <div className="field">
                <label htmlFor="driver-name">{t.nameLabel}</label>
                <input
                  id="driver-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoFocus
                />
                {fieldErrs.name && <span className="field-err">{fieldErrs.name}</span>}
              </div>
              <div className="field">
                <label htmlFor="driver-username">{t.usernameLabel}</label>
                <input
                  id="driver-username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="off"
                />
                {fieldErrs.username && <span className="field-err">{fieldErrs.username}</span>}
              </div>
            </div>
          )}
          {(mode.type === 'add' || mode.type === 'password') && (
            <div className="form-row">
              <div className="field">
                <label htmlFor="driver-password">
                  {mode.type === 'password' ? t.newPasswordLabel : t.passwordLabel}
                </label>
                <input
                  id="driver-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoFocus={mode.type === 'password'}
                />
                {fieldErrs.password && <span className="field-err">{fieldErrs.password}</span>}
              </div>
            </div>
          )}
          <div className="form-actions">
            <button id="driver-save-btn" className="btn primary" onClick={handleSave} disabled={busy}>
              {busy ? t.saving : t.save}
            </button>
            <button className="btn secondary" onClick={close} disabled={busy}>{t.cancel}</button>
          </div>
        </div>
      )}

      {loading && !data && <div className="muted">{t.loading}</div>}
      {!loading && drivers.length === 0 && !error && <div className="info-bar">{t.noData}</div>}

      {drivers.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t.nameLabel}</th>
                  <th>{t.usernameLabel}</th>
                  <th>{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map(d => (
                  <tr key={d.id}>
                    <td className="muted">{d.id}</td>
                    <td><strong>{d.name}</strong></td>
                    <td className="muted">{d.username}</td>
                    <td>
                      {confirmId === d.id ? (
                        <div className="confirm-box">
                          <span>{t.confirmDelete}</span>
                          <button className="btn danger sm" onClick={() => handleDelete(d.id)} disabled={busy}>
                            {busy ? t.deleting : t.yes}
                          </button>
                          <button className="btn secondary sm" onClick={() => setConfirmId(null)} disabled={busy}>
                            {t.no}
                          </button>
                        </div>
                      ) : (
                        <div className="td-actions">
                          <button className="btn secondary sm" onClick={() => openEdit(d)}>{t.edit}</button>
                          <button className="btn secondary sm" onClick={() => openPassword(d)}>{t.resetPassword}</button>
                          <button className="btn danger sm" onClick={() => setConfirmId(d.id)}>{t.delete}</button>
                        </div>
                      )}
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
