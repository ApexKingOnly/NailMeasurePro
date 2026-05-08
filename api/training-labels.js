import { createClient } from '@supabase/supabase-js';

const MAX_BASE64_LENGTH = 7_000_000;
const DEFAULT_BUCKET = 'nail-training-images';
const DEFAULT_TABLE = 'nail_training_labels';

const parseRequestBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body);
  return body;
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

const normalizeMeasurement = (measurement) => {
  const mm = toFiniteNumber(measurement?.mm);
  const quarterPixels = toFiniteNumber(measurement?.quarterPixels);
  const nailPixels = toFiniteNumber(measurement?.nailPixels);
  const size = String(measurement?.size || '').trim();

  if (mm === null || mm <= 0 || !size) return null;

  return {
    mm,
    size,
    method: String(measurement?.method || 'assist'),
    quarterPixels,
    nailPixels,
  };
};

const normalizeFrame = (frame) => {
  const width = toFiniteNumber(frame?.width);
  const height = toFiniteNumber(frame?.height);
  const zoom = toFiniteNumber(frame?.zoom) || 1;
  if (!width || !height) return null;
  return { width, height, zoom };
};

const getSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_TRAINING_BUCKET || DEFAULT_BUCKET;
  const table = process.env.SUPABASE_TRAINING_TABLE || DEFAULT_TABLE;

  if (!url || !serviceRoleKey) {
    return { configured: false, bucket, table };
  }

  return { configured: true, url, serviceRoleKey, bucket, table };
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
    const image = parseImage(body.image);
    const guide = normalizeGuide(body.guide);
    const measurement = normalizeMeasurement(body.measurement);
    const frame = normalizeFrame(body.frame);
    const sessionId = String(body.sessionId || '').trim();
    const fingerName = String(body.fingerName || '').trim();
    const shotNumber = toFiniteNumber(body.shotNumber);
    const handSide = String(body.handSide || '').trim().toLowerCase();
    const capturedAt = Number.isNaN(Date.parse(body.capturedAt))
      ? new Date().toISOString()
      : new Date(body.capturedAt).toISOString();

    if (!image || !guide || !measurement || !frame || !sessionId || !fingerName || !shotNumber) {
      res.status(400).json({
        ok: false,
        error: 'Valid image, guide, measurement, frame, sessionId, fingerName, and shotNumber are required',
      });
      return;
    }

    if (!config.configured) {
      res.status(200).json({
        ok: false,
        configured: false,
        accepted: true,
        reason: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to store training labels.',
      });
      return;
    }

    const supabase = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const sessionPath = sanitizePathSegment(sessionId, 'session');
    const fingerPath = sanitizePathSegment(fingerName, 'finger');
    const imagePath = `${sessionPath}/${Date.now()}-${String(shotNumber).padStart(2, '0')}-${fingerPath}.${image.extension}`;

    const upload = await supabase.storage
      .from(config.bucket)
      .upload(imagePath, image.buffer, {
        contentType: image.mime,
        upsert: false,
      });

    if (upload.error) {
      throw new Error(`Training image upload failed: ${upload.error.message}`);
    }

    const insert = await supabase
      .from(config.table)
      .insert({
        session_id: sessionId,
        finger_name: fingerName,
        shot_number: shotNumber,
        hand_side: handSide || null,
        captured_at: capturedAt,
        measurement_mm: measurement.mm,
        nail_size: measurement.size,
        measurement_method: measurement.method,
        image_bucket: config.bucket,
        image_path: imagePath,
        image_mime: image.mime,
        frame,
        guide,
        ai: body.ai || null,
        measurement,
        source: body.source || 'assist-correction',
        app_version: body.appVersion || null,
      })
      .select('id')
      .single();

    if (insert.error) {
      throw new Error(`Training label insert failed: ${insert.error.message}`);
    }

    res.status(201).json({
      ok: true,
      configured: true,
      id: insert.data?.id || null,
      imagePath,
      bucket: config.bucket,
    });
  } catch (error) {
    res.status(502).json({
      ok: false,
      configured: true,
      error: error.message || 'Training label save failed',
    });
  }
}
