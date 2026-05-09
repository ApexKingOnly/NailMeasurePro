import React, { useEffect, useState } from 'react';
import { ChevronRight, KeyRound, LogOut, Power, Save, Search, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { calculateMM, mmToNailSize } from './utils/sizing.js';
import BrandDecor from './BrandArtwork.jsx';

const ADMIN_TOKEN_KEY = 'nailmeasure_admin_token';
const ADMIN_NAME_KEY = 'nailmeasure_admin_name';
const LEGACY_ADMIN_EMAIL_KEY = 'nailmeasure_admin_email';
const DEFAULT_ADMIN_NAME = 'admin';
const ADMIN_GUIDE_COLORS = {
  coin: '#c9a56a',
  coinRadius: '#c9b4dc',
  nail: '#fff8ee',
  nailAccent: '#e8b7b3',
};

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

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const cloneGuide = (guide) => {
  if (!guide?.quarter || !guide?.nail?.left || !guide?.nail?.right) return null;

  return {
    quarter: { ...guide.quarter },
    nail: {
      left: { ...guide.nail.left },
      right: { ...guide.nail.right },
    },
  };
};

const getGuideMeasurement = (guide) => {
  if (!guide?.quarter || !guide?.nail?.left || !guide?.nail?.right) return null;
  const quarterPixels = Number(guide.quarter.r) * 2;
  const nailPixels = Math.hypot(
    Number(guide.nail.right.x) - Number(guide.nail.left.x),
    Number(guide.nail.right.y) - Number(guide.nail.left.y),
  );
  const mm = calculateMM(nailPixels, quarterPixels);
  const size = mmToNailSize(mm);

  if (!Number.isFinite(mm) || mm <= 0 || size === 'N/A') return null;

  return {
    mm: mm.toFixed(2),
    size,
    quarterPixels,
    nailPixels,
  };
};

function AdminPortal() {
  const [token, setToken] = useState(() => getStoredValue(ADMIN_TOKEN_KEY));
  const [adminName, setAdminName] = useState(() => getStoredValue(ADMIN_NAME_KEY));
  const [loginName, setLoginName] = useState(() => getStoredValue(ADMIN_NAME_KEY) || DEFAULT_ADMIN_NAME);
  const [password, setPassword] = useState('');
  const [searchEmail, setSearchEmail] = useState('');
  const [sessions, setSessions] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [guideDrag, setGuideDrag] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountPassword, setNewAccountPassword] = useState('');
  const [accountPasswordDrafts, setAccountPasswordDrafts] = useState({});
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
    setAccountPasswordDrafts({});
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

  const resetAdminPassword = async (account) => {
    const nextPassword = accountPasswordDrafts[account.id] || '';

    if (nextPassword.length < 8) {
      setStatus({ type: 'error', text: 'Password must be at least 8 characters' });
      return;
    }

    setLoading(true);
    setStatus({ type: 'loading', text: 'Resetting admin password' });

    try {
      const response = await fetch('/api/admin-accounts', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ accountId: account.id, password: nextPassword }),
      });
      const data = await response.json();

      if (response.status === 401) {
        logout();
        throw new Error(data.error || 'Admin session expired');
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Admin password reset failed');
      }

      setAccounts(prev => prev.map(item => (
        item.id === data.account.id ? data.account : item
      )));
      setAccountPasswordDrafts(prev => {
        const next = { ...prev };
        delete next[account.id];
        return next;
      });
      setStatus({ type: 'success', text: account.adminName === adminName ? 'Password reset; use it next login' : 'Admin password reset' });
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

  const updateGuideDraft = (measurement, handle, event, surfaceElement = event.currentTarget) => {
    const frame = measurement.frame;
    const sourceGuide = drafts[measurement.id]?.guide || measurement.guide;
    const guide = cloneGuide(sourceGuide);
    const surface = surfaceElement?.ownerSVGElement || surfaceElement;

    if (!frame?.width || !frame?.height || !guide || !surface?.getBoundingClientRect) return;

    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const point = {
      x: clamp(((event.clientX - rect.left) / rect.width) * frame.width, 0, frame.width),
      y: clamp(((event.clientY - rect.top) / rect.height) * frame.height, 0, frame.height),
    };

    if (handle === 'quarter') {
      guide.quarter.x = point.x;
      guide.quarter.y = point.y;
    } else if (handle === 'quarterRadius') {
      guide.quarter.r = clamp(
        Math.hypot(point.x - guide.quarter.x, point.y - guide.quarter.y),
        frame.width * 0.035,
        frame.width * 0.35,
      );
    } else if (handle === 'nailLeft') {
      guide.nail.left = point;
    } else if (handle === 'nailRight') {
      guide.nail.right = point;
    }

    const measurementResult = getGuideMeasurement(guide);

    setDrafts(prev => ({
      ...prev,
      [measurement.id]: {
        ...prev[measurement.id],
        guide,
        ...(measurementResult
          ? {
              mm: measurementResult.mm,
              size: measurementResult.size,
              quarterPixels: measurementResult.quarterPixels,
              nailPixels: measurementResult.nailPixels,
            }
          : {}),
      },
    }));
  };

  const startGuideDrag = (measurement, handle, event) => {
    event.preventDefault();
    const surface = event.currentTarget.ownerSVGElement;
    surface?.setPointerCapture?.(event.pointerId);
    setGuideDrag({ measurementId: measurement.id, handle });
    updateGuideDraft(measurement, handle, event, surface);
  };

  const stopGuideDrag = (event) => {
    event.currentTarget?.releasePointerCapture?.(event.pointerId);
    setGuideDrag(null);
  };

  const updateMeasurement = async (measurement) => {
    const draft = drafts[measurement.id] || {};
    const nextSize = draft.size ?? measurement.nail_size;
    const nextMm = draft.mm ?? measurement.measurement_mm;
    const nextNote = draft.adminNote ?? measurement.admin_note ?? '';
    const nextGuide = draft.guide ?? measurement.guide ?? null;
    const nextQuarterPixels = draft.quarterPixels ?? measurement.quarter_pixels ?? null;
    const nextNailPixels = draft.nailPixels ?? measurement.nail_pixels ?? null;

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
          guide: nextGuide,
          quarterPixels: nextQuarterPixels,
          nailPixels: nextNailPixels,
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
          item.id === updated.id
            ? {
                ...item,
                ...updated,
                signed_image_url: item.signed_image_url,
                image_url_error: item.image_url_error,
              }
            : item
        )),
      })));
      setDrafts(prev => {
        const next = { ...prev };
        delete next[measurement.id];
        return next;
      });
      setStatus({ type: 'success', text: data.trainingLogged ? 'Measurement updated and AI label logged' : 'Measurement updated' });
    } catch (error) {
      setStatus({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const renderMeasurementPhotoEditor = (measurement) => {
    const draft = drafts[measurement.id] || {};
    const frame = measurement.frame;
    const guide = draft.guide || measurement.guide;
    const measured = getGuideMeasurement(guide);

    if (!measurement.signed_image_url || !frame?.width || !frame?.height || !guide?.quarter || !guide?.nail) {
      return (
        <div className="brand-tile w-64 min-h-36 flex items-center justify-center px-4 text-center text-[10px] brand-eyebrow font-black uppercase tracking-widest">
          No saved photo
        </div>
      );
    }

    const quarter = guide.quarter;
    const nail = guide.nail;
    const radiusHandle = {
      x: quarter.x + quarter.r,
      y: quarter.y,
    };
    const isDragging = guideDrag?.measurementId === measurement.id;

    const handleProps = (handle) => ({
      onPointerDown: (event) => startGuideDrag(measurement, handle, event),
      className: 'cursor-grab active:cursor-grabbing',
    });

    return (
      <div className="w-72">
        <div
          className="relative w-72 overflow-hidden rounded-2xl border border-slate-800 bg-black touch-none"
          style={{ aspectRatio: `${frame.width} / ${frame.height}` }}
        >
          <img
            src={measurement.signed_image_url}
            alt={`${measurement.finger_name} captured nail`}
            className="absolute inset-0 h-full w-full object-cover"
            draggable="false"
          />
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${frame.width} ${frame.height}`}
            preserveAspectRatio="none"
            onPointerMove={(event) => {
              if (guideDrag?.measurementId === measurement.id) {
                updateGuideDraft(measurement, guideDrag.handle, event, event.currentTarget);
              }
            }}
            onPointerUp={stopGuideDrag}
            onPointerCancel={stopGuideDrag}
          >
            <circle cx={quarter.x} cy={quarter.y} r={quarter.r} fill="rgba(201,165,106,0.04)" stroke={ADMIN_GUIDE_COLORS.coin} strokeWidth="2.5" strokeDasharray="12 10" />
            <line x1={quarter.x - 10} y1={quarter.y} x2={quarter.x + 10} y2={quarter.y} stroke={ADMIN_GUIDE_COLORS.coin} strokeWidth="2" />
            <line x1={quarter.x} y1={quarter.y - 10} x2={quarter.x} y2={quarter.y + 10} stroke={ADMIN_GUIDE_COLORS.coin} strokeWidth="2" />
            <line x1={nail.left.x} y1={nail.left.y} x2={nail.right.x} y2={nail.right.y} stroke={ADMIN_GUIDE_COLORS.nail} strokeWidth="5" strokeLinecap="round" opacity="0.35" />
            <line x1={nail.left.x} y1={nail.left.y} x2={nail.right.x} y2={nail.right.y} stroke={ADMIN_GUIDE_COLORS.nailAccent} strokeWidth="2.25" strokeLinecap="round" strokeDasharray="7 6" />

            <circle cx={quarter.x} cy={quarter.y} r="18" fill="rgba(201,165,106,0.01)" stroke={ADMIN_GUIDE_COLORS.coin} strokeWidth="2" {...handleProps('quarter')} />
            <circle cx={radiusHandle.x} cy={radiusHandle.y} r="16" fill="rgba(201,180,220,0.01)" stroke={ADMIN_GUIDE_COLORS.coinRadius} strokeWidth="2" {...handleProps('quarterRadius')} />
            <line x1={nail.left.x} y1={nail.left.y - 60} x2={nail.left.x} y2={nail.left.y + 112} stroke={ADMIN_GUIDE_COLORS.nail} strokeWidth="2" strokeDasharray="8 7" opacity="0.9" {...handleProps('nailLeft')} />
            <line x1={nail.right.x} y1={nail.right.y - 60} x2={nail.right.x} y2={nail.right.y + 112} stroke={ADMIN_GUIDE_COLORS.nail} strokeWidth="2" strokeDasharray="8 7" opacity="0.9" {...handleProps('nailRight')} />
            <circle cx={nail.left.x} cy={nail.left.y} r="18" fill="rgba(255,248,238,0.01)" stroke={ADMIN_GUIDE_COLORS.nail} strokeWidth="2" {...handleProps('nailLeft')} />
            <circle cx={nail.right.x} cy={nail.right.y} r="18" fill="rgba(255,248,238,0.01)" stroke={ADMIN_GUIDE_COLORS.nail} strokeWidth="2" {...handleProps('nailRight')} />
          </svg>
        </div>
        <div className={`mt-2 text-[10px] font-black uppercase tracking-widest ${isDragging ? 'brand-accent' : 'brand-eyebrow'}`}>
          {measured ? `${measured.mm}mm / size ${measured.size}` : 'Adjust guides'}
        </div>
      </div>
    );
  };

  const statusClass = status.type === 'success'
    ? 'brand-status-success'
    : status.type === 'error'
      ? 'brand-status-error'
      : 'brand-status-neutral';

  if (!token) {
    return (
      <div className="brand-shell min-h-screen flex items-center justify-center p-6">
        <BrandDecor />
        <form onSubmit={login} className="brand-panel w-full max-w-sm p-7 shadow-2xl">
          <div className="brand-icon-card w-14 h-14 flex items-center justify-center mb-6">
            <ShieldCheck className="w-7 h-7 brand-accent" />
          </div>
          <div className="brand-wordmark-small text-4xl mb-1">Nails By Liz</div>
          <h1 className="text-2xl font-black uppercase brand-heading mb-2">Admin Login</h1>
          <p className="brand-eyebrow text-[10px] font-black tracking-widest uppercase mb-8">Nail set review console</p>

          <label className="block text-[10px] brand-eyebrow font-black tracking-widest uppercase mb-2">Admin Name</label>
          <input
            type="text"
            value={loginName}
            onChange={(event) => setLoginName(event.target.value)}
            className="brand-input w-full h-14 border px-4 text-sm font-bold outline-none mb-4"
            autoComplete="username"
          />

          <label className="block text-[10px] brand-eyebrow font-black tracking-widest uppercase mb-2">Password</label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="brand-input w-full h-14 border px-4 text-sm font-bold outline-none mb-5"
            autoComplete="current-password"
          />

          {status.text && (
            <div className={`mb-5 rounded-2xl border px-4 py-3 text-[10px] font-black tracking-widest uppercase ${statusClass}`}>
              {status.text}
            </div>
          )}

          <button
            disabled={loading}
            className="brand-primary w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <ChevronRight className="w-4 h-4" /> Sign In
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="brand-admin-shell p-4 sm:p-8">
      <BrandDecor soft />
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b brand-divider pb-6">
          <div>
            <p className="text-[10px] brand-accent font-black tracking-widest uppercase mb-2">Admin Console</p>
            <div className="brand-wordmark-small text-4xl leading-none">Nails By Liz</div>
            <h1 className="text-2xl font-black uppercase brand-heading mt-1">Customer Nail Sets</h1>
            <p className="text-xs brand-eyebrow mt-2 font-bold">{adminName}</p>
          </div>
          <button
            onClick={logout}
            className="brand-secondary h-12 px-4 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2 active:scale-95"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </header>

        <section className="brand-admin-panel overflow-hidden mb-6">
          <div className="p-5 border-b brand-divider flex items-center gap-3">
            <div className="brand-icon-card w-10 h-10 flex items-center justify-center">
              <Users className="w-5 h-5 brand-accent" />
            </div>
            <div>
              <p className="text-[10px] brand-accent font-black tracking-widest uppercase">Access</p>
              <h2 className="text-lg font-black brand-heading">Admin Accounts</h2>
            </div>
          </div>

          <form onSubmit={createAdminAccount} className="p-5 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 border-b brand-divider">
            <input
              type="text"
              value={newAccountName}
              onChange={(event) => setNewAccountName(event.target.value)}
              placeholder="admin-name"
              className="brand-input h-12 border rounded-2xl px-4 text-sm font-bold outline-none"
              autoComplete="off"
            />
            <input
              type="password"
              value={newAccountPassword}
              onChange={(event) => setNewAccountPassword(event.target.value)}
              placeholder="temporary password"
              className="brand-input h-12 border rounded-2xl px-4 text-sm font-bold outline-none"
              autoComplete="new-password"
            />
            <button
              disabled={loading}
              className="brand-primary h-12 px-5 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95"
            >
              <UserPlus className="w-4 h-4" /> Create
            </button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="text-[9px] uppercase tracking-widest text-slate-500 bg-black/25">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Login</th>
                  <th className="px-4 py-3">Created By</th>
                  <th className="px-4 py-3">Password</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(account => (
                  <tr key={account.id} className="border-t border-slate-800/80">
                    <td className="px-4 py-3">
                      <div className="font-black text-sm">{account.adminName}</div>
                      <div className="text-[9px] brand-eyebrow font-black uppercase tracking-widest">{account.role}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest border ${account.active ? 'brand-chip-active' : 'brand-chip'}`}>
                        {account.active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs brand-eyebrow font-bold">{formatDate(account.lastLoginAt)}</td>
                    <td className="px-4 py-3 text-xs brand-eyebrow font-bold">{account.createdBy || 'System'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={accountPasswordDrafts[account.id] || ''}
                          onChange={(event) => setAccountPasswordDrafts(prev => ({
                            ...prev,
                            [account.id]: event.target.value,
                          }))}
                          placeholder="new password"
                          className="brand-input h-10 w-44 border rounded-xl px-3 text-xs font-bold outline-none"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => resetAdminPassword(account)}
                          disabled={loading || !(accountPasswordDrafts[account.id] || '').length}
                          className="brand-secondary h-10 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2 active:scale-95 disabled:opacity-40"
                        >
                          <KeyRound className="w-4 h-4" /> Reset
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggleAdminAccount(account)}
                        disabled={loading || account.adminName === adminName}
                        className="brand-secondary h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2 active:scale-95 disabled:opacity-40"
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
            className="brand-input h-12 flex-1 border rounded-2xl px-4 text-sm font-bold outline-none"
          />
          <button
            disabled={loading}
            className="brand-primary h-12 px-6 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95"
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
            <section key={session.session_id} className="brand-admin-panel overflow-hidden">
              <div className="p-5 border-b brand-divider flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] brand-eyebrow font-black tracking-widest uppercase">{session.status || 'draft'} session</p>
                  <h2 className="text-lg font-black brand-heading">{session.customer_email}</h2>
                </div>
                <div className="text-left sm:text-right text-[10px] brand-eyebrow font-black uppercase tracking-widest">
                  <div>{formatDate(session.updated_at || session.created_at)}</div>
                  <div>{session.measurements?.length || 0} measurements</div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] text-left">
                  <thead className="text-[9px] uppercase tracking-widest text-slate-500 bg-black/25">
                    <tr>
                      <th className="px-4 py-3">Photo</th>
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
                          <td className="px-4 py-3 align-top">
                            {renderMeasurementPhotoEditor(measurement)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-black text-sm">{measurement.finger_name}</div>
                            <div className="text-[9px] brand-eyebrow font-black uppercase tracking-widest">{measurement.hand_side}</div>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              value={draft.mm ?? measurement.measurement_mm ?? ''}
                              onChange={(event) => updateDraft(measurement.id, 'mm', event.target.value)}
                              className="brand-input w-24 h-11 border rounded-xl px-3 text-sm font-bold outline-none"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              value={draft.size ?? measurement.nail_size ?? ''}
                              onChange={(event) => updateDraft(measurement.id, 'size', event.target.value)}
                              className="brand-input w-20 h-11 border rounded-xl px-3 text-sm font-bold outline-none"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              value={draft.adminNote ?? measurement.admin_note ?? ''}
                              onChange={(event) => updateDraft(measurement.id, 'adminNote', event.target.value)}
                              className="brand-input w-full h-11 border rounded-xl px-3 text-sm font-bold outline-none"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => updateMeasurement(measurement)}
                              disabled={loading}
                              className="brand-secondary h-11 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2 active:scale-95 disabled:opacity-50"
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
