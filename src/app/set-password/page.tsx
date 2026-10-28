'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { BrandMark, useSettings } from '@/components/BrandProvider';

// Landing page for the emailed "set your password" link. Supabase puts the recovery token in the
// URL; the client library turns it into a short-lived session, which lets the user pick a password.
export default function SetPasswordPage() {
  const router = useRouter();
  const { settings } = useSettings();
  const [state, setState] = useState<'checking' | 'confirm' | 'ready' | 'invalid'>('checking');
  const [tokenInfo, setTokenInfo] = useState<{ hash: string; type: 'invite' | 'recovery' } | null>(null);
  const [problem, setProblem] = useState('');
  // Set only for a brand-new invitation (never for a forgotten-password link): the person's name for the greeting.
  const [welcome, setWelcome] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = supabase();
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const expired = hash.get('error_description') || new URLSearchParams(window.location.search).get('error_description');
    if (expired) {
      setProblem(expired.replace(/\+/g, ' '));
      setState('invalid');
      return;
    }
    // New-style link: the token is only spent when the person presses the button below.
    const q = new URLSearchParams(window.location.search);
    const th = q.get('token_hash');
    if (th) {
      setTokenInfo({ hash: th, type: q.get('type') === 'recovery' ? 'recovery' : 'invite' });
      setState('confirm');
      return;
    }
    const ready = (s: Session) => {
      const meta = s.user.user_metadata || {};
      if (meta.invited_at && !meta.password_set_at) setWelcome(String(meta.full_name || '').trim() || '');
      setState('ready');
    };
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      if (s && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) ready(s);
    });
    // The token may already have been processed before this listener attached.
    const t = setTimeout(async () => {
      const { data } = await sb.auth.getSession();
      if (data.session) ready(data.session);
      else setState((cur) => (cur === 'ready' ? cur : 'invalid'));
    }, 1500);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  async function confirmLink() {
    if (!tokenInfo) return;
    setBusy(true);
    const { data, error } = await supabase().auth.verifyOtp({ token_hash: tokenInfo.hash, type: tokenInfo.type });
    setBusy(false);
    if (error || !data.session) {
      setProblem(error?.message || '');
      setState('invalid');
      return;
    }
    const meta = data.session.user.user_metadata || {};
    if (meta.invited_at && !meta.password_set_at) setWelcome(String(meta.full_name || '').trim() || '');
    window.history.replaceState(null, '', '/set-password');
    setState('ready');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (pw.length < 8) return setError('Use at least 8 characters.');
    if (pw !== pw2) return setError('The two passwords do not match.');
    setBusy(true);
    const { error } = await supabase().auth.updateUser({ password: pw, data: { password_set_at: new Date().toISOString() } });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.replace('/dashboard');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm card p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark size={52} />
          <h1 className="mt-4 text-xl font-bold">{welcome !== null ? (welcome ? `Welcome, ${welcome}!` : 'Welcome!') : 'Set your password'}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {welcome !== null ? `You have been invited to ${settings.conference_name}. Choose a password to finish setting up your account.` : settings.conference_name}
          </p>
        </div>

        {state === 'checking' && <p className="text-center text-sm text-slate-500">Checking your link…</p>}

        {state === 'confirm' && (
          <div className="space-y-3 text-center text-sm">
            <p className="text-slate-600">Press the button to continue and choose your password.</p>
            <button className="btn btn-primary w-full" disabled={busy} onClick={confirmLink}>{busy ? 'Checking…' : 'Continue'}</button>
          </div>
        )}

        {state === 'invalid' && (
          <div className="space-y-3 text-sm">
            <p className="rounded-lg bg-amber-50 p-3 text-amber-800">{problem || 'This link has expired or was already used.'}</p>
            <p className="text-slate-600">Ask High Command for a new link.</p>
            <a href="/login" className="btn btn-secondary w-full">Go to login</a>
          </div>
        )}

        {state === 'ready' && (
          <form onSubmit={submit}>
            <label className="label" htmlFor="pw">New password</label>
            <input id="pw" className="input" type="password" autoComplete="new-password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} />
            <label className="label mt-4" htmlFor="pw2">Repeat password</label>
            <input id="pw2" className="input" type="password" autoComplete="new-password" minLength={8} required value={pw2} onChange={(e) => setPw2(e.target.value)} />
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <button className="btn btn-primary mt-5 w-full" disabled={busy}>{busy ? 'Saving…' : 'Save password and sign in'}</button>
          </form>
        )}
      </div>
    </main>
  );
}
