import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_SESSIONS_TABLE = 'customer_nail_sessions';
const DEFAULT_MEASUREMENTS_TABLE = 'customer_nail_measurements';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parseRequestBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body);
  return body;
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const sign = (payload, secret) => (
  crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url')
);

const timingSafeEqualText = (left, right) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const verifyAdmin = (req) => {
  const secret = String(process.env.ADMIN_SESSION_SECRET || '');
  if (!secret) return { ok: false, configured: false };

  const auth = String(req.headers.authorization || req.headers.Authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return { ok: false, status: 401, error: 'Admin login required' };

  const expected = sign(payload, secret);
  if (!timingSafeEqualText(signature, expected)) {
    return { ok: false, status: 401, error: 'Invalid admin session' };
  }

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (error) {
    return { ok: false, status: 401, error: 'Invalid admin session' };
  }

  if (claims.role !== 'admin' || Number(claims.exp || 0) < Date.now()) {
    return { ok: false, status: 401, error: 'Admin session expired' };
  }

  return { ok: true, name: claims.name || claims.email || 'admin' };
};

const getSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sessionsTable = process.env.CUSTOMER_NAIL_SESSIONS_TABLE || DEFAULT_SESSIONS_TABLE;
  const measurementsTable = process.env.CUSTOMER_NAIL_MEASUREMENTS_TABLE || DEFAULT_MEASUREMENTS_TABLE;

  if (!url || !serviceRoleKey) {
    return { configured: false, sessionsTable, measurementsTable };
  }

  return { configured: true, url, serviceRoleKey, sessionsTable, measurementsTable };
};

const getSupabase = (config) => createClient(config.url, config.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const admin = verifyAdmin(req);
  if (!admin.ok) {
    res.status(admin.status || 200).json({
      ok: false,
      configured: admin.configured !== false,
      error: admin.error,
      reason: admin.configured === false ? 'Set ADMIN_SESSION_SECRET to enable admin APIs.' : undefined,
    });
    return;
  }

  const config = getSupabaseConfig();
  if (!config.configured) {
    res.status(200).json({
      ok: false,
      configured: false,
      reason: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to load customer nail sets.',
    });
    return;
  }

  const supabase = getSupabase(config);

  try {
    if (req.method === 'GET') {
      const requestUrl = new URL(req.url || '', 'https://nailmeasure.local');
      const email = normalizeEmail(requestUrl.searchParams.get('email'));

      if (!EMAIL_PATTERN.test(email)) {
        res.status(400).json({ ok: false, configured: true, error: 'Valid customer email is required' });
        return;
      }

      const sessionsResult = await supabase
        .from(config.sessionsTable)
        .select('*')
        .eq('customer_email_normalized', email)
        .order('updated_at', { ascending: false })
        .limit(25);

      if (sessionsResult.error) {
        throw new Error(`Customer session lookup failed: ${sessionsResult.error.message}`);
      }

      const sessions = sessionsResult.data || [];
      const sessionIds = sessions.map((session) => session.session_id).filter(Boolean);
      let measurements = [];

      if (sessionIds.length) {
        const measurementsResult = await supabase
          .from(config.measurementsTable)
          .select('*')
          .in('session_id', sessionIds)
          .order('shot_number', { ascending: true });

        if (measurementsResult.error) {
          throw new Error(`Customer measurement lookup failed: ${measurementsResult.error.message}`);
        }

        measurements = measurementsResult.data || [];
      }

      res.status(200).json({
        ok: true,
        configured: true,
        sessions: sessions.map((session) => ({
          ...session,
          measurements: measurements.filter((measurement) => measurement.session_id === session.session_id),
        })),
      });
      return;
    }

    if (req.method === 'PATCH') {
      const body = parseRequestBody(req.body);
      const measurementId = String(body.measurementId || '').trim();
      const size = String(body.size || '').trim();
      const mm = toFiniteNumber(body.mm);
      const adminNote = String(body.adminNote || '').trim();

      if (!measurementId || !size || mm === null || mm <= 0) {
        res.status(400).json({ ok: false, configured: true, error: 'Valid measurementId, size, and mm are required' });
        return;
      }

      const updateResult = await supabase
        .from(config.measurementsTable)
        .update({
          nail_size: size,
          measurement_mm: mm,
          admin_note: adminNote || null,
          admin_email: admin.name,
          admin_edited_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', measurementId)
        .select('*')
        .single();

      if (updateResult.error) {
        throw new Error(`Measurement update failed: ${updateResult.error.message}`);
      }

      if (updateResult.data?.session_id) {
        await supabase
          .from(config.sessionsTable)
          .update({ updated_at: new Date().toISOString() })
          .eq('session_id', updateResult.data.session_id);
      }

      res.status(200).json({
        ok: true,
        configured: true,
        measurement: updateResult.data,
      });
      return;
    }

    res.status(405).json({ ok: false, configured: true, error: 'GET or PATCH required' });
  } catch (error) {
    res.status(502).json({
      ok: false,
      configured: true,
      error: error.message || 'Admin nail set request failed',
    });
  }
}
