'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BrandMark, useSettings } from '@/components/BrandProvider';

function AccessForm() {
  const params = useSearchParams();
  const { settings } = useSettings();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    if (res.ok) {
      const next = params.get('next') || '/';
      // Only allow same-site relative redirects.
      window.location.href = next.startsWith('/') && !next.startsWith('//') ? next : '/';
      return;
    }
    const j = await res.json().catch(() => ({}));
    setError(j.error || 'Could not verify the code.');
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand to-slate-900 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark size={56} />
          <h1 className="mt-4 text-xl font-bold">{settings.conference_name}</h1>
          <p className="mt-1 text-sm text-slate-500">Enter the conference access code to continue.</p>
        </div>
        <label className="label" htmlFor="code">Access code</label>
        <input id="code" className="input" type="password" autoFocus autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="••••••••" />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button className="btn btn-primary mt-5 w-full" disabled={busy || !code}>{busy ? 'Checking…' : 'Enter'}</button>
        <p className="mt-4 text-center text-xs text-slate-400">Codes are provided by High Command.</p>
      </form>
    </main>
  );
}

export default function AccessPage() {
  return (
    <Suspense fallback={null}>
      <AccessForm />
    </Suspense>
  );
}
