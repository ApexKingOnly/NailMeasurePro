import { createClient } from '@supabase/supabase-js';
import { parseRequestBody, verifyAdminToken } from './admin-auth.js';

const DEFAULT_SESSIONS_TABLE = 'customer_nail_sessions';
const DEFAULT_MEASUREMENTS_TABLE = 'customer_nail_measurements';
const DEFAULT_TRAINING_TABLE = 'nail_training_labels';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizePoint = (point) => {
  const x = toFiniteNumber(point?.x);
  const y = toFiniteNumber(point?.y);
  if (x === null || y === null) return null;
  return { x, y };
};

const normalizeGuide = (guide) => {
  const quarterX = toFiniteNumber(guide?.quarter?.x);
  const quarterY = toFiniteNumber(guide?.quarter?.y);
  const quarterR = toFiniteNumber(guide?.quarter?.r);
  const nailLeft = normalizePoint(guide?.nail?.left);
  const nailRight = normalizePoint(guide?.nail?.right);

  if (
    quarterX === null ||
    quarterY === null ||
    quarterR === null ||
    quarterR <= 0 ||
    !nailLeft ||
    !nailRight
  ) {
    return null;
  }

  return {
    quarter: { x: quarterX, y: quarterY, r: quarterR },
    nail: { left: nailLeft, right: nailRight },
  };
};

const getSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sessionsTable = process.env.CUSTOMER_NAIL_SESSIONS_TABLE || DEFAULT_SESSIONS_TABLE;
  const measurementsTable = process.env.CUSTOMER_NAIL_MEASUREMENTS_TABLE || DEFAULT_MEASUREMENTS_TABLE;
  const trainingTable = process.env.SUPABASE_TRAINING_TABLE || DEFAULT_TRAINING_TABLE;

  if (!url || !serviceRoleKey) {
    return { configured: false, sessionsTable, measurementsTable, trainingTable };
  }

  return { configured: true, url, serviceRoleKey, sessionsTable, measurementsTable, trainingTable };
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

        const rawMeasurements = measurementsResult.data || [];
        measurements = await Promise.all(rawMeasurements.map(async (measurement) => {
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
      const guide = normalizeGuide(body.guide);
      const quarterPixels = toFiniteNumber(body.quarterPixels);
      const nailPixels = toFiniteNumber(body.nailPixels);

      if (!measurementId || !size || mm === null || mm <= 0) {
        res.status(400).json({ ok: false, configured: true, error: 'Valid measurementId, size, and mm are required' });
        return;
      }

      const update = {
        nail_size: size,
        measurement_mm: mm,
        admin_note: adminNote || null,
        admin_email: admin.name,
        admin_edited_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (guide) update.guide = guide;
      if (quarterPixels !== null && quarterPixels > 0) update.quarter_pixels = quarterPixels;
      if (nailPixels !== null && nailPixels > 0) update.nail_pixels = nailPixels;

      const updateResult = await supabase
        .from(config.measurementsTable)
        .update(update)
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

      let trainingLogged = false;
      if (
        guide &&
        updateResult.data?.image_bucket &&
        updateResult.data?.image_path &&
        updateResult.data?.frame
      ) {
        const trainingInsert = await supabase
          .from(config.trainingTable)
          .insert({
            session_id: updateResult.data.session_id,
            finger_name: updateResult.data.finger_name,
            shot_number: updateResult.data.shot_number,
            hand_side: updateResult.data.hand_side,
            captured_at: new Date().toISOString(),
            measurement_mm: mm,
            nail_size: size,
            measurement_method: 'admin-correction',
            image_bucket: updateResult.data.image_bucket,
            image_path: updateResult.data.image_path,
            image_mime: updateResult.data.image_mime,
            frame: updateResult.data.frame,
            guide,
            ai: { status: 'admin-correction', label: 'ADMIN' },
            measurement: {
              mm,
              size,
              method: 'admin-correction',
              quarterPixels: updateResult.data.quarter_pixels,
              nailPixels: updateResult.data.nail_pixels,
            },
            source: 'admin-correction',
            app_version: 'admin-portal-v1',
            reviewed: true,
          });

        trainingLogged = !trainingInsert.error;
      }

      res.status(200).json({
        ok: true,
        configured: true,
        measurement: updateResult.data,
        trainingLogged,
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
