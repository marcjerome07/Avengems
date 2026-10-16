import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY. Copy server/.env.example to server/.env and fill it in.');
}
if (new URL(SUPABASE_URL).pathname !== '/') {
  throw new Error('SUPABASE_URL must be just https://<project-id>.supabase.co, without /rest/v1 or any other path.');
}

/**
 * Server-side Supabase client. Uses the SECRET key, which bypasses Row Level Security,
 * so it must never be sent to the browser. Every route is responsible for checking
 * who the user is and what they may access.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
