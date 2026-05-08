import { createClient } from '@supabase/supabase-js';
import {
  createAdminToken,
  getAdminAccountConfig,
  normalizeAdminName,
  parseRequestBody,
  verifyPassword,
} from './admin-auth.js';

const getEnvAdmin = () => ({
  name: normalizeAdminName(process.env.ADMIN_NAME || process.env.ADMIN_EMAIL),
  password: String(process.env.ADMIN_PASSWORD || ''),
});

const loginWithEnvAdmin = ({ name, password, secret }) => {
  const envAdmin = getEnvAdmin();
  if (!envAdmin.name || !envAdmin.password) return null;
  if (name !== envAdmin.name || password !== envAdmin.password) return null;

  const session = createAdminToken({ name: envAdmin.name, role: 'admin' }, secret);
  return {
    ok: true,
    configured: true,
    source: 'env',
    adminName: envAdmin.name,
    adminEmail: envAdmin.name,
    ...session,
  };
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST required' });
    return;
  }

  try {
    const adminSecret = String(process.env.ADMIN_SESSION_SECRET || '');

    if (!adminSecret) {
      res.status(200).json({
        ok: false,
        configured: false,
        reason: 'Set ADMIN_SESSION_SECRET to enable admin login.',
      });
      return;
    }

    const body = parseRequestBody(req.body);
    const name = normalizeAdminName(body.name || body.email);
    const password = String(body.password || '');
    const accountConfig = getAdminAccountConfig();

    if (!name || !password) {
      res.status(400).json({ ok: false, configured: true, error: 'Admin name and password are required' });
      return;
    }

    if (accountConfig.configured) {
      const supabase = createClient(accountConfig.url, accountConfig.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const result = await supabase
        .from(accountConfig.table)
        .select('*')
        .eq('admin_name_normalized', name)
        .eq('active', true)
        .maybeSingle();

      if (result.error) {
        const envLogin = loginWithEnvAdmin({ name, password, secret: adminSecret });
        if (envLogin) {
          res.status(200).json(envLogin);
          return;
        }

        throw new Error(`Admin account lookup failed: ${result.error.message}`);
      }

      if (result.data) {
        if (!verifyPassword(password, result.data.password_hash)) {
          res.status(401).json({ ok: false, configured: true, error: 'Invalid admin credentials' });
          return;
        }

        await supabase
          .from(accountConfig.table)
          .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', result.data.id);

        const session = createAdminToken({ name: result.data.admin_name_normalized, role: result.data.role }, adminSecret);
        res.status(200).json({
          ok: true,
          configured: true,
          source: 'database',
          adminName: result.data.admin_name,
          adminEmail: result.data.admin_name,
          ...session,
        });
        return;
      }
    }

    const envLogin = loginWithEnvAdmin({ name, password, secret: adminSecret });
    if (envLogin) {
      res.status(200).json(envLogin);
      return;
    }

    res.status(401).json({ ok: false, configured: accountConfig.configured, error: 'Invalid admin credentials' });
  } catch (error) {
    res.status(500).json({
      ok: false,
      configured: true,
      error: error.message || 'Admin login failed',
    });
  }
}
