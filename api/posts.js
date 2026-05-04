// /api/posts
//   GET  → { posts: [...] } (open to all)
//   POST { author, caption, photo_url, location } → creates post (auth required)
import crypto from 'node:crypto';
import { isAuthed, readJsonBody } from './_auth.js';
import { getPosts, setPosts, isStorageReady } from './_kv.js';

const TRIP_START = '2026-05-07';
const TRIP_END = '2026-05-26';

function dayNumber(now = new Date()) {
  const start = new Date(TRIP_START + 'T00:00:00Z');
  const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z');
  if (today < start) return 0;
  if (today > new Date(TRIP_END + 'T00:00:00Z')) return null;
  return Math.floor((today - start) / 86400000) + 1;
}

function clean(str, max = 5000) {
  return String(str || '').slice(0, max).trim();
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const posts = await getPosts();
    if (posts === null) {
      return res.status(503).json({ error: 'storage not configured', posts: [] });
    }
    return res.status(200).json({ posts });
  }

  if (req.method === 'POST') {
    if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
    if (!isStorageReady()) return res.status(503).json({ error: 'storage not configured' });

    const body = readJsonBody(req);
    const author = clean(body.author, 24) || 'anonymous';
    const caption = clean(body.caption, 1500);
    const photo_url = clean(body.photo_url, 500) || null;
    const location = clean(body.location, 80) || null;

    if (!caption && !photo_url) {
      return res.status(400).json({ error: 'need caption or photo' });
    }

    const post = {
      id: crypto.randomUUID(),
      author,
      caption,
      photo_url,
      location,
      day_number: dayNumber(),
      created_at: new Date().toISOString(),
      comments: [],
    };

    const posts = (await getPosts()) || [];
    posts.unshift(post);
    await setPosts(posts);
    return res.status(200).json({ post });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
}
