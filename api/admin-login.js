import crypto from 'crypto';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

const parseRequestBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body);
  return body;
};

const base64UrlJson = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

const sign = (payload, secret) => (
  crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url')
);

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
    const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const adminPassword = String(process.env.ADMIN_PASSWORD || '');
    const adminSecret = String(process.env.ADMIN_SESSION_SECRET || '');

    if (!adminEmail || !adminPassword || !adminSecret) {
      res.status(200).json({
        ok: false,
        configured: false,
        reason: 'Set ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_SESSION_SECRET to enable admin login.',
      });
      return;
    }

    const body = parseRequestBody(req.body);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (email !== adminEmail || password !== adminPassword) {
      res.status(401).json({ ok: false, configured: true, error: 'Invalid admin credentials' });
      return;
    }

    const expiresAt = Date.now() + TOKEN_TTL_MS;
    const payload = base64UrlJson({ role: 'admin', email, exp: expiresAt });
    const token = `${payload}.${sign(payload, adminSecret)}`;

    res.status(200).json({
      ok: true,
      configured: true,
      token,
      expiresAt,
      adminEmail: email,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      configured: true,
      error: error.message || 'Admin login failed',
    });
  }
}
