import { supabase } from './supabase';

let offset = 0;
let synced = false;

// Estimates (server time - local time) using the midpoint of a round trip.
export async function syncClock() {
  try {
    const t0 = Date.now();
    const { data, error } = await supabase().rpc('server_now');
    const t1 = Date.now();
    if (error || !data) return;
    offset = new Date(data as string).getTime() - (t0 + t1) / 2;
    synced = true;
  } catch {
    /* fall back to local clock */
  }
}

export const nowMs = () => Date.now() + offset;
export const clockSynced = () => synced;
