'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { BrandMark, useSettings } from '@/components/BrandProvider';

// Landing page for the emailed "set your password" link. Supabase puts the recovery token in the
// URL; the client library turns it into a short-lived session, which lets the user pick a password.
export default function SetPasswordPage() {
  const router = useRouter();
  const { settings } = useSettings();
  const [state, setState] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const [problem, setProblem] = useState('');
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
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      if (s && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) setState('ready');
    });
    // The token may already have been processed before this listener attached.
    const t = setTimeout(async () => {
      const { data } = await sb.auth.getSession();
      setState((cur) => (cur === 'ready' ? cur : data.session ? 'ready' : 'invalid'));
    }, 1500);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

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
          <h1 className="mt-4 text-xl font-bold">Set your password</h1>
          <p className="mt-1 text-sm text-slate-500">{settings.conference_name}</p>
        </div>

        {state === 'checking' && <p className="text-center text-sm text-slate-500">Checking your link…</p>}

        {state === 'invalid' && (
          <div className="space-y-3 text-sm">
            <p className="rounded-lg bg-amber-50 p-3 text-amber-800">{problem || 'This link has expired or was already used.'}</p>
            <p className="text-slate-600">Ask High Command to send you a new set-password email.</p>
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
