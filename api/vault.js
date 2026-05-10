// /api/vault
// Returns the vault JSON only to authenticated users (Em & Trish).
// The static file at /data/vault.json is rewritten to this endpoint via
// vercel.json so direct URL access also goes through the auth gate.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isAuthed } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  if (!isAuthed(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const filePath = join(process.cwd(), 'data', 'vault.json');
    const content = await readFile(filePath, 'utf8');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(content);
  } catch (err) {
    console.error('vault read error:', err);
    return res.status(500).json({ error: 'could not read vault data' });
  }
}
