// /api/upload
// Accepts a JSON body with { filename, contentType, dataBase64 } from an
// authenticated client and uploads the decoded bytes to Vercel Blob.
import { put } from '@vercel/blob';
import { isAuthed, readJsonBody } from './_auth.js';

export const config = {
  api: { bodyParser: { sizeLimit: '4.5mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'BLOB_READ_WRITE_TOKEN not set on this deployment' });
  }
  if (!isAuthed(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const body = readJsonBody(req);
    const { filename, contentType, dataBase64 } = body;

    if (!filename || !dataBase64) {
      return res.status(400).json({ error: 'missing filename or dataBase64' });
    }

    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length > 4.4 * 1024 * 1024) {
      return res.status(413).json({ error: 'file too large after compression — try a smaller photo' });
    }

    const safeName = filename.replace(/[^a-zA-Z0-9._/-]/g, '_');
    const result = await put(safeName, buffer, {
      access: 'public',
      contentType: contentType || 'image/jpeg',
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return res.status(200).json({ url: result.url, pathname: result.pathname });
  } catch (err) {
    console.error('upload error:', err);
    return res.status(500).json({ error: err?.message || 'upload failed' });
  }
}
