// /api/auth
//   GET    → { authed: bool, configured: bool }
//   POST   { passcode } → 200 sets cookie, 401 wrong, 503 not configured
//   DELETE → clears cookie
import { expectedToken, isAuthed, setAuthCookie, clearAuthCookie, readJsonBody } from './_auth.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      authed: isAuthed(req),
      configured: Boolean(process.env.JOURNAL_PASSCODE),
    });
  }
  if (req.method === 'POST') {
    const body = readJsonBody(req);
    const passcode = String(body.passcode || '');
    const stored = process.env.JOURNAL_PASSCODE;
    if (!stored) {
      return res.status(503).json({ error: 'JOURNAL_PASSCODE env var is not set on this deployment.' });
    }
    if (passcode !== stored) {
      return res.status(401).json({ error: 'wrong passcode' });
    }
    setAuthCookie(res, expectedToken());
    return res.status(200).json({ ok: true, authed: true });
  }
  if (req.method === 'DELETE') {
    clearAuthCookie(res);
    return res.status(200).json({ ok: true, authed: false });
  }
  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).end();
}
