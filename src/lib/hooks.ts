'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { syncClock } from './clock';
import { toastError } from './toast';
import { Committee, CommitteeState, RubricLevel } from './types';
import { useSettings } from '@/components/BrandProvider';

const uid = () => Math.random().toString(36).slice(2, 10);

// The API returns at most 1000 rows per request, so page through bigger tables.
const PAGE = 1000;
export async function fetchAllRows<T = any>(build: () => any): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...((data || []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

export function useTick(ms = 250) {
  const [, set] = useState(0);
  useEffect(() => {
    const i = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(i);
  }, [ms]);
}

// Keeps the local clock aligned with the database server clock.
export function useClockSync() {
  useEffect(() => {
    syncClock();
    const i = setInterval(syncClock, 5 * 60 * 1000);
    return () => clearInterval(i);
  }, []);
}

// Rows of a committee-scoped table, kept live through Supabase Realtime.
export function useRows<T>(table: string, committeeId: string | null | undefined, orderCol = 'created_at', ascending = true) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!committeeId) return;
    let alive = true;
    let timer: any;
    const sb = supabase();
    const load = async () => {
      let data: T[] = [];
      try {
        data = await fetchAllRows<T>(() => sb.from(table).select('*').eq('committee_id', committeeId).order(orderCol, { ascending }));
      } catch (error) {
        if (alive) toastError(error);
      }
      if (!alive) return;
      setRows(data);
      setLoading(false);
    };
    loadRef.current = load;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 60);
    };
    load();
    const ch = sb
      .channel(`${table}-${committeeId}-${uid()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `committee_id=eq.${committeeId}` }, schedule)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') load();
      });
    return () => {
      alive = false;
      clearTimeout(timer);
      sb.removeChannel(ch);
    };
  }, [table, committeeId, orderCol, ascending]);

  return { rows, loading, reload: () => loadRef.current() };
}

export function useCommitteeState(committeeId: string) {
  const [state, setState] = useState<CommitteeState | null>(null);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true;
    const sb = supabase();
    const load = async () => {
      const { data } = await sb.from('committee_state').select('*').eq('committee_id', committeeId).maybeSingle();
      if (alive && data) setState(data as CommitteeState);
    };
    refreshRef.current = load;
    load();
    const ch = sb
      .channel(`state-${committeeId}-${uid()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'committee_state', filter: `committee_id=eq.${committeeId}` }, (p: any) => {
        if (p.new && Object.keys(p.new).length) setState(p.new as CommitteeState);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') load();
      });
    return () => {
      alive = false;
      sb.removeChannel(ch);
    };
  }, [committeeId]);

  const update = useCallback(
    async (patch: Partial<CommitteeState>) => {
      setState((s) => (s ? { ...s, ...patch } : s)); // optimistic
      const { error } = await supabase()
        .from('committee_state')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('committee_id', committeeId);
      if (error) toastError(error);
      return !error;
    },
    [committeeId]
  );

  return { state, update, refresh: () => refreshRef.current() };
}

export function useCommittee(committeeId: string) {
  const [committee, setCommittee] = useState<Committee | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    const sb = supabase();
    const load = async () => {
      const { data } = await sb.from('committees').select('*').eq('id', committeeId).maybeSingle();
      if (!alive) return;
      if (data) setCommittee(data as Committee);
      else setMissing(true);
    };
    load();
    const ch = sb
      .channel(`committee-${committeeId}-${uid()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'committees', filter: `id=eq.${committeeId}` }, load)
      .subscribe();
    return () => {
      alive = false;
      sb.removeChannel(ch);
    };
  }, [committeeId]);
  return { committee, missing };
}

// Reload a function whenever any of the listed tables change (unfiltered). Used by admin views.
export function useLiveReload(tables: string[], load: () => void) {
  const loadRef = useRef(load);
  loadRef.current = load;
  const key = tables.join(',');
  useEffect(() => {
    const sb = supabase();
    let timer: any;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => loadRef.current(), 150);
    };
    loadRef.current();
    let ch = sb.channel(`live-${key}-${uid()}`);
    for (const t of tables) ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, schedule);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') schedule();
    });
    return () => {
      clearTimeout(timer);
      sb.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

// Grading rubric levels (staff only) plus the points awarded per explanation given.
export function useRubric() {
  const [levels, setLevels] = useState<RubricLevel[]>([]);
  const { settings } = useSettings();
  const load = useCallback(async () => {
    const { data } = await supabase().from('rubric_levels').select('*').order('sort');
    setLevels((data || []) as RubricLevel[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { levels, explanationPoints: Number(settings.explanation_points ?? 1), reload: load };
}
