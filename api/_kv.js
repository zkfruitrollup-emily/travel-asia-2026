// Connects to whichever Redis the Vercel project has — Upstash, Redis Cloud,
// or any other provider that exposes a standard redis:// (or rediss://) URL.
// We auto-detect any env var ending in _REDIS_URL.
import Redis from 'ioredis';

let _client = null;

function findRedisUrl() {
  const env = process.env;
  if (env.REDIS_URL && env.REDIS_URL.startsWith('redis')) return env.REDIS_URL;
  for (const key of Object.keys(env)) {
    if (/_REDIS_URL$/.test(key)) {
      const v = env[key];
      if (typeof v === 'string' && v.startsWith('redis')) return v;
    }
  }
  return null;
}

function getClient() {
  if (_client) return _client;
  const url = findRedisUrl();
  if (!url) return null;
  _client = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    connectTimeout: 5000,
  });
  // Don't crash the function on a transient connection error; the request
  // will surface the failure naturally.
  _client.on('error', (e) => console.error('redis error:', e?.message || e));
  return _client;
}

const POSTS_KEY = 'journal:posts:v1';

export async function getPosts() {
  const r = getClient();
  if (!r) return null;
  const value = await r.get(POSTS_KEY);
  if (!value) return [];
  try {
    const arr = JSON.parse(value);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function setPosts(posts) {
  const r = getClient();
  if (!r) throw new Error('redis not configured');
  await r.set(POSTS_KEY, JSON.stringify(posts));
}

export function isStorageReady() {
  return Boolean(getClient());
}
