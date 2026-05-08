import { createClient } from '@supabase/supabase-js';
import {
  ADMIN_NAME_PATTERN,
  getAdminAccountConfig,
  hashPassword,
  normalizeAdminName,
  parseRequestBody,
  toPublicAdminAccount,
  verifyAdminToken,
} from './admin-auth.js';

const getSupabase = (config) => createClient(config.url, config.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const validatePassword = (password) => (
  typeof password === 'string' && password.length >= 8 && password.length <= 128
);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const admin = verifyAdminToken(req);
  if (!admin.ok) {
    res.status(admin.status || 200).json({
      ok: false,
      configured: admin.configured !== false,
      error: admin.error,
      reason: admin.configured === false ? 'Set ADMIN_SESSION_SECRET to enable admin APIs.' : undefined,
    });
    return;
  }

  const config = getAdminAccountConfig();
  if (!config.configured) {
    res.status(200).json({
      ok: false,
      configured: false,
      reason: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to manage admin accounts.',
    });
    return;
  }

  const supabase = getSupabase(config);

  try {
    if (req.method === 'GET') {
      const result = await supabase
        .from(config.table)
        .select('id, admin_name, role, active, created_at, updated_at, created_by, last_login_at, password_changed_at')
        .order('created_at', { ascending: true });

      if (result.error) throw new Error(`Admin account list failed: ${result.error.message}`);

      res.status(200).json({
        ok: true,
        configured: true,
        accounts: (result.data || []).map(toPublicAdminAccount),
      });
      return;
    }

    if (req.method === 'POST') {
      const body = parseRequestBody(req.body);
      const adminName = String(body.name || '').trim();
      const normalizedName = normalizeAdminName(adminName);
      const password = String(body.password || '');

      if (!ADMIN_NAME_PATTERN.test(adminName) || normalizedName !== adminName.toLowerCase()) {
        res.status(400).json({
          ok: false,
          configured: true,
          error: 'Admin name must be 3-40 characters using letters, numbers, dot, dash, or underscore',
        });
        return;
      }

      if (!validatePassword(password)) {
        res.status(400).json({
          ok: false,
          configured: true,
          error: 'Password must be 8-128 characters',
        });
        return;
      }

      const insert = await supabase
        .from(config.table)
        .insert({
          admin_name: adminName,
          admin_name_normalized: normalizedName,
          password_hash: hashPassword(password),
          role: 'admin',
          active: true,
          created_by: admin.name,
          password_changed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id, admin_name, role, active, created_at, updated_at, created_by, last_login_at, password_changed_at')
        .single();

      if (insert.error) {
        const alreadyExists = insert.error.code === '23505';
        res.status(alreadyExists ? 409 : 502).json({
          ok: false,
          configured: true,
          error: alreadyExists ? 'That admin name already exists' : `Admin account create failed: ${insert.error.message}`,
        });
        return;
      }

      res.status(201).json({
        ok: true,
        configured: true,
        account: toPublicAdminAccount(insert.data),
      });
      return;
    }

    if (req.method === 'PATCH') {
      const body = parseRequestBody(req.body);
      const accountId = String(body.accountId || '').trim();
      const nextActive = typeof body.active === 'boolean' ? body.active : null;
      const nextPassword = typeof body.password === 'string' && body.password.length ? body.password : null;

      if (!accountId) {
        res.status(400).json({ ok: false, configured: true, error: 'Valid accountId is required' });
        return;
      }

      const existing = await supabase
        .from(config.table)
        .select('id, admin_name, admin_name_normalized, active')
        .eq('id', accountId)
        .single();

      if (existing.error) throw new Error(`Admin account lookup failed: ${existing.error.message}`);

      if (nextActive === false && existing.data.admin_name_normalized === normalizeAdminName(admin.name)) {
        res.status(400).json({ ok: false, configured: true, error: 'You cannot disable your own admin account' });
        return;
      }

      if (nextPassword !== null && !validatePassword(nextPassword)) {
        res.status(400).json({ ok: false, configured: true, error: 'Password must be 8-128 characters' });
        return;
      }

      const update = { updated_at: new Date().toISOString() };
      if (nextActive !== null) update.active = nextActive;
      if (nextPassword !== null) {
        update.password_hash = hashPassword(nextPassword);
        update.password_changed_at = new Date().toISOString();
      }

      const result = await supabase
        .from(config.table)
        .update(update)
        .eq('id', accountId)
        .select('id, admin_name, role, active, created_at, updated_at, created_by, last_login_at, password_changed_at')
        .single();

      if (result.error) throw new Error(`Admin account update failed: ${result.error.message}`);

      res.status(200).json({
        ok: true,
        configured: true,
        account: toPublicAdminAccount(result.data),
      });
      return;
    }

    res.status(405).json({ ok: false, configured: true, error: 'GET, POST, or PATCH required' });
  } catch (error) {
    res.status(502).json({
      ok: false,
      configured: true,
      error: error.message || 'Admin account request failed',
    });
  }
}
