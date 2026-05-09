import React, { useEffect, useState } from 'react';
import { ChevronRight, LogOut, Power, Save, Search, ShieldCheck, UserPlus, Users } from 'lucide-react';

const ADMIN_TOKEN_KEY = 'nailmeasure_admin_token';
const ADMIN_NAME_KEY = 'nailmeasure_admin_name';
const LEGACY_ADMIN_EMAIL_KEY = 'nailmeasure_admin_email';
const DEFAULT_ADMIN_NAME = 'admin';

const getStoredValue = (key) => {
  try {
    return window.localStorage?.getItem(key) || '';
  } catch (error) {
    return '';
  }
};

const setStoredValue = (key, value) => {
  try {
    window.localStorage?.setItem(key, value);
  } catch (error) {
    // Storage is optional; the in-memory session still works.
  }
};

const removeStoredValue = (key) => {
  try {
    window.localStorage?.removeItem(key);
  } catch (error) {
    // Storage is optional; nothing to clean up.
  }
};

const formatDate = (value) => {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleString();
};

function AdminPortal() {
  const [token, setToken] = useState(() => getStoredValue(ADMIN_TOKEN_KEY));
  const [adminName, setAdminName] = useState(() => getStoredValue(ADMIN_NAME_KEY));
  const [loginName, setLoginName] = useState(() => getStoredValue(ADMIN_NAME_KEY) || DEFAULT_ADMIN_NAME);
  const [password, setPassword] = useState('');
  const [searchEmail, setSearchEmail] = useState('');
  const [sessions, setSessions] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountPassword, setNewAccountPassword] = useState('');
  const [status, setStatus] = useState({ type: 'idle', text: '' });
  const [loading, setLoading] = useState(false);

  const logout = () => {
    removeStoredValue(ADMIN_TOKEN_KEY);
    removeStoredValue(ADMIN_NAME_KEY);
    removeStoredValue(LEGACY_ADMIN_EMAIL_KEY);
    setToken('');
    setAdminName('');
    setSessions([]);
    setDrafts({});
    setAccounts([]);
    setStatus({ type: 'idle', text: '' });
  };

  const loadAdminAccounts = async (authToken = token) => {
    if (!authToken) return;

    const response = await fetch('/api/admin-accounts', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await response.json();

    if (response.status === 401) {
      logout();
      throw new Error(data.error || 'Admin session expired');
    }

    if (!response.ok || !data.ok) {
      throw new Error(data.reason || data.error || 'Admin account load failed');
    }

    setAccounts(data.accounts || []);
  };

  useEffect(() => {
    removeStoredValue(LEGACY_ADMIN_EMAIL_KEY);
    if (!token) return;

    loadAdminAccounts(token).catch((error) => {
      setStatus({ type: 'error', text: error.message });
    });
  }, []);

  const login = async (event) => {
    event.preventDefault();
    setLoading(true);
    setStatus({ type: 'loading', text: 'Signing in' });

    try {
      const response = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: loginName, password }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.reason || data.error || 'Admin login failed');
      }

      setToken(data.token);
      setAdminName(data.adminName || loginName);
      setStoredValue(ADMIN_TOKEN_KEY, data.token);
      setStoredValue(ADMIN_NAME_KEY, data.adminName || loginName);
      setPassword('');
      await loadAdminAccounts(data.token);
      setStatus({ type: 'success', text: 'Admin signed in' });
    } catch (error) {
      setStatus({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const createAdminAccount = async (event) => {
    event.preventDefault();
    setLoading(true);
    setStatus({ type: 'loading', text: 'Creating admin account' });

    try {
      const response = await fetch('/api/admin-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newAccountName, password: newAccountPassword }),
      });
      const data = await response.json();

      if (response.status === 401) {
        logout();
        throw new Error(data.error || 'Admin session expired');
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Admin account create failed');
      }

      setAccounts(prev => [...prev, data.account]);
      setNewAccountName('');
      setNewAccountPassword('');
      setStatus({ type: 'success', text: 'Admin account created' });
    } catch (error) {
      setStatus({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const toggleAdminAccount = async (account) => {
    setLoading(true);
    setStatus({ type: 'loading', text: account.active ? 'Disabling admin account' : 'Enabling admin account' });

    try {
      const response = await fetch('/api/admin-accounts', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ accountId: account.id, active: !account.active }),
      });
      const data = await response.json();

      if (response.status === 401) {
        logout();
        throw new Error(data.error || 'Admin session expired');
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Admin account update failed');
      }

      setAccounts(prev => prev.map(item => (
        item.id === data.account.id ? data.account : item
      )));
      setStatus({ type: 'success', text: data.account.active ? 'Admin account enabled' : 'Admin account disabled' });
    } catch (error) {
      setStatus({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const search = async (event) => {
    event?.preventDefault?.();
    if (!searchEmail.trim()) return;

    setLoading(true);
    setStatus({ type: 'loading', text: 'Searching customer nail sets' });

    try {
      const response = await fetch(`/api/admin-nailsets?email=${encodeURIComponent(searchEmail.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (response.status === 401) {
        logout();
        throw new Error(data.error || 'Admin session expired');
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.reason || data.error || 'Customer search failed');
      }

      setSessions(data.sessions || []);
      setDrafts({});
      setStatus({
        type: 'success',
        text: `${data.sessions?.length || 0} session${data.sessions?.length === 1 ? '' : 's'} found`,
      });
    } catch (error) {
      setStatus({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const updateDraft = (measurementId, field, value) => {
    setDrafts(prev => ({
      ...prev,
      [measurementId]: {
        ...prev[measurementId],
        [field]: value,
      },
    }));
  };

  const updateMeasurement = async (measurement) => {
    const draft = drafts[measurement.id] || {};
    const nextSize = draft.size ?? measurement.nail_size;
    const nextMm = draft.mm ?? measurement.measurement_mm;
    const nextNote = draft.adminNote ?? measurement.admin_note ?? '';

    setLoading(true);
    setStatus({ type: 'loading', text: 'Saving measurement edit' });

    try {
      const response = await fetch('/api/admin-nailsets', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          measurementId: measurement.id,
          size: nextSize,
          mm: nextMm,
          adminNote: nextNote,
        }),
      });
      const data = await response.json();

      if (response.status === 401) {
        logout();
        throw new Error(data.error || 'Admin session expired');
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Measurement update failed');
      }

      const updated = data.measurement;
      setSessions(prev => prev.map(session => ({
        ...session,
        measurements: session.measurements.map(item => (
          item.id === updated.id ? updated : item
        )),
      })));
      setDrafts(prev => {
        const next = { ...prev };
        delete next[measurement.id];
        return next;
      });
      setStatus({ type: 'success', text: 'Measurement updated' });
    } catch (error) {
      setStatus({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const statusClass = status.type === 'success'
    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
    : status.type === 'error'
      ? 'border-rose-500/40 bg-rose-500/10 text-rose-100'
      : 'border-slate-800 bg-slate-900/70 text-slate-400';

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <form onSubmit={login} className="w-full max-w-sm bg-slate-900/60 border border-slate-800 rounded-3xl p-7 shadow-2xl">
          <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mb-6">
            <ShieldCheck className="w-7 h-7 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-black uppercase italic tracking-tight mb-2">Admin Login</h1>
          <p className="text-[10px] text-slate-500 font-black tracking-widest uppercase mb-8">Nail set review console</p>

          <label className="block text-[10px] text-slate-500 font-black tracking-widest uppercase mb-2">Admin Name</label>
          <input
            type="text"
            value={loginName}
            onChange={(event) => setLoginName(event.target.value)}
            className="w-full h-14 bg-black/40 border border-slate-800 rounded-2xl px-4 text-sm font-bold text-white outline-none focus:border-emerald-500/70 mb-4"
            autoComplete="username"
          />

          <label className="block text-[10px] text-slate-500 font-black tracking-widest uppercase mb-2">Password</label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full h-14 bg-black/40 border border-slate-800 rounded-2xl px-4 text-sm font-bold text-white outline-none focus:border-emerald-500/70 mb-5"
            autoComplete="current-password"
          />

          {status.text && (
            <div className={`mb-5 rounded-2xl border px-4 py-3 text-[10px] font-black tracking-widest uppercase ${statusClass}`}>
              {status.text}
            </div>
          )}

          <button
            disabled={loading}
            className="w-full h-14 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <ChevronRight className="w-4 h-4" /> Sign In
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-slate-900 pb-6">
          <div>
            <p className="text-[10px] text-emerald-400 font-black tracking-widest uppercase mb-2">Admin Console</p>
            <h1 className="text-3xl font-black italic uppercase tracking-tight">Customer Nail Sets</h1>
            <p className="text-xs text-slate-500 mt-2 font-bold">{adminName}</p>
          </div>
          <button
            onClick={logout}
            className="h-12 px-4 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-black uppercase tracking-widest flex items-center gap-2 active:scale-95"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </header>

        <section className="border border-slate-800 bg-slate-900/45 rounded-3xl overflow-hidden mb-6">
          <div className="p-5 border-b border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] text-emerald-400 font-black tracking-widest uppercase">Access</p>
              <h2 className="text-lg font-black text-white">Admin Accounts</h2>
            </div>
          </div>

          <form onSubmit={createAdminAccount} className="p-5 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 border-b border-slate-800">
            <input
              type="text"
              value={newAccountName}
              onChange={(event) => setNewAccountName(event.target.value)}
              placeholder="admin-name"
              className="h-12 bg-black/40 border border-slate-800 rounded-2xl px-4 text-sm font-bold text-white outline-none focus:border-emerald-500/70"
              autoComplete="off"
            />
            <input
              type="password"
              value={newAccountPassword}
              onChange={(event) => setNewAccountPassword(event.target.value)}
              placeholder="temporary password"
              className="h-12 bg-black/40 border border-slate-800 rounded-2xl px-4 text-sm font-bold text-white outline-none focus:border-emerald-500/70"
              autoComplete="new-password"
            />
            <button
              disabled={loading}
              className="h-12 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95"
            >
              <UserPlus className="w-4 h-4" /> Create
            </button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="text-[9px] uppercase tracking-widest text-slate-500 bg-black/25">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Login</th>
                  <th className="px-4 py-3">Created By</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(account => (
                  <tr key={account.id} className="border-t border-slate-800/80">
                    <td className="px-4 py-3">
                      <div className="font-black text-sm">{account.adminName}</div>
                      <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{account.role}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest border ${account.active ? 'border-emerald-500/35 text-emerald-300 bg-emerald-500/10' : 'border-slate-700 text-slate-500 bg-slate-950/60'}`}>
                        {account.active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 font-bold">{formatDate(account.lastLoginAt)}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 font-bold">{account.createdBy || 'System'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggleAdminAccount(account)}
                        disabled={loading || account.adminName === adminName}
                        className="h-10 px-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2 active:scale-95 disabled:opacity-40"
                      >
                        <Power className="w-4 h-4" /> {account.active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <form onSubmit={search} className="flex flex-col sm:flex-row gap-3 mb-5">
          <input
            type="email"
            value={searchEmail}
            onChange={(event) => setSearchEmail(event.target.value)}
            placeholder="customer@email.com"
            className="h-14 flex-1 bg-black/40 border border-slate-800 rounded-2xl px-4 text-sm font-bold text-white outline-none focus:border-emerald-500/70"
          />
          <button
            disabled={loading}
            className="h-14 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95"
          >
            <Search className="w-4 h-4" /> Search
          </button>
        </form>

        {status.text && (
          <div className={`mb-6 rounded-2xl border px-4 py-3 text-[10px] font-black tracking-widest uppercase ${statusClass}`}>
            {status.text}
          </div>
        )}

        <div className="space-y-6">
          {sessions.map(session => (
            <section key={session.session_id} className="border border-slate-800 bg-slate-900/45 rounded-3xl overflow-hidden">
              <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] text-slate-500 font-black tracking-widest uppercase">{session.status || 'draft'} session</p>
                  <h2 className="text-lg font-black text-white">{session.customer_email}</h2>
                </div>
                <div className="text-left sm:text-right text-[10px] text-slate-500 font-black uppercase tracking-widest">
                  <div>{formatDate(session.updated_at || session.created_at)}</div>
                  <div>{session.measurements?.length || 0} measurements</div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead className="text-[9px] uppercase tracking-widest text-slate-500 bg-black/25">
                    <tr>
                      <th className="px-4 py-3">Finger</th>
                      <th className="px-4 py-3">MM</th>
                      <th className="px-4 py-3">Size</th>
                      <th className="px-4 py-3">Note</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {session.measurements?.map(measurement => {
                      const draft = drafts[measurement.id] || {};
                      return (
                        <tr key={measurement.id} className="border-t border-slate-800/80">
                          <td className="px-4 py-3">
                            <div className="font-black text-sm">{measurement.finger_name}</div>
                            <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{measurement.hand_side}</div>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              value={draft.mm ?? measurement.measurement_mm ?? ''}
                              onChange={(event) => updateDraft(measurement.id, 'mm', event.target.value)}
                              className="w-24 h-11 bg-black/40 border border-slate-800 rounded-xl px-3 text-sm font-bold outline-none focus:border-emerald-500/70"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              value={draft.size ?? measurement.nail_size ?? ''}
                              onChange={(event) => updateDraft(measurement.id, 'size', event.target.value)}
                              className="w-20 h-11 bg-black/40 border border-slate-800 rounded-xl px-3 text-sm font-bold outline-none focus:border-emerald-500/70"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              value={draft.adminNote ?? measurement.admin_note ?? ''}
                              onChange={(event) => updateDraft(measurement.id, 'adminNote', event.target.value)}
                              className="w-full h-11 bg-black/40 border border-slate-800 rounded-xl px-3 text-sm font-bold outline-none focus:border-emerald-500/70"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => updateMeasurement(measurement)}
                              disabled={loading}
                              className="h-11 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/35 text-emerald-300 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2 active:scale-95 disabled:opacity-50"
                            >
                              <Save className="w-4 h-4" /> Save
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AdminPortal;
