import crypto from 'crypto';

export const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
export const DEFAULT_ADMIN_ACCOUNTS_TABLE = 'admin_accounts';
export const ADMIN_NAME_PATTERN = /^[a-zA-Z0-9._-]{3,40}$/;

const PASSWORD_HASH_ALGORITHM = 'pbkdf2_sha256';
const PASSWORD_HASH_ITERATIONS = 210000;
const PASSWORD_HASH_LENGTH = 32;

export const parseRequestBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body);
  return body;
};

export const normalizeAdminName = (value) => String(value || '').trim().toLowerCase();

const base64UrlJson = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

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

export const createAdminToken = ({ name, role = 'admin' }, secret) => {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = base64UrlJson({ role, name, exp: expiresAt });
  return {
    token: `${payload}.${sign(payload, secret)}`,
    expiresAt,
  };
};

export const verifyAdminToken = (req) => {
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

  return { ok: true, name: claims.name || claims.email || 'admin', role: claims.role };
};

export const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto
    .pbkdf2Sync(password, salt, PASSWORD_HASH_ITERATIONS, PASSWORD_HASH_LENGTH, 'sha256')
    .toString('base64url');

  return `${PASSWORD_HASH_ALGORITHM}$${PASSWORD_HASH_ITERATIONS}$${salt}$${hash}`;
};

export const verifyPassword = (password, storedHash) => {
  const [algorithm, iterationsText, salt, expectedHash] = String(storedHash || '').split('$');
  const iterations = Number(iterationsText);

  if (
    algorithm !== PASSWORD_HASH_ALGORITHM ||
    !Number.isInteger(iterations) ||
    iterations <= 0 ||
    !salt ||
    !expectedHash
  ) {
    return false;
  }

  const actualHash = crypto
    .pbkdf2Sync(password, salt, iterations, PASSWORD_HASH_LENGTH, 'sha256')
    .toString('base64url');

  return timingSafeEqualText(actualHash, expectedHash);
};

export const getAdminAccountConfig = () => {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.ADMIN_ACCOUNTS_TABLE || DEFAULT_ADMIN_ACCOUNTS_TABLE;

  if (!url || !serviceRoleKey) {
    return { configured: false, table };
  }

  return { configured: true, url, serviceRoleKey, table };
};

export const toPublicAdminAccount = (account) => ({
  id: account.id,
  adminName: account.admin_name,
  role: account.role,
  active: account.active,
  createdAt: account.created_at,
  updatedAt: account.updated_at,
  createdBy: account.created_by,
  lastLoginAt: account.last_login_at,
  passwordChangedAt: account.password_changed_at,
});
