// /api/posts/[id]/comments
//   POST { name, text } → adds comment to post (open, no auth)
import crypto from 'node:crypto';
import { readJsonBody } from '../../_auth.js';
import { getPosts, setPosts, isStorageReady } from '../../_kv.js';

function clean(str, max) {
  return String(str || '').slice(0, max).trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  if (!isStorageReady()) return res.status(503).json({ error: 'storage not configured' });

  const id = req.query?.id;
  if (!id) return res.status(400).json({ error: 'missing post id' });

  const body = readJsonBody(req);
  const name = clean(body.name, 40);
  const text = clean(body.text, 500);
  if (!name || !text) return res.status(400).json({ error: 'name and text are required' });

  const posts = (await getPosts()) || [];
  const post = posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'post not found' });

  const comment = {
    id: crypto.randomUUID(),
    name,
    text,
    created_at: new Date().toISOString(),
  };
  post.comments = post.comments || [];
  post.comments.push(comment);
  await setPosts(posts);

  return res.status(200).json({ comment, post });
}
