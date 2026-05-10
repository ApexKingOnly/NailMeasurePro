import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const DEFAULT_SESSIONS_TABLE = 'customer_nail_sessions';
const DEFAULT_MEASUREMENTS_TABLE = 'customer_nail_measurements';
const DEFAULT_IMAGES_BUCKET = 'customer-nail-images';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BASE64_LENGTH = 7_000_000;
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

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const sanitizePathSegment = (value, fallback) => (
  String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || fallback
);

const parseImage = (image) => {
  const raw = String(image || '');
  const match = raw.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  const mime = match?.[1] || 'image/jpeg';
  const base64 = match?.[2] || raw;

  if (!base64 || base64.length > MAX_BASE64_LENGTH || !/^[a-zA-Z0-9+/=\s]+$/.test(base64)) {
    return null;
  }

  const buffer = Buffer.from(base64.replace(/\s/g, ''), 'base64');
  if (!buffer.length) return null;

  const extension = mime.includes('png')
    ? 'png'
    : mime.includes('webp')
      ? 'webp'
      : 'jpg';

  return { buffer, mime, extension };
};

const normalizeFrame = (frame) => {
  const width = toFiniteNumber(frame?.width);
  const height = toFiniteNumber(frame?.height);
  const zoom = toFiniteNumber(frame?.zoom) || 1;
  if (!width || !height) return null;

  return {
    width,
    height,
    zoom,
    camera: frame?.camera || null,
    quality: frame?.quality || null,
    fitContext: frame?.fitContext || null,
    captureLayout: frame?.captureLayout || null,
  };
};

const getSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sessionsTable = process.env.CUSTOMER_NAIL_SESSIONS_TABLE || DEFAULT_SESSIONS_TABLE;
  const measurementsTable = process.env.CUSTOMER_NAIL_MEASUREMENTS_TABLE || DEFAULT_MEASUREMENTS_TABLE;
  const imagesBucket = process.env.CUSTOMER_NAIL_IMAGES_BUCKET || DEFAULT_IMAGES_BUCKET;

  if (!url || !serviceRoleKey) {
    return { configured: false, sessionsTable, measurementsTable, imagesBucket };
  }

  return { configured: true, url, serviceRoleKey, sessionsTable, measurementsTable, imagesBucket };
};

const normalizeMeasurement = (measurement, index, context = {}) => {
  const fingerName = String(measurement?.fingerName || '').trim();
  const size = String(measurement?.size || '').trim();
  const mm = toFiniteNumber(measurement?.mm);
  const shotNumber = toFiniteNumber(measurement?.shotNumber) || index + 1;
  const frame = normalizeFrame(measurement?.frame);

  if (frame && context.passwordHash) frame.customerPasswordHash = context.passwordHash;
  if (frame && context.passwordHash) frame.customerAccessHash = context.passwordHash;
  if (frame && context.fitContext && !frame.fitContext) frame.fitContext = context.fitContext;

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
    frame,
    captured_at: Number.isNaN(Date.parse(measurement?.capturedAt))
      ? new Date().toISOString()
      : new Date(measurement.capturedAt).toISOString(),
    image: measurement?.image || null,
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
    const passwordHash = hashCustomerPassword(customerEmailNormalized, body.password || body.accessCode);
    const fitContext = body.fitContext || null;
    const measurements = Array.isArray(body.measurements)
      ? body.measurements.map((measurement, index) => normalizeMeasurement(measurement, index, { passwordHash, fitContext })).filter(Boolean)
      : [];

    if (!sessionId || !EMAIL_PATTERN.test(customerEmailNormalized) || !passwordHash || !measurements.length) {
      res.status(400).json({
        ok: false,
        error: 'Valid sessionId, customerEmail, password, and at least one measurement are required',
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

    const sessionPath = sanitizePathSegment(sessionId, 'session');
    const measurementRows = await Promise.all(measurements.map(async (measurement) => {
      const { image, ...row } = measurement;
      const fingerPath = sanitizePathSegment(row.finger_name, 'finger');
      const parsedImage = parseImage(image);

      if (parsedImage) {
        const imagePath = `${sessionPath}/${String(row.shot_number).padStart(2, '0')}-${fingerPath}.${parsedImage.extension}`;
        const upload = await supabase.storage
          .from(config.imagesBucket)
          .upload(imagePath, parsedImage.buffer, {
            contentType: parsedImage.mime,
            upsert: true,
          });

        if (upload.error) {
          throw new Error(`Customer nail image upload failed: ${upload.error.message}`);
        }

        row.image_bucket = config.imagesBucket;
        row.image_path = imagePath;
        row.image_mime = parsedImage.mime;
      }

      return {
        ...row,
        session_id: sessionId,
        updated_at: now,
      };
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
