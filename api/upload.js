// /api/upload
// Vercel Blob client-upload handshake. The browser calls this endpoint via the
// `upload()` helper from @vercel/blob/client; the server validates auth and
// returns a one-time signed token that allows direct browser-to-Blob upload.
import { handleUpload } from '@vercel/blob/client';
import { isAuthed, readJsonBody } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'BLOB_READ_WRITE_TOKEN not set on this deployment' });
  }

  try {
    const body = readJsonBody(req);
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        if (!isAuthed(req)) {
          throw new Error('unauthorized');
        }
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
          tokenPayload: JSON.stringify({}),
          maximumSizeInBytes: 10 * 1024 * 1024, // 10 MB after client-side resize
        };
      },
      onUploadCompleted: async () => {
        // No-op: we don't track upload completions server-side; the client posts
        // to /api/posts after the upload finishes with the resulting URL.
      },
    });
    return res.status(200).json(jsonResponse);
  } catch (err) {
    const msg = err?.message || 'upload error';
    const code = msg === 'unauthorized' ? 401 : 400;
    return res.status(code).json({ error: msg });
  }
}
