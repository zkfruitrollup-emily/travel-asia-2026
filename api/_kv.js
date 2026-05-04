// Thin wrapper around @upstash/redis so api/* routes can do journal storage
// without each one re-instantiating. Vercel auto-injects the env vars when you
// add the "Upstash for Redis" integration on the project.
import { Redis } from '@upstash/redis';

let _client = null;

function getClient() {
  if (_client) return _client;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  _client = Redis.fromEnv();
  return _client;
}

const POSTS_KEY = 'journal:posts:v1';

export async function getPosts() {
  const r = getClient();
  if (!r) return null;
  const value = await r.get(POSTS_KEY);
  return Array.isArray(value) ? value : [];
}

export async function setPosts(posts) {
  const r = getClient();
  if (!r) throw new Error('redis not configured');
  await r.set(POSTS_KEY, posts);
}

export function isStorageReady() {
  return Boolean(getClient());
}
