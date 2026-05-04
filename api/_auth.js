// Helpers shared across api/* routes. Files starting with _ aren't deployed.
import crypto from 'node:crypto';

const COOKIE_NAME = 'et_auth';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export function expectedToken() {
  const passcode = process.env.JOURNAL_PASSCODE;
  if (!passcode) return null;
  const secret = process.env.JOURNAL_AUTH_SECRET || passcode + '::em-trish-fixed-salt';
  return crypto.createHmac('sha256', secret).update('em-trish-poster-v1').digest('hex');
}

export function isAuthed(req) {
  const expected = expectedToken();
  if (!expected) return false;
  const cookie = req.headers.cookie || '';
  const m = cookie.match(new RegExp(COOKIE_NAME + '=([a-f0-9]+)'));
  if (!m) return false;
  const got = Buffer.from(m[1], 'utf8');
  const exp = Buffer.from(expected, 'utf8');
  if (got.length !== exp.length) return false;
  try {
    return crypto.timingSafeEqual(got, exp);
  } catch {
    return false;
  }
}

export function setAuthCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`
  );
}

export function clearAuthCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}

export function readJsonBody(req) {
  // Vercel parses JSON body when content-type is application/json
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}
