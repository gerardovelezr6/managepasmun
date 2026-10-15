'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/lib/types';

interface AuthCtx {
  session: Session | null;
  profile: Profile | null;
  chairOf: string[];
  loading: boolean;
  isHC: boolean;
  canRun: (committeeId: string) => boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null,
  profile: null,
  chairOf: [],
  loading: true,
  isHC: false,
  canRun: () => false,
  signOut: async () => {},
  refresh: async () => {},
});

export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [chairOf, setChairOf] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId?: string) => {
    if (!userId) {
      setProfile(null);
      setChairOf([]);
      return;
    }
    const sb = supabase();
    const [{ data: p }, { data: cc }] = await Promise.all([
      sb.from('profiles').select('*').eq('id', userId).maybeSingle(),
      sb.from('committee_chairs').select('committee_id').eq('user_id', userId),
    ]);
    setProfile((p as Profile) || null);
    setChairOf((cc || []).map((r: any) => r.committee_id));
  }, []);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Defer: calling Supabase inside this callback can deadlock the auth lock.
      setTimeout(() => loadProfile(s?.user.id), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value = useMemo<AuthCtx>(() => {
    const isHC = profile?.role === 'high_command';
    return {
      session,
      profile,
      chairOf,
      loading,
      isHC,
      canRun: (id) => isHC || (profile?.role === 'chair' && chairOf.includes(id)),
      signOut: async () => {
        await supabase().auth.signOut();
        setProfile(null);
        setChairOf([]);
      },
      refresh: async () => loadProfile(session?.user.id),
    };
  }, [session, profile, chairOf, loading, loadProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
