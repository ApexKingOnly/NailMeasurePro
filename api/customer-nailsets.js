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

const normalizeMeasurement = (measurement, index) => {
  const fingerName = String(measurement?.fingerName || '').trim();
  const size = String(measurement?.size || '').trim();
  const mm = toFiniteNumber(measurement?.mm);
  const shotNumber = toFiniteNumber(measurement?.shotNumber) || index + 1;

  if (!fingerName || !size || mm === null || mm <= 0) return null;

  return {
    finger_name: fingerName,
    shot_number: shotNumber,
    hand_side: String(measurement?.handSide || (shotNumber <= 5 ? 'left' : 'right')).toLowerCase(),
    measurement_mm: mm,
    nail_size: size,
    measurement_method: String(measurement?.method || 'assist'),
    quarter_pixels: toFiniteNumber(measurement?.quarterPixels),
    nail_pixels: toFiniteNumber(measurement?.nailPixels),
    guide: measurement?.guide || null,
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
    const body = parseRequestBody(req.body);
    const config = getSupabaseConfig();
    const customerEmail = String(body.customerEmail || '').trim();
    const customerEmailNormalized = normalizeEmail(customerEmail);
    const sessionId = String(body.sessionId || '').trim();
    const status = String(body.status || 'draft').trim().toLowerCase() === 'complete' ? 'complete' : 'draft';
    const measurements = Array.isArray(body.measurements)
      ? body.measurements.map(normalizeMeasurement).filter(Boolean)
      : [];

    if (!sessionId || !EMAIL_PATTERN.test(customerEmailNormalized) || !measurements.length) {
      res.status(400).json({
        ok: false,
        error: 'Valid sessionId, customerEmail, and at least one measurement are required',
      });
      return;
    }

    if (!config.configured) {
      res.status(200).json({
        ok: false,
        configured: false,
        accepted: true,
        reason: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to store customer nail sets.',
      });
      return;
    }

    const supabase = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const now = new Date().toISOString();

    const sessionUpsert = await supabase
      .from(config.sessionsTable)
      .upsert({
        session_id: sessionId,
        customer_email: customerEmail,
        customer_email_normalized: customerEmailNormalized,
        status,
        measurement_count: measurements.length,
        submitted_at: status === 'complete' ? now : null,
        updated_at: now,
      }, { onConflict: 'session_id' })
      .select('id, session_id')
      .single();

    if (sessionUpsert.error) {
      throw new Error(`Customer session save failed: ${sessionUpsert.error.message}`);
    }

    const measurementRows = measurements.map((measurement) => ({
      ...measurement,
      session_id: sessionId,
      updated_at: now,
    }));

    const measurementsUpsert = await supabase
      .from(config.measurementsTable)
      .upsert(measurementRows, { onConflict: 'session_id,finger_name' });

    if (measurementsUpsert.error) {
      throw new Error(`Customer measurement save failed: ${measurementsUpsert.error.message}`);
    }

    res.status(200).json({
      ok: true,
      configured: true,
      sessionId,
      savedMeasurements: measurements.length,
      status,
    });
  } catch (error) {
    res.status(502).json({
      ok: false,
      configured: true,
      error: error.message || 'Customer nail set save failed',
    });
  }
}
