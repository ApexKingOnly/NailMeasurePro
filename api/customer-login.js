import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const DEFAULT_SESSIONS_TABLE = 'customer_nail_sessions';
const DEFAULT_MEASUREMENTS_TABLE = 'customer_nail_measurements';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CUSTOMER_PASSWORD_MIN_LENGTH = 8;

const parseRequestBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body);
  return body;
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const hashCustomerPassword = (email, password) => {
  const normalizedPassword = String(password || '');
  if (normalizedPassword.length < CUSTOMER_PASSWORD_MIN_LENGTH) return null;
  const secret = process.env.CUSTOMER_AUTH_SECRET || process.env.CUSTOMER_ACCESS_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'nailmeasure-local';
  return crypto
    .createHash('sha256')
    .update(`${secret}:${normalizeEmail(email)}:${normalizedPassword}`)
    .digest('hex');
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

const toCustomerMeasurement = (measurement) => {
  const frame = measurement.frame && typeof measurement.frame === 'object'
    ? { ...measurement.frame }
    : measurement.frame;

  if (frame && typeof frame === 'object') {
    delete frame.customerPasswordHash;
    delete frame.customerAccessHash;
  }

  return { ...measurement, frame };
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
    const body = parseRequestBody(req.body);
    const config = getSupabaseConfig();
    const customerEmail = normalizeEmail(body.customerEmail);
    const passwordHash = hashCustomerPassword(customerEmail, body.password || body.accessCode);

    if (!EMAIL_PATTERN.test(customerEmail) || !passwordHash) {
      res.status(400).json({ ok: false, configured: true, error: 'Valid customer email and password are required' });
      return;
    }

    if (!config.configured) {
      res.status(200).json({
        ok: false,
        configured: false,
        reason: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to load saved nail sizes.',
      });
      return;
    }

    const supabase = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const sessionsResult = await supabase
      .from(config.sessionsTable)
      .select('*')
      .eq('customer_email_normalized', customerEmail)
      .order('updated_at', { ascending: false })
      .limit(25);

    if (sessionsResult.error) {
      throw new Error(`Saved nail set lookup failed: ${sessionsResult.error.message}`);
    }

    const sessions = sessionsResult.data || [];
    const sessionIds = sessions.map(session => session.session_id).filter(Boolean);
    let measurements = [];

    if (sessionIds.length) {
      const measurementsResult = await supabase
        .from(config.measurementsTable)
        .select('*')
        .in('session_id', sessionIds)
        .order('shot_number', { ascending: true });

      if (measurementsResult.error) {
        throw new Error(`Saved nail size lookup failed: ${measurementsResult.error.message}`);
      }

      measurements = await Promise.all((measurementsResult.data || []).map(async (measurement) => {
        if (!measurement.image_bucket || !measurement.image_path) return measurement;

        const signed = await supabase.storage
          .from(measurement.image_bucket)
          .createSignedUrl(measurement.image_path, 60 * 60);

        return {
          ...measurement,
          signed_image_url: signed.data?.signedUrl || null,
          image_url_error: signed.error?.message || null,
        };
      }));
    }

    const allowedSessionIds = new Set(
      measurements
        .filter(measurement => (
          measurement.frame?.customerPasswordHash === passwordHash ||
          measurement.frame?.customerAccessHash === passwordHash
        ))
        .map(measurement => measurement.session_id)
    );

    const allowedSessions = sessions
      .filter(session => allowedSessionIds.has(session.session_id))
      .map(session => ({
        ...session,
        measurements: measurements
          .filter(measurement => measurement.session_id === session.session_id)
          .map(toCustomerMeasurement),
      }));

    res.status(200).json({
      ok: true,
      configured: true,
      sessions: allowedSessions,
    });
  } catch (error) {
    res.status(502).json({
      ok: false,
      configured: true,
      error: error.message || 'Customer login failed',
    });
  }
}
